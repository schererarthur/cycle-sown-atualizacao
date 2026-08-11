// ============================================================================
// Rotas dos preços de culturas usados no cálculo de lucro estimado do
// Planejador de Rotação (routes/rotacao.js) — atualizados manualmente por
// ora (mesma fonte de referência usada em cotacoes.html).
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// ----------------------------------------------------------------------------
// GET /api/precos — lista os preços atuais de todas as culturas
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT cultura_nome, preco_saca, unidade, fonte, atualizado_em FROM precos_culturas ORDER BY cultura_nome ASC'
        );

        return res.status(200).json({
            success: true,
            precos: rows.map((row) => ({
                ...row,
                preco_saca: row.preco_saca !== null ? Number(row.preco_saca) : null
            }))
        });
    } catch (err) {
        console.error('Erro ao listar preços:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// PUT /api/precos/:culturaNome — atualiza o preço de uma cultura
// ----------------------------------------------------------------------------
router.put('/:culturaNome', async (req, res) => {
    const culturaNome = decodeURIComponent(req.params.culturaNome);
    const precoSaca = Number(req.body && req.body.preco_saca);

    if (!Number.isFinite(precoSaca) || precoSaca < 0) {
        return res.status(400).json({ error: 'Informe um preco_saca válido' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE precos_culturas SET preco_saca = ? WHERE cultura_nome = ?',
            [precoSaca, culturaNome]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cultura não encontrada em precos_culturas' });
        }

        const [rows] = await pool.query('SELECT * FROM precos_culturas WHERE cultura_nome = ?', [culturaNome]);

        return res.status(200).json({ success: true, preco: rows[0] });
    } catch (err) {
        console.error('Erro ao atualizar preço:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
