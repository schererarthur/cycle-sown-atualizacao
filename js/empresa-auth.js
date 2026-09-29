// ============================================================================
// Cycle Sown — lógica das telas de empresa (empresa-register.html e
// empresa-login.html). Carregado DEPOIS de js/auth.js nessas páginas para
// reaproveitar os helpers genéricos já existentes (apiRequest, showMessage,
// hideMessage, setLoading, validateEmail, validatePassword) — sem duplicar
// o que já existe lá. initLoginPage()/initRegisterPage() (de auth.js) não
// fazem nada aqui porque procuram #loginForm/#registerForm, que não existem
// nestas páginas.
//
// Sessão de empresa fica em chaves PRÓPRIAS no localStorage
// (cycleSownEmpresaToken/cycleSownEmpresa), separadas de
// cycleSownToken/cycleSownUser do agricultor — são contas diferentes, e as
// páginas do agricultor (userStorage.js) checam especificamente as chaves
// dele para decidir se redirecionam para login.html.
// ============================================================================

const ESTADOS_BR = [
    ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'],
    ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'],
    ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'],
    ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
    ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
    ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'],
    ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins']
];

// ---------------------------------------------------------------------------
// Máscaras — todas seguem o mesmo padrão: lêem só os dígitos do valor atual
// e reconstroem o texto formatado a cada input, limitando ao nº de dígitos
// esperado.
// ---------------------------------------------------------------------------

function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function maskCNPJ(value) {
    const d = onlyDigits(value).slice(0, 14);
    let out = d;
    if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    if (d.length > 12) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return out;
}

