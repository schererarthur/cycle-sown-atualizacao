// ============================================================================
// Rotas de conta de empresa (cadastro, login e perfil do próprio usuário).
//
// Duas variantes de empresa usam a mesma tabela `empresas`, diferenciadas
// pela coluna `tipo`: 'insumos' (agropecuárias que vendem calcário, adubo
// etc.) e 'compradora' (tradings/cerealistas/cooperativas que compram a
// produção do agricultor). Isso é uma conta com login próprio — diferente
// do diretório estático de `buying_companies` (empresas/index.html), que é
// só uma lista de contatos para o agricultor navegar, sem autenticação.
//
// Segue o mesmo padrão de routes/auth.js: nunca devolve senha_hash, erros
// de login são sempre genéricos (não revelam se o problema foi o
// identificador ou a senha), e tentativas de login (sucesso/falha) são
// gravadas em `login_attempts` (mesma tabela do agricultor). ATENÇÃO: no
// banco já em uso, `login_attempts.user_id` tem uma FK para `users(id)`
// que não aparece em schema.sql (drift entre o arquivo e o banco real) —
// gravar o id de uma empresa ali quebra a constraint (id inexistente em
// `users`, ou pior, coincide com o de outro agricultor). Por isso sempre
// gravamos user_id = NULL para tentativas de empresa; o bloqueio por IP
// (loginAttemptGuard, rateLimiter.js) filtra só por ip_address e continua
// funcionando normalmente sem essa coluna.
// ============================================================================

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { loginRateLimiter, loginAttemptGuard, empresaRegisterRateLimiter } = require('../middleware/rateLimiter');
const {
    isValidEmail, isValidPassword, isValidName,
    onlyDigits, isValidCNPJ, formatCNPJ, isValidPhone
} = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = '24h';

const TIPOS_EMPRESA = ['insumos', 'compradora'];

const ESTADOS_BR = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Whitelist das tags de checkbox — qualquer valor fora dela é descartado
// silenciosamente antes de gravar (são só rótulos informativos, mas não
// custa nada não deixar o cliente gravar texto arbitrário no JSON).
const TIPOS_INSUMOS_VALIDOS = ['calcario', 'fertilizantes', 'sementes', 'defensivos', 'outros'];
const CULTURAS_COMPRA_VALIDAS = ['soja', 'milho', 'trigo', 'fumo', 'feijao', 'outros'];

function sanitizeTagList(list, permitidos) {
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === 'string' && permitidos.includes(item));
}

// Mesma função de routes/auth.js: registra tentativa de login (sucesso ou
// falha) para o loginAttemptGuard conseguir bloquear IPs abusivos.
// user_id sempre NULL aqui — ver nota no topo do arquivo sobre a FK de
// login_attempts.user_id apontar para `users`, não para `empresas`.
async function logAttempt({ email, success, ipAddress, userAgent }) {
    try {
        await pool.query(
            `INSERT INTO login_attempts (email, user_id, success, ip_address, user_agent, attempted_at)
             VALUES (?, NULL, ?, ?, ?, NOW())`,
            [email, success ? 1 : 0, ipAddress, userAgent]
        );
    } catch (err) {
        console.error('Erro ao registrar tentativa de login de empresa:', err.message);
    }
}

function empresaPublica(row) {
    return {
        id: row.id,
        tipo: row.tipo,
        razaoSocial: row.razao_social,
        nomeFantasia: row.nome_fantasia,
        cnpj: row.cnpj,
        email: row.email
    };
}

