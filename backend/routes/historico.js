// ============================================================================
// Rotas do histórico de plantio por talhão (o que foi plantado em cada
// safra) — alimenta o Planejador de Rotação de Culturas em routes/rotacao.js.
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const CULTURAS = require('../data/culturas');
const { ordenarHistoricoCronologico } = require('../utils/rotacaoEngine');

const router = express.Router();

router.use(authMiddleware);

const SAFRA_TIPOS = ['verao', 'inverno'];

function toDateOrNull(value) {
    if (!value || typeof value !== 'string') return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------------------------------
// GET /api/historico/:talhaoId — histórico de plantio de um talhão
// ----------------------------------------------------------------------------
router.get('/:talhaoId', async (req, res) => {
    const { talhaoId } = req.params;

    try {
        const [talhaoRows] = await pool.query(
            'SELECT id FROM talhoes WHERE id = ? AND user_id = ?',
            [talhaoId, req.user.userId]
        );
        if (!talhaoRows[0]) {
            return res.status(404).json({ error: 'Talhão não encontrado' });
        }

        const [rows] = await pool.query(
            `SELECT id, cultura_nome, familia_botanica, safra_tipo, safra_ano,
                    data_plantio, data_colheita, produtividade_real, observacoes, created_at
             FROM historico_culturas
             WHERE talhao_id = ?
             ORDER BY created_at DESC`,
            [talhaoId]
        );

        // Ordem agronômica real de plantio, não ordem de cadastro — ver
        // ordenarHistoricoCronologico em utils/rotacaoEngine.js.
        const ordenado = ordenarHistoricoCronologico(rows);

        return res.status(200).json({
            success: true,
            historico: ordenado.map(({ created_at, ...row }) => ({
                ...row,
                produtividade_real: row.produtividade_real !== null ? Number(row.produtividade_real) : null
            }))
        });
    } catch (err) {
        console.error('Erro ao listar histórico:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// POST /api/historico — registra uma safra plantada num talhão
// ----------------------------------------------------------------------------
router.post('/', async (req, res) => {
    const body = req.body || {};
    const talhaoId = toNumberOrNull(body.talhao_id);
    const culturaNome = typeof body.cultura_nome === 'string' ? body.cultura_nome.trim() : '';
    const safraTipo = body.safra_tipo;
    const safraAno = typeof body.safra_ano === 'string' ? body.safra_ano.trim() : '';

    if (!talhaoId) {
        return res.status(400).json({ error: 'Informe o talhão' });
    }
    if (!culturaNome) {
        return res.status(400).json({ error: 'Informe o nome da cultura' });
    }
    if (!SAFRA_TIPOS.includes(safraTipo)) {
        return res.status(400).json({ error: 'safra_tipo deve ser "verao" ou "inverno"' });
    }
    if (!safraAno) {
        return res.status(400).json({ error: 'Informe a safra (ex: "2025/2026")' });
    }

    try {
        const [talhaoRows] = await pool.query(
            'SELECT id FROM talhoes WHERE id = ? AND user_id = ?',
            [talhaoId, req.user.userId]
        );
        if (!talhaoRows[0]) {
            return res.status(404).json({ error: 'Talhão não encontrado' });
        }

        const familiaBotanica = (CULTURAS[culturaNome] && CULTURAS[culturaNome].familia) || null;

        const [result] = await pool.query(
            `INSERT INTO historico_culturas (
                talhao_id, user_id, cultura_nome, familia_botanica, safra_tipo, safra_ano,
                data_plantio, data_colheita, produtividade_real, observacoes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                talhaoId, req.user.userId, culturaNome, familiaBotanica, safraTipo, safraAno,
                toDateOrNull(body.data_plantio), toDateOrNull(body.data_colheita),
                toNumberOrNull(body.produtividade_real),
                typeof body.observacoes === 'string' ? body.observacoes.trim() || null : null
            ]
        );

        const [rows] = await pool.query('SELECT * FROM historico_culturas WHERE id = ?', [result.insertId]);

        return res.status(201).json({ success: true, registro: rows[0] });
    } catch (err) {
        console.error('Erro ao registrar histórico:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