function maskPhone(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCEP(value) {
    const d = onlyDigits(value).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// CNPJ: mesmo algoritmo (módulo 11) validado no servidor
// (backend/utils/validators.js) — replicado aqui só para dar feedback
// visual imediato (✓/✗), o cadastro real sempre é revalidado no backend.
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

function saveEmpresaSession(token, empresa) {
    localStorage.setItem('cycleSownEmpresaToken', token);
    localStorage.setItem('cycleSownEmpresa', JSON.stringify(empresa));
}

// ---------------------------------------------------------------------------
// empresa-register.html
// ---------------------------------------------------------------------------

function initEmpresaRegisterPage() {
    const form = document.getElementById('empresaRegisterForm');
    if (!form) return;

    const messageEl = document.getElementById('authMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    const estadoSelect = form.querySelector('#estado');
    if (estadoSelect) {
        ESTADOS_BR.forEach(([uf, nome]) => {
            const opt = document.createElement('option');
            opt.value = uf;
            opt.textContent = `${nome} (${uf})`;
            estadoSelect.appendChild(opt);
        });
    }

    // --- Tipo de empresa: pré-selecionado por ?tipo= na URL, mas trocável ---
    const typeButtons = form.querySelectorAll('.type-toggle button');
    const tipoInput = form.querySelector('#tipo');
    const insumosFields = document.getElementById('insumosFields');
    const compradoraFields = document.getElementById('compradoraFields');

    function setTipo(tipo) {
        tipoInput.value = tipo;
        typeButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tipo === tipo));
        if (insumosFields) insumosFields.hidden = tipo !== 'insumos';
        if (compradoraFields) compradoraFields.hidden = tipo !== 'compradora';
    }

    typeButtons.forEach((btn) => {
        btn.addEventListener('click', () => setTipo(btn.dataset.tipo));
    });

    const tipoFromUrl = new URLSearchParams(window.location.search).get('tipo');
    setTipo(tipoFromUrl === 'compradora' ? 'compradora' : 'insumos');

    // --- Máscaras + indicador de CNPJ válido/inválido ---
    const cnpjInput = form.querySelector('#cnpj');
    const cnpjStatus = document.getElementById('cnpjStatus');
    if (cnpjInput) {
        cnpjInput.addEventListener('input', () => {
            cnpjInput.value = maskCNPJ(cnpjInput.value);
            const digits = onlyDigits(cnpjInput.value);
            if (!digits) {
                cnpjStatus.className = 'field-status';
                return;
            }
            const valid = isValidCNPJ(cnpjInput.value);
            cnpjStatus.textContent = valid ? '✓' : '✗';
            cnpjStatus.className = `field-status ${valid ? 'is-valid' : 'is-invalid'}`;
        });
    }

    const phoneInput = form.querySelector('#telefone');
    if (phoneInput) {
        phoneInput.addEventListener('input', () => { phoneInput.value = maskPhone(phoneInput.value); });
    }

    // --- CEP: ao completar 8 dígitos, busca endereço no ViaCEP ---
    const cepInput = form.querySelector('#cep');
    const cepStatus = document.getElementById('cepStatus');
    if (cepInput) {
        cepInput.addEventListener('input', async () => {
            cepInput.value = maskCEP(cepInput.value);
            const digits = onlyDigits(cepInput.value);
            if (digits.length !== 8) {
                if (cepStatus) cepStatus.textContent = '';
                return;
            }

            if (cepStatus) cepStatus.textContent = 'Buscando endereço...';
            try {
                const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
                const data = await response.json();
                if (data.erro) {
                    if (cepStatus) cepStatus.textContent = 'CEP não encontrado.';
                    return;
                }
                form.querySelector('#logradouro').value = data.logradouro || '';
                form.querySelector('#bairro').value = data.bairro || '';
                form.querySelector('#cidade').value = data.localidade || '';
                if (estadoSelect && data.uf) estadoSelect.value = data.uf;
                if (cepStatus) cepStatus.textContent = 'Endereço preenchido automaticamente.';
                form.querySelector('#numero').focus();
            } catch (err) {
                if (cepStatus) cepStatus.textContent = 'Não foi possível buscar o CEP agora — preencha manualmente.';
            }
        });
    }

    function checkedValues(name) {
        return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage(messageEl);

        const tipo = tipoInput.value;
        const razaoSocial = form.razaoSocial.value.trim();
        const nomeFantasia = form.nomeFantasia.value.trim();
        const cnpj = form.cnpj.value;
        const email = form.email.value.trim();
        const telefone = form.telefone.value;
        const password = form.password.value;
        const confirmPassword = form.confirmPassword.value;

        if (razaoSocial.length < 2) {
            showMessage(messageEl, 'Informe a Razão Social.', 'error');
            return;
        }
        if (nomeFantasia.length < 2) {
            showMessage(messageEl, 'Informe o Nome Fantasia.', 'error');
            return;
        }
        if (!isValidCNPJ(cnpj)) {
            showMessage(messageEl, 'Informe um CNPJ válido.', 'error');
            return;
        }
        if (!validateEmail(email)) {
            showMessage(messageEl, 'Informe um e-mail corporativo válido.', 'error');
            return;
        }
        if (onlyDigits(telefone).length < 10) {
            showMessage(messageEl, 'Informe um telefone/WhatsApp válido, com DDD.', 'error');
            return;
        }
        if (!validatePassword(password)) {
            showMessage(messageEl, 'A senha deve ter no mínimo 8 caracteres, com letras e números.', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showMessage(messageEl, 'As senhas não coincidem.', 'error');
            return;
        }

        setLoading(submitButton, true, 'Cadastrando...', 'Cadastrar Empresa');

        try {
            await apiRequest('/empresas/register', 'POST', {
                tipo,
                razaoSocial,
                nomeFantasia,
                cnpj,
                inscricaoEstadual: form.inscricaoEstadual.value.trim() || undefined,
                email,
                telefone,
                password,
                cep: form.cep.value || undefined,
                logradouro: form.logradouro.value.trim() || undefined,
                numero: form.numero.value.trim() || undefined,
                complemento: form.complemento.value.trim() || undefined,
                bairro: form.bairro.value.trim() || undefined,
                cidade: form.cidade.value.trim() || undefined,
                estado: form.estado.value || undefined,
                areaAtuacao: form.areaAtuacao.value.trim() || undefined,
                tiposInsumos: tipo === 'insumos' ? checkedValues('tiposInsumos') : undefined,
                culturasCompra: tipo === 'compradora' ? checkedValues('culturasCompra') : undefined,
                capacidadeRecebimento: tipo === 'compradora' ? (form.capacidadeRecebimento.value.trim() || undefined) : undefined
            });

            showMessage(messageEl, 'Cadastro realizado! Redirecionando para o login...', 'success');
            form.reset();
            setTimeout(() => { window.location.href = 'empresa-login.html'; }, 1500);
        } catch (err) {
            showMessage(messageEl, err.message, 'error');
            setLoading(submitButton, false, 'Cadastrando...', 'Cadastrar Empresa');
        }
    });
}

// ---------------------------------------------------------------------------
// empresa-login.html
// ---------------------------------------------------------------------------

function initEmpresaLoginPage() {
    const form = document.getElementById('empresaLoginForm');
    if (!form) return;

    const messageEl = document.getElementById('authMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            alert('Em breve');
        });
    }

    const identifierInput = form.querySelector('#identifier');
    if (identifierInput) {
        // CNPJ e e-mail compartilham o mesmo campo — só aplica a máscara de
        // CNPJ se o que já foi digitado não tiver "@" (senão quebraria o e-mail).
        identifierInput.addEventListener('input', () => {
            if (!identifierInput.value.includes('@') && /\d/.test(identifierInput.value)) {
                identifierInput.value = maskCNPJ(identifierInput.value);
            }
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage(messageEl);

        const identifier = form.identifier.value.trim();
        const password = form.password.value;

        if (!identifier) {
            showMessage(messageEl, 'Informe seu CNPJ ou e-mail.', 'error');
            return;
        }
        if (!password) {
            showMessage(messageEl, 'Informe sua senha.', 'error');
            return;
        }

        setLoading(submitButton, true, 'Entrando...', 'Entrar');

        try {
            const data = await apiRequest('/empresas/login', 'POST', { identifier, password });
            saveEmpresaSession(data.token, data.empresa);

            // Empresa de insumos tem área logada própria: vai direto para o painel.
            if (data.empresa.tipo === 'insumos') {
                window.location.href = 'dashboard-empresa.html';
                return;
            }

            // Compradora ainda não tem área logada — fica aqui mesmo, com a
            // confirmação, em vez de redirecionar para index.html (que é a
            // área do agricultor e bloquearia a sessão de empresa de volta
            // para o login).
            showMessage(messageEl, `Login realizado com sucesso, ${data.empresa.nomeFantasia}!`, 'success');
            setLoading(submitButton, false, 'Entrando...', 'Entrar');
        } catch (err) {
            showMessage(messageEl, err.message, 'error');
            setLoading(submitButton, false, 'Entrando...', 'Entrar');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initEmpresaRegisterPage();
    initEmpresaLoginPage();
});