// ----------------------------------------------------------------------------
// POST /api/empresas/register
// ----------------------------------------------------------------------------
router.post('/register', empresaRegisterRateLimiter, async (req, res) => {
    const {
        tipo, razaoSocial, nomeFantasia, cnpj, inscricaoEstadual,
        email, telefone, password,
        cep, logradouro, numero, complemento, bairro, cidade, estado,
        areaAtuacao, tiposInsumos, culturasCompra, capacidadeRecebimento
    } = req.body || {};

    if (!TIPOS_EMPRESA.includes(tipo)) {
        return res.status(400).json({ error: `Tipo de empresa inválido (use ${TIPOS_EMPRESA.join(' ou ')})` });
    }
    if (!isValidName(razaoSocial)) {
        return res.status(400).json({ error: 'Informe a Razão Social' });
    }
    if (!isValidName(nomeFantasia)) {
        return res.status(400).json({ error: 'Informe o Nome Fantasia' });
    }
    if (!isValidCNPJ(cnpj)) {
        return res.status(400).json({ error: 'CNPJ inválido' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'E-mail corporativo inválido' });
    }
    if (!isValidPhone(telefone)) {
        return res.status(400).json({ error: 'Telefone/WhatsApp inválido — informe DDD + número' });
    }
    if (!isValidPassword(password)) {
        return res.status(400).json({
            error: 'Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número'
        });
    }
    if (estado && !ESTADOS_BR.includes(String(estado).toUpperCase())) {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCnpj = formatCNPJ(cnpj);
    const tiposInsumosSanitizado = tipo === 'insumos' ? sanitizeTagList(tiposInsumos, TIPOS_INSUMOS_VALIDOS) : [];
    const culturasCompraSanitizado = tipo === 'compradora' ? sanitizeTagList(culturasCompra, CULTURAS_COMPRA_VALIDAS) : [];

    try {
        // Checa CNPJ e e-mail duplicados ANTES de inserir, para devolver uma
        // mensagem clara (409) em vez do erro genérico de chave duplicada do MySQL.
        const [existing] = await pool.query(
            'SELECT cnpj, email FROM empresas WHERE cnpj = ? OR email = ?',
            [normalizedCnpj, normalizedEmail]
        );
        if (existing.some((row) => row.cnpj === normalizedCnpj)) {
            return res.status(409).json({ error: 'CNPJ já cadastrado' });
        }
        if (existing.some((row) => row.email === normalizedEmail)) {
            return res.status(409).json({ error: 'E-mail já cadastrado' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const [result] = await pool.query(
            `INSERT INTO empresas (
                tipo, razao_social, nome_fantasia, cnpj, inscricao_estadual,
                email, telefone, senha_hash,
                cep, logradouro, numero, complemento, bairro, cidade, estado,
                area_atuacao, tipos_insumos, culturas_compra, capacidade_recebimento
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tipo, razaoSocial.trim(), nomeFantasia.trim(), normalizedCnpj,
                inscricaoEstadual ? String(inscricaoEstadual).trim() : null,
                normalizedEmail, onlyDigits(telefone), passwordHash,
                cep ? onlyDigits(cep) : null,
                logradouro ? String(logradouro).trim() : null,
                numero ? String(numero).trim() : null,
                complemento ? String(complemento).trim() : null,
                bairro ? String(bairro).trim() : null,
                cidade ? String(cidade).trim() : null,
                estado ? String(estado).toUpperCase() : null,
                areaAtuacao ? String(areaAtuacao).trim() : null,
                tipo === 'insumos' ? JSON.stringify(tiposInsumosSanitizado) : null,
                tipo === 'compradora' ? JSON.stringify(culturasCompraSanitizado) : null,
                capacidadeRecebimento ? String(capacidadeRecebimento).trim() : null
            ]
        );

        return res.status(201).json({
            id: result.insertId,
            tipo,
            nomeFantasia: nomeFantasia.trim(),
            email: normalizedEmail
        });
    } catch (err) {
        console.error('Erro ao cadastrar empresa:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// POST /api/empresas/login  — aceita CNPJ ou e-mail no campo `identifier`
// ----------------------------------------------------------------------------
router.post('/login', loginRateLimiter, loginAttemptGuard, async (req, res) => {
    const { identifier, password } = req.body || {};
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || null;

    const invalidCredentials = () => res.status(401).json({ error: 'Credenciais inválidas' });

    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
        await logAttempt({ email: String(identifier || ''), success: false, ipAddress, userAgent });
        return res.status(400).json({ error: 'Informe CNPJ ou e-mail e a senha' });
    }

    const raw = identifier.trim();
    const emailGuess = raw.toLowerCase();
    const cnpjDigits = onlyDigits(raw);
    const cnpjGuess = cnpjDigits.length === 14 ? formatCNPJ(cnpjDigits) : null;

    try {
        const [rows] = cnpjGuess
            ? await pool.query('SELECT * FROM empresas WHERE email = ? OR cnpj = ?', [emailGuess, cnpjGuess])
            : await pool.query('SELECT * FROM empresas WHERE email = ?', [emailGuess]);
        const empresa = rows[0] || null;

        if (!empresa || !empresa.ativo) {
            await logAttempt({ email: emailGuess, success: false, ipAddress, userAgent });
            return invalidCredentials();
        }

        const passwordMatches = await bcrypt.compare(password, empresa.senha_hash);
        if (!passwordMatches) {
            await logAttempt({ email: emailGuess, success: false, ipAddress, userAgent });
            return invalidCredentials();
        }

        await logAttempt({ email: emailGuess, success: true, ipAddress, userAgent });

        const token = jwt.sign(
            { empresaId: empresa.id, tipo: empresa.tipo, email: empresa.email, role: 'empresa' },
            process.env.JWT_SECRET,
            { expiresIn: TOKEN_EXPIRATION }
        );

        return res.status(200).json({ token, empresa: empresaPublica(empresa) });
    } catch (err) {
        console.error('Erro ao autenticar empresa:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// GET /api/empresas/me  (protegida — só tokens de empresa)
// ----------------------------------------------------------------------------
router.get('/me', authMiddleware, authMiddleware.requireRole('empresa'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [req.user.empresaId]);
        const empresa = rows[0];

        if (!empresa) {
            return res.status(404).json({ error: 'Empresa não encontrada' });
        }

        return res.status(200).json({ empresa: empresaPublica(empresa) });
    } catch (err) {
        console.error('Erro ao buscar empresa logada:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
