// ============================================================================
// Funções de validação simples, sem dependências externas.
// São usadas pelas rotas de autenticação para rejeitar dados ruins ANTES
// de gastar uma consulta no banco.
// ============================================================================

// Regex simples de e-mail: "algo@algo.algo". Não cobre 100% da RFC de
// e-mails (nenhuma regex simples cobre), mas barra os erros mais comuns.
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Senha: mínimo 8 caracteres, com pelo menos 1 letra e 1 número.
function isValidPassword(password) {
    if (typeof password !== 'string' || password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
}

// Nome: pelo menos 2 caracteres depois de remover espaços nas pontas.
function isValidName(name) {
    return typeof name === 'string' && name.trim().length >= 2;
}

// Remove tudo que não for dígito — usado por CNPJ e telefone, que chegam
// do front-end já com a máscara (pontos, barra, hífen, parênteses).
function onlyDigits(value) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

// CNPJ: 14 dígitos + 2 dígitos verificadores calculados por módulo 11
// (mesmo algoritmo da Receita Federal). Sequências de um único dígito
// repetido (ex.: "00000000000000") passam essa conta por coincidência
// matemática mas nunca são CNPJs reais, então são rejeitadas à parte.
function isValidCNPJ(cnpj) {
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    const nums = digits.split('').map(Number);
    const calcCheckDigit = (base, weights) => {
        const sum = base.reduce((acc, digit, i) => acc + digit * weights[i], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    const d13 = calcCheckDigit(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d14 = calcCheckDigit(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return d13 === nums[12] && d14 === nums[13];
}

// Formata 14 dígitos já validados como "XX.XXX.XXX/XXXX-XX" — usado para
// gravar o CNPJ sempre no mesmo formato no banco, independente de como
// o front-end mandou (evita duplicados que só diferem na máscara).
function formatCNPJ(cnpj) {
    const d = onlyDigits(cnpj);
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

// Telefone/WhatsApp: 10 dígitos (fixo, com DDD) ou 11 (celular, com DDD).
function isValidPhone(phone) {
    const digits = onlyDigits(phone);
    return digits.length === 10 || digits.length === 11;
}

// Link de compra de produto: só http:// ou https://, com um domínio de
// verdade (ex.: "loja.com.br"). O mais importante é barrar `javascript:` e
// `data:` — esse texto vira o href do botão "Comprar" na vitrine, e um
// `javascript:...` ali executaria código no navegador do produtor (XSS).
// Também recusa usuário/senha embutidos (https://site.com@golpe.com), um
// truque comum de phishing para disfarçar o destino real do link.
function isValidHttpUrl(value) {
    if (typeof value !== 'string') return false;
    let url;
    try {
        url = new URL(value.trim());
    } catch (err) {
        return false;
    }
    return (url.protocol === 'http:' || url.protocol === 'https:')
        && url.hostname.includes('.')
        && !url.username && !url.password;
}

module.exports = {
    isValidEmail, isValidPassword, isValidName,
    onlyDigits, isValidCNPJ, formatCNPJ, isValidPhone, isValidHttpUrl
};
