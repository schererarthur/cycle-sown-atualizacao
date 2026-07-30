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
        req.user = payload; // { userId, email, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

module.exports = authMiddleware;
