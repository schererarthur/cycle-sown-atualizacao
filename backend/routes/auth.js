// ============================================================================
// Rotas de autenticação: cadastro, login, dados do usuário logado e logout.
//
// Todas as respostas de erro usam um formato simples: { error: "mensagem" }.
// Nunca retornamos password_hash em nenhuma resposta, nem detalhes internos
// de erros do banco (isso poderia ajudar um invasor).
// ============================================================================

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { loginRateLimiter, loginAttemptGuard } = require('../middleware/rateLimiter');
const { isValidEmail, isValidPassword, isValidName } = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;       // custo do hash da senha (bcrypt) — 12 é um bom padrão atual
const TOKEN_EXPIRATION = '24h'; // validade do token de login

// Registra uma tentativa de login na tabela login_attempts.
// Chamada tanto para tentativas que deram certo quanto para as que falharam.
async function logAttempt({ email, userId, success, ipAddress, userAgent }) {
    try {
        await pool.query(
            `INSERT INTO login_attempts (email, user_id, success, ip_address, user_agent, attempted_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [email, userId, success ? 1 : 0, ipAddress, userAgent]
        );
    } catch (err) {
        // Se o registro da tentativa falhar, não travamos o login por causa
        // disso — só avisamos no console do servidor.
        console.error('Erro ao registrar tentativa de login:', err.message);
    }
}

// ----------------------------------------------------------------------------
// POST /api/auth/register
// ----------------------------------------------------------------------------
router.post('/register', async (req, res) => {
    const { name, email, password, phone, location } = req.body || {};

    // --- Validação dos dados recebidos, antes de tocar no banco ---
    if (!isValidName(name)) {
        return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!isValidPassword(password)) {
        return res.status(400).json({
            error: 'Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número'
        });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const connection = await pool.getConnection();

    try {
        // Verifica se o e-mail já existe ANTES de tentar inserir, para
        // devolver uma mensagem clara (409) em vez de um erro genérico
        // de "chave duplicada" vindo direto do MySQL.
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            [normalizedEmail]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }

        // Nunca guardamos a senha em texto puro — só o hash gerado pelo bcrypt.
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // As duas inserções (usuário + configurações padrão) precisam
        // acontecer juntas: se uma falhar, desfazemos as duas (transação).
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO users (name, email, password_hash, phone, location)
             VALUES (?, ?, ?, ?, ?)`,
            [name.trim(), normalizedEmail, passwordHash, phone ? String(phone).trim() : null, location ? String(location).trim() : null]
        );

        const newUserId = result.insertId;

        await connection.query(
            `INSERT INTO user_settings (user_id, email_notifications, auto_reports, dark_mode)
             VALUES (?, 1, 1, 0)`,
            [newUserId]
        );

        await connection.commit();

        return res.status(201).json({
            id: newUserId,
            name: name.trim(),
            email: normalizedEmail
        });
    } catch (err) {
        await connection.rollback();
        console.error('Erro ao registrar usuário:', err.message); // nunca logar a senha em si
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    } finally {
        connection.release();
    }
});

// ----------------------------------------------------------------------------
// POST /api/auth/login
// ----------------------------------------------------------------------------
router.post('/login', loginRateLimiter, loginAttemptGuard, async (req, res) => {
    const { email, password } = req.body || {};
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || null;

    // Resposta genérica para credenciais inválidas — nunca revela se o
    // problema foi o e-mail não existir ou a senha estar errada.
    const invalidCredentials = () => res.status(401).json({ error: 'Credenciais inválidas' });

    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
        await logAttempt({ email: email || '', userId: null, success: false, ipAddress, userAgent });
        return res.status(400).json({ error: 'Informe e-mail e senha' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const [rows] = await pool.query(
            'SELECT id, name, email, password_hash, is_active FROM users WHERE email = ?',
            [normalizedEmail]
        );
        const user = rows[0] || null;

        // Usuário não existe, não tem senha definida, ou está desativado.
        if (!user || !user.password_hash || !user.is_active) {
            await logAttempt({ email: normalizedEmail, userId: user ? user.id : null, success: false, ipAddress, userAgent });
            return invalidCredentials();
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            await logAttempt({ email: normalizedEmail, userId: user.id, success: false, ipAddress, userAgent });
            return invalidCredentials();
        }

        await logAttempt({ email: normalizedEmail, userId: user.id, success: true, ipAddress, userAgent });

        // Token JWT: guarda só o essencial (id e e-mail), nunca dados sensíveis.
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: TOKEN_EXPIRATION }
        );

        return res.status(200).json({
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Erro ao autenticar usuário:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// GET /api/auth/me  (protegida — precisa de token válido)
// ----------------------------------------------------------------------------
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, name, email, phone, location, bio, created_at FROM users WHERE id = ?',
            [req.user.userId]
        );
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        return res.status(200).json({ user });
    } catch (err) {
        console.error('Erro ao buscar usuário logado:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// POST /api/auth/logout  (protegida)
// ----------------------------------------------------------------------------
// Como o JWT é "stateless" (o servidor não guarda sessão nenhuma), não há
// nada para invalidar aqui — o logout de verdade é o front-end apagar o
// token salvo. Esta rota existe só para o front ter algo padronizado para
// chamar, e para no futuro podermos evoluir para uma lista de tokens revogados.
router.post('/logout', authMiddleware, (req, res) => {
    return res.status(200).json({ message: 'Logout realizado' });
});

module.exports = router;
