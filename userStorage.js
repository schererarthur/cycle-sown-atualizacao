// ============================================================================
// userStorage.js — isola os dados de usuário dentro do localStorage
// compartilhado do navegador, para que contas diferentes não enxerguem os
// dados umas das outras.
//
// Estratégia de prefixo: toda chave passada para userStorage.setItem/getItem
// é gravada como `user:<id>:<chave>` no localStorage real. `<id>` vem do
// usuário logado (ver resolveCurrentUserId abaixo). Sem usuário logado, não
// existe onde gravar com segurança — getItem retorna null e setItem não
// grava nada (silencioso, só um aviso no console), em vez de vazar dados
// para uma chave global sem dono.
//
// Como descobrimos o usuário logado: login.html/register.html (js/auth.js)
// já salvam `cycleSownUser` (JSON com {id, name, email}) e `cycleSownToken`
// (o JWT) no localStorage. Usamos o `id` de cycleSownUser diretamente — é
// mais simples e direto do que decodificar o JWT. Se por algum motivo
// cycleSownUser estiver ausente/corrompido mas o token existir, decodificamos
// o payload do JWT (base64 do meio) e usamos o claim `userId` de lá. Essas
// duas chaves (cycleSownToken/cycleSownUser) nunca são prefixadas — são geridas
// só por auth.js.
// ============================================================================

(function (global) {
    const LEGACY_KEYS = [
        'soilAnalysisReports',
        'soilAnalysisData',
        'cropCorrectionReports',
        'userProfile',
        'userSettings'
    ];

    function decodeJwtUserId(token) {
        try {
            const payloadPart = token.split('.')[1];
            if (!payloadPart) return null;
            const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
            const payload = JSON.parse(atob(padded));
            return payload.userId ?? payload.sub ?? null;
        } catch (err) {
            return null;
        }
    }

    function resolveCurrentUserId() {
        try {
            const rawUser = localStorage.getItem('cycleSownUser');
            if (rawUser) {
                const user = JSON.parse(rawUser);
                if (user && user.id !== undefined && user.id !== null) {
                    return String(user.id);
                }
                if (user && user.email) {
                    return `email:${user.email.toLowerCase()}`;
                }
            }
        } catch (err) {
            // rawUser corrompido, tenta o token abaixo
        }

        const token = localStorage.getItem('cycleSownToken');
        if (token) {
            const userId = decodeJwtUserId(token);
            if (userId !== null) return String(userId);
        }

        return null;
    }

    function scopedKey(userId, key) {
        return `user:${userId}:${key}`;
    }

    function migrateLegacyKeysIfNeeded(userId) {
        const migrationFlag = scopedKey(userId, '_migrated_v1');
        if (localStorage.getItem(migrationFlag)) return;

        LEGACY_KEYS.forEach((key) => {
            const legacyValue = localStorage.getItem(key);
            if (legacyValue !== null) {
                localStorage.setItem(scopedKey(userId, key), legacyValue);
                localStorage.removeItem(key);
            }
        });

        localStorage.setItem(migrationFlag, 'true');
    }

    function getCurrentUserId() {
        return resolveCurrentUserId();
    }

    function getItem(key) {
        const userId = resolveCurrentUserId();
        if (!userId) {
            console.warn(`userStorage: sem usuário logado, getItem('${key}') retornando null`);
            return null;
        }
        migrateLegacyKeysIfNeeded(userId);
        return localStorage.getItem(scopedKey(userId, key));
    }

    function setItem(key, value) {
        const userId = resolveCurrentUserId();
        if (!userId) {
            console.warn(`userStorage: sem usuário logado, setItem('${key}') ignorado`);
            return;
        }
        migrateLegacyKeysIfNeeded(userId);
        localStorage.setItem(scopedKey(userId, key), value);
    }

    function removeItem(key) {
        const userId = resolveCurrentUserId();
        if (!userId) return;
        localStorage.removeItem(scopedKey(userId, key));
    }

    // Apaga só os dados (chaves user:<id>:*) do usuário logado no momento —
    // usado pelo botão "Limpar Todos os Dados" em profile.html. Não mexe nos
    // dados de outras contas guardados no mesmo navegador.
    function clearCurrentUserData() {
        const userId = resolveCurrentUserId();
        if (!userId) return;
        const prefix = `user:${userId}:`;
        Object.keys(localStorage)
            .filter((k) => k.startsWith(prefix))
            .forEach((k) => localStorage.removeItem(k));
    }

    // Retorna {id, name, email} salvo por auth.js no login/cadastro, ou null.
    function getCurrentUser() {
        try {
            const rawUser = localStorage.getItem('cycleSownUser');
            return rawUser ? JSON.parse(rawUser) : null;
        } catch (err) {
            return null;
        }
    }

    // Apaga só a sessão (token + usuário logado), preservando os dados
    // prefixados `user:<id>:...` para quando essa conta logar de novo.
    function clearCurrentUser() {
        localStorage.removeItem('cycleSownToken');
        localStorage.removeItem('cycleSownUser');
    }

    // Logout completo: limpa a sessão e manda para a tela de login.
    function logout() {
        clearCurrentUser();
        window.location.href = 'login.html';
    }

    // Guarda de rota: chame no topo de páginas protegidas. Redireciona para
    // login.html se ninguém estiver logado.
    function requireAuth() {
        if (!getCurrentUserId()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    global.userStorage = {
        getItem,
        setItem,
        removeItem,
        clearCurrentUser,
        clearCurrentUserData,
        getCurrentUserId,
        getCurrentUser,
        logout,
        requireAuth
    };
})(window);
