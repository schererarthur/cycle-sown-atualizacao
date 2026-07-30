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

module.exports = { isValidEmail, isValidPassword, isValidName };
