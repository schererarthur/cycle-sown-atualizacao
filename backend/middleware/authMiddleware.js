// ============================================================================
// Middleware de autenticação.
//
// Um "middleware" é uma função que roda ANTES da rota final, podendo
// barrar a requisição ali mesmo. Este aqui protege rotas exigindo um
// token JWT válido no cabeçalho Authorization, no formato:
//
//   Authorization: Bearer <token>
//
// Se o token for válido, guardamos os dados dele em `req.user` para a
// rota seguinte usar (ex: saber de quem é o pedido).
//
// Este middleware é agnóstico ao tipo de conta: ele só confere a
// assinatura/validade do token e repassa o payload como está, então o
// mesmo authMiddleware protege tanto tokens de agricultor
// ({ userId, email, role: 'agricultor' }, ver routes/auth.js) quanto de
// empresa ({ empresaId, tipo, email, role: 'empresa' }, ver
// routes/empresas.js). Para uma rota que deve aceitar só um dos dois,
// use `authMiddleware.requireRole(...)` depois dele.
// ============================================================================

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.slice('Bearer '.length).trim();

    try {
        // jwt.verify já checa a assinatura E a expiração do token.
        // Se algo estiver errado, ele lança um erro (cai no catch).
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { userId, email, role, iat, exp } ou { empresaId, tipo, email, role, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

// Uso: router.get('/rota', authMiddleware, authMiddleware.requireRole('empresa'), handler)
// Precisa rodar DEPOIS de authMiddleware (que preenche req.user).
authMiddleware.requireRole = function requireRole(role) {
    return function (req, res, next) {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Acesso não permitido para este tipo de conta.' });
        }
        next();
    };
};

module.exports = authMiddleware;
