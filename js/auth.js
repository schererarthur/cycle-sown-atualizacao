// ============================================================================
// Cycle Sown — lógica compartilhada das telas de login e cadastro.
// Este arquivo é usado tanto por login.html quanto por register.html.
// ============================================================================

// Endereço da API. Se o backend rodar em outra porta/host, ajuste aqui.
const API_BASE_URL = 'http://localhost:3000/api';

// ---------------------------------------------------------------------------
// Validações (mesmas regras aplicadas no backend, aqui só para dar feedback
// rápido ao usuário antes de gastar uma requisição)
// ---------------------------------------------------------------------------

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function validatePassword(pwd) {
    if (typeof pwd !== 'string' || pwd.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    return hasLetter && hasNumber;
}

// ---------------------------------------------------------------------------
// Wrapper de fetch: sempre manda/recebe JSON e transforma respostas de erro
// da API (que vêm como { error: "mensagem" }) em uma exceção com essa
// mensagem, para o código que chama não precisar lidar com fetch cru.
// ---------------------------------------------------------------------------

async function apiRequest(path, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body !== null) {
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, options);
    } catch (networkError) {
        // Acontece, por exemplo, se o backend não estiver rodando.
        throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
    }

    let data = null;
    try {
        data = await response.json();
    } catch (parseError) {
        data = null;
    }

    if (!response.ok) {
        const message = (data && data.error) || 'Ocorreu um erro. Tente novamente.';
        throw new Error(message);
    }

    return data;
}

// ---------------------------------------------------------------------------
// Pequenos helpers de interface (mensagem de erro/sucesso e estado de loading)
// ---------------------------------------------------------------------------

function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-error', 'is-success');
    el.classList.add('is-visible', type === 'success' ? 'is-success' : 'is-error');
}

function hideMessage(el) {
    if (!el) return;
    el.classList.remove('is-visible', 'is-error', 'is-success');
    el.textContent = '';
}

function setLoading(button, isLoading, loadingText, defaultText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}

function saveSession(token, user) {
    localStorage.setItem('cycleSownToken', token);
    localStorage.setItem('cycleSownUser', JSON.stringify(user));
}

// ---------------------------------------------------------------------------
// Página de login
// ---------------------------------------------------------------------------

function initLoginPage() {
    const form = document.getElementById('loginForm');
    if (!form) return; // esta página não é a de login, não faz nada

    const messageEl = document.getElementById('authMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            alert('Em breve');
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage(messageEl);

        const email = form.email.value.trim();
        const password = form.password.value;

        if (!validateEmail(email)) {
            showMessage(messageEl, 'Informe um e-mail válido.', 'error');
            return;
        }
        if (!password) {
            showMessage(messageEl, 'Informe sua senha.', 'error');
            return;
        }

        setLoading(submitButton, true, 'Entrando...', 'Entrar');

        try {
            const data = await apiRequest('/auth/login', 'POST', { email, password });
            saveSession(data.token, data.user);
            window.location.href = 'index.html';
        } catch (err) {
            showMessage(messageEl, err.message, 'error');
            setLoading(submitButton, false, 'Entrando...', 'Entrar');
        }
    });
}

// ---------------------------------------------------------------------------
// Página de cadastro
// ---------------------------------------------------------------------------

function initRegisterPage() {
    const form = document.getElementById('registerForm');
    if (!form) return; // esta página não é a de cadastro, não faz nada

    const messageEl = document.getElementById('authMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage(messageEl);

        const name = form.name.value.trim();
        const email = form.email.value.trim();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const confirmPassword = form.confirmPassword.value;

        if (name.length < 2) {
            showMessage(messageEl, 'Informe seu nome completo.', 'error');
            return;
        }
        if (!validateEmail(email)) {
            showMessage(messageEl, 'Informe um e-mail válido.', 'error');
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

        setLoading(submitButton, true, 'Cadastrando...', 'Cadastrar');

        try {
            await apiRequest('/auth/register', 'POST', {
                name,
                email,
                password,
                phone: phone || undefined
            });

            showMessage(messageEl, 'Cadastro realizado! Redirecionando para o login...', 'success');
            form.reset();
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } catch (err) {
            showMessage(messageEl, err.message, 'error');
            setLoading(submitButton, false, 'Cadastrando...', 'Cadastrar');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initLoginPage();
    initRegisterPage();
});
