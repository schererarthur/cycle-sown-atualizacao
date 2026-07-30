// ============================================================================
// Proteção contra tentativas de login em excesso (força bruta).
//
// Usamos duas camadas, uma em cima da outra:
//
// 1) `loginRateLimiter` — um limite genérico (biblioteca express-rate-limit)
//    que barra QUALQUER IP que faça requisições demais em pouco tempo.
//    É uma proteção ampla, guardada em memória, contra bots/DoS.
//
// 2) `loginAttemptGuard` — a regra de negócio pedida especificamente para
//    o login: consultamos a própria tabela `login_attempts` e, se esse IP
//    teve mais de 5 tentativas malsucedidas na última hora, bloqueamos
//    novas tentativas por 15 minutos a partir da última falha.
// ============================================================================

const rateLimit = require('express-rate-limit');
const pool = require('../config/db');

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // janela de 15 minutos
    max: 30,                  // no máximo 30 requisições de login por IP nessa janela
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});

async function loginAttemptGuard(req, res, next) {
    const ipAddress = req.ip;

    try {
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS failedCount, MAX(attempted_at) AS lastFailedAt
             FROM login_attempts
             WHERE ip_address = ?
               AND success = 0
               AND attempted_at >= (NOW() - INTERVAL 1 HOUR)`,
            [ipAddress]
        );

        const { failedCount, lastFailedAt } = rows[0];

        if (failedCount > 5 && lastFailedAt) {
            const minutesSinceLastFail = (Date.now() - new Date(lastFailedAt).getTime()) / 60000;
            if (minutesSinceLastFail < 15) {
                return res.status(429).json({
                    error: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
                });
            }
        }

        next();
    } catch (err) {
        // Se a checagem no banco falhar, deixamos a requisição seguir em vez
        // de travar o login por causa de um problema à parte — a senha ainda
        // vai ser validada normalmente logo em seguida.
        console.error('Erro ao checar tentativas de login:', err.message);
        next();
    }
}

module.exports = { loginRateLimiter, loginAttemptGuard };
