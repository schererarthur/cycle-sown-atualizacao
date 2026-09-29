// ============================================================================
// Proteção da área logada das empresas de insumos (dashboard-empresa.html,
// routes/empresaInsumos.js).
//
// Reaproveita o que já existe e só acrescenta a regra nova, em 3 etapas:
//   1) authMiddleware            — confere assinatura/validade do JWT e
//                                  preenche req.user
//   2) requireRole('empresa')    — barra token de agricultor
//   3) exigirEmpresaInsumosAtiva — barra empresa compradora e empresa que
//                                  foi desativada/apagada depois do login
//
// O token de empresa é { empresaId, tipo, email, role: 'empresa' } (ver
// routes/empresas.js): "empresa de insumos" = role 'empresa' + tipo 'insumos'.
//
// Uso: router.use(empresaInsumosAuth) — é um array de middlewares, e o
// Express aceita array em router.use/router.get/etc.
// ============================================================================

const pool = require('../config/db');
const authMiddleware = require('./authMiddleware');

const ERRO_TIPO = 'Acesso permitido apenas para empresas de insumos.';

async function exigirEmpresaInsumosAtiva(req, res, next) {
    const { empresaId, tipo } = req.user;

    if (tipo !== 'insumos' || !Number.isInteger(empresaId)) {
        return res.status(403).json({ error: ERRO_TIPO });
    }

    try {
        // O token vale 24h. Consultar o banco a cada requisição (busca pela
        // chave primária, é instantânea) garante que uma empresa desativada
        // ou apagada nesse meio-tempo perde o acesso na hora, em vez de
        // continuar usando o token até ele expirar.
        const [rows] = await pool.execute(
            'SELECT tipo, ativo FROM empresas WHERE id = ?',
            [empresaId]
        );
        const empresa = rows[0];

        if (!empresa || !empresa.ativo) {
            return res.status(401).json({ error: 'Conta de empresa inativa. Faça login novamente.' });
        }
        if (empresa.tipo !== 'insumos') {
            return res.status(403).json({ error: ERRO_TIPO });
        }

        next();
    } catch (err) {
        console.error('Erro ao validar empresa de insumos:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
}

module.exports = [authMiddleware, authMiddleware.requireRole('empresa'), exigirEmpresaInsumosAtiva];
