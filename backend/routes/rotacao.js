// ============================================================================
// Rotas do Planejador de Rotação de Culturas: gera as 3 melhores culturas
// para a próxima safra de cada talhão, combinando calendário agrícola,
// histórico de plantio (não repetir família), dados de solo do talhão e
// preço atual da saca. A lógica de pontuação fica em utils/rotacaoEngine.js;
// aqui só busca os dados no banco e monta a resposta.
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { gerarRecomendacao, ordenarHistoricoCronologico } = require('../utils/rotacaoEngine');

const router = express.Router();

router.use(authMiddleware);

async function buscarPrecosMap() {
    const [rows] = await pool.query('SELECT cultura_nome, preco_saca FROM precos_culturas');
    const map = new Map();
    rows.forEach((row) => map.set(row.cultura_nome, row.preco_saca != null ? Number(row.preco_saca) : null));
    return map;
}

// Busca uma janela maior que o necessário (o histórico pode ter sido
// cadastrado fora de ordem cronológica) e deixa ordenarHistoricoCronologico
// achar as 4 safras agronomicamente mais recentes de verdade.
async function buscarHistorico(talhaoId) {
    const [rows] = await pool.query(
        `SELECT cultura_nome, familia_botanica, safra_tipo, safra_ano, created_at
         FROM historico_culturas
         WHERE talhao_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [talhaoId]
    );
    return ordenarHistoricoCronologico(rows).slice(0, 4);
}

function talhaoResumo(row) {
    return { id: row.id, nome: row.nome, area_ha: row.area_ha !== null ? Number(row.area_ha) : null };
}

// ----------------------------------------------------------------------------
// GET /api/rotacao/:talhaoId — recomendação para um talhão específico
// ----------------------------------------------------------------------------
router.get('/:talhaoId', async (req, res) => {
    const { talhaoId } = req.params;

    try {
        const [talhaoRows] = await pool.query(
            'SELECT * FROM talhoes WHERE id = ? AND user_id = ?',
            [talhaoId, req.user.userId]
        );
        const talhao = talhaoRows[0];
        if (!talhao) {
            return res.status(404).json({ error: 'Talhão não encontrado' });
        }

        const [historico, precosMap] = await Promise.all([
            buscarHistorico(talhao.id),
            buscarPrecosMap()
        ]);

        const resultado = gerarRecomendacao(talhao, historico, precosMap);

        return res.status(200).json({
            success: true,
            talhao: talhaoResumo(talhao),
            proxima_safra: { tipo: resultado.proximaSafra.tipo, label: resultado.proximaSafra.label },
            ultima_cultura: resultado.ultimaCultura,
            solo_resumo: resultado.soloResumo,
            recomendacoes: resultado.recomendacoes
        });
    } catch (err) {
        console.error('Erro ao gerar recomendação de rotação:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// GET /api/rotacao — recomendação para todos os talhões do usuário
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const [talhoes] = await pool.query(
            'SELECT * FROM talhoes WHERE user_id = ? ORDER BY created_at ASC',
            [req.user.userId]
        );

        if (talhoes.length === 0) {
            return res.status(200).json({
                success: true,
                proxima_safra: null,
                planejamento: [],
                resumo: { total_hectares: 0, receita_total_estimada: 0, talhoes_planejados: 0 }
            });
        }

        const precosMap = await buscarPrecosMap();
        let proximaSafraLabel = null;
        let totalHectares = 0;
        let receitaTotal = 0;

        const planejamento = await Promise.all(talhoes.map(async (talhao) => {
            const historico = await buscarHistorico(talhao.id);
            const resultado = gerarRecomendacao(talhao, historico, precosMap);
            proximaSafraLabel = resultado.proximaSafra;

            const top = resultado.recomendacoes[0] || null;
            const areaHa = talhao.area_ha !== null ? Number(talhao.area_ha) : 0;
            totalHectares += areaHa;
            if (top && !top.cobertura && top.receita_bruta_ha) {
                receitaTotal += top.receita_bruta_ha * areaHa;
            }

            return {
                talhao: talhaoResumo(talhao),
                ultima_cultura: resultado.ultimaCultura,
                solo_resumo: resultado.soloResumo,
                top_recomendacao: top ? {
                    cultura: top.cultura, emoji: top.emoji, score: top.score,
                    lucro_ha: top.lucro_estimado_ha, cobertura: top.cobertura
                } : null,
                recomendacoes: resultado.recomendacoes
            };
        }));

        return res.status(200).json({
            success: true,
            proxima_safra: proximaSafraLabel,
            planejamento,
            resumo: {
                total_hectares: Math.round(totalHectares * 100) / 100,
                receita_total_estimada: Math.round(receitaTotal * 100) / 100,
                talhoes_planejados: talhoes.length
            }
        });
    } catch (err) {
        console.error('Erro ao gerar planejamento de rotação:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
