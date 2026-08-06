// ============================================================================
// Rotas do Mapa de Fertilidade: CRUD dos talhões (parcelas/glebas) do
// agricultor logado. Todas as rotas exigem token JWT válido — cada talhão
// só é visível/editável pelo dono (user_id do token).
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// ----------------------------------------------------------------------------
// Classificação de "Saúde do Solo" — MESMA tabela de referência usada em
// main.js (const adequacyClasses, seção de updateHealthScore()) para a
// análise de solo de index.html/recommendations.html. Duplicada aqui porque
// o backend Node não pode importar o main.js do navegador; se a tabela de
// main.js mudar, replique a mudança aqui também para os dois "Saúde do
// Solo" do site continuarem batendo.
//
// Unidades assumidas (mesmas padrão de fieldUnitConfig em main.js):
// pH sem unidade, MO em %, P e K em ppm/mg/dm³, Ca e Mg em cmolc/dm³.
// ----------------------------------------------------------------------------
const ADEQUACY_CLASSES = {
    ph: [
        { label: 'Muito Ruim', min: -Infinity, max: 4.5 },
        { label: 'Ruim', min: 4.5, max: 5.0 },
        { label: 'Regular', min: 5.0, max: 5.5 },
        { label: 'Bom', min: 5.5, max: 5.8 },
        { label: 'Excelente', min: 5.8, max: 6.5 },
        { label: 'Bom', min: 6.5, max: 7.2 },
        { label: 'Regular', min: 7.2, max: 7.5 },
        { label: 'Ruim', min: 7.5, max: 8.0 },
        { label: 'Muito Ruim', min: 8.0, max: Infinity }
    ],
    organicMatter: [
        { label: 'Excelente', min: 5, max: Infinity },
        { label: 'Bom', min: 3, max: 5 },
        { label: 'Regular', min: 2, max: 3 },
        { label: 'Ruim', min: 1, max: 2 },
        { label: 'Muito Ruim', min: -Infinity, max: 1 }
    ],
    phosphorus: [
        { label: 'Excelente', min: 30, max: Infinity },
        { label: 'Bom', min: 15, max: 30 },
        { label: 'Regular', min: 8, max: 15 },
        { label: 'Ruim', min: 4, max: 8 },
        { label: 'Muito Ruim', min: -Infinity, max: 4 }
    ],
    potassium: [
        { label: 'Excelente', min: 200, max: Infinity },
        { label: 'Bom', min: 120, max: 200 },
        { label: 'Regular', min: 80, max: 120 },
        { label: 'Ruim', min: 40, max: 80 },
        { label: 'Muito Ruim', min: -Infinity, max: 40 }
    ],
    calcium: [
        { label: 'Excelente', min: 6, max: Infinity },
        { label: 'Bom', min: 4, max: 6 },
        { label: 'Regular', min: 2, max: 4 },
        { label: 'Ruim', min: 1, max: 2 },
        { label: 'Muito Ruim', min: -Infinity, max: 1 }
    ],
    magnesium: [
        { label: 'Excelente', min: 2, max: Infinity },
        { label: 'Bom', min: 1, max: 2 },
        { label: 'Regular', min: 0.5, max: 1 },
        { label: 'Ruim', min: 0.3, max: 0.5 },
        { label: 'Muito Ruim', min: -Infinity, max: 0.3 }
    ]
};

const ADEQUACY_SCORE_MAP = { Excelente: 100, Bom: 80, Regular: 60, Ruim: 40, 'Muito Ruim': 20 };

function classifyAdequacy(field, value) {
    const ranges = ADEQUACY_CLASSES[field];
    if (!ranges || value === null || value === undefined || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    const match = ranges.find((range) => numericValue >= range.min && numericValue < range.max);
    return (match || ranges[ranges.length - 1]).label;
}

// ----------------------------------------------------------------------------
// Calcula o score de fertilidade (0-100) classificando cada parâmetro pela
// tabela acima (Excelente=100 ... Muito Ruim=20) e tirando a média dos
// fatores informados — mesmo método de updateHealthScore() em main.js.
// ----------------------------------------------------------------------------
function calcularFertilidade({ solo_ph, solo_mo, solo_p, solo_k, solo_ca, solo_mg }) {
    const fatores = [
        ['ph', solo_ph],
        ['organicMatter', solo_mo],
        ['phosphorus', solo_p],
        ['potassium', solo_k],
        ['calcium', solo_ca],
        ['magnesium', solo_mg]
    ];

    let total = 0;
    let count = 0;
    fatores.forEach(([field, value]) => {
        if (value === null || value === undefined) return;
        const label = classifyAdequacy(field, value);
        if (label) {
            total += ADEQUACY_SCORE_MAP[label];
            count++;
        }
    });

    return count > 0 ? Math.round(total / count) : null;
}

const SOLO_FIELDS = [
    'solo_ph', 'solo_mo', 'solo_p', 'solo_k', 'solo_ca', 'solo_mg',
    'solo_v', 'solo_ctc', 'solo_al', 'solo_m', 'solo_smp'
];

// Converte number|string|null/undefined para número ou null, para não
// gravar `undefined`/`NaN` no banco.
function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function rowToTalhao(row) {
    return {
        id: row.id,
        nome: row.nome,
        coordenadas: row.coordenadas,
        area_ha: row.area_ha !== null ? Number(row.area_ha) : null,
        cultura: {
            nome: row.cultura_nome,
            estagio: row.cultura_estagio
        },
        solo: {
            ph: row.solo_ph !== null ? Number(row.solo_ph) : null,
            mo: row.solo_mo !== null ? Number(row.solo_mo) : null,
            P: row.solo_p !== null ? Number(row.solo_p) : null,
            K: row.solo_k !== null ? Number(row.solo_k) : null,
            Ca: row.solo_ca !== null ? Number(row.solo_ca) : null,
            Mg: row.solo_mg !== null ? Number(row.solo_mg) : null,
            V: row.solo_v !== null ? Number(row.solo_v) : null,
            CTC: row.solo_ctc !== null ? Number(row.solo_ctc) : null,
            Al: row.solo_al !== null ? Number(row.solo_al) : null,
            m: row.solo_m !== null ? Number(row.solo_m) : null,
            SMP: row.solo_smp !== null ? Number(row.solo_smp) : null
        },
        fertilidade: row.fertilidade_score,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

// ----------------------------------------------------------------------------
// GET /api/talhoes
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM talhoes WHERE user_id = ? ORDER BY created_at ASC',
            [req.user.userId]
        );

        return res.status(200).json({
            success: true,
            talhoes: rows.map(rowToTalhao)
        });
    } catch (err) {
        console.error('Erro ao listar talhões:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// POST /api/talhoes
// ----------------------------------------------------------------------------
router.post('/', async (req, res) => {
    const body = req.body || {};
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const coordenadas = body.coordenadas;

    if (nome.length === 0) {
        return res.status(400).json({ error: 'Informe o nome do talhão' });
    }
    if (!Array.isArray(coordenadas) || coordenadas.length < 3) {
        return res.status(400).json({ error: 'O talhão precisa de um polígono com pelo menos 3 pontos' });
    }

    const soloValores = {};
    SOLO_FIELDS.forEach((field) => {
        soloValores[field] = toNumberOrNull(body[field]);
    });

    const fertilidadeScore = calcularFertilidade({
        solo_ph: soloValores.solo_ph,
        solo_mo: soloValores.solo_mo,
        solo_p: soloValores.solo_p,
        solo_k: soloValores.solo_k,
        solo_ca: soloValores.solo_ca,
        solo_mg: soloValores.solo_mg
    });

    try {
        const [result] = await pool.query(
            `INSERT INTO talhoes (
                user_id, nome, coordenadas, area_ha, cultura_nome, cultura_estagio,
                solo_ph, solo_mo, solo_p, solo_k, solo_ca, solo_mg, solo_v,
                solo_ctc, solo_al, solo_m, solo_smp, fertilidade_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.userId,
                nome,
                JSON.stringify(coordenadas),
                toNumberOrNull(body.area_ha),
                typeof body.cultura_nome === 'string' ? body.cultura_nome.trim() || null : null,
                typeof body.cultura_estagio === 'string' ? body.cultura_estagio.trim() || null : null,
                soloValores.solo_ph, soloValores.solo_mo, soloValores.solo_p, soloValores.solo_k,
                soloValores.solo_ca, soloValores.solo_mg, soloValores.solo_v,
                soloValores.solo_ctc, soloValores.solo_al, soloValores.solo_m, soloValores.solo_smp,
                fertilidadeScore
            ]
        );

        const [rows] = await pool.query('SELECT * FROM talhoes WHERE id = ?', [result.insertId]);

        return res.status(201).json({ success: true, talhao: rowToTalhao(rows[0]) });
    } catch (err) {
        console.error('Erro ao criar talhão:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// PUT /api/talhoes/:id
// ----------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        const [existingRows] = await pool.query(
            'SELECT * FROM talhoes WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: 'Talhão não encontrado' });
        }

        const nome = body.nome !== undefined
            ? (typeof body.nome === 'string' ? body.nome.trim() : existing.nome)
            : existing.nome;
        if (nome.length === 0) {
            return res.status(400).json({ error: 'Nome do talhão não pode ficar vazio' });
        }

        let coordenadas = existing.coordenadas;
        if (body.coordenadas !== undefined) {
            if (!Array.isArray(body.coordenadas) || body.coordenadas.length < 3) {
                return res.status(400).json({ error: 'O talhão precisa de um polígono com pelo menos 3 pontos' });
            }
            coordenadas = body.coordenadas;
        }

        const soloValores = {};
        SOLO_FIELDS.forEach((field) => {
            soloValores[field] = body[field] !== undefined
                ? toNumberOrNull(body[field])
                : existing[field];
        });

        const areaHa = body.area_ha !== undefined ? toNumberOrNull(body.area_ha) : existing.area_ha;
        const culturaNome = body.cultura_nome !== undefined
            ? (typeof body.cultura_nome === 'string' ? body.cultura_nome.trim() || null : null)
            : existing.cultura_nome;
        const culturaEstagio = body.cultura_estagio !== undefined
            ? (typeof body.cultura_estagio === 'string' ? body.cultura_estagio.trim() || null : null)
            : existing.cultura_estagio;

        const fertilidadeScore = calcularFertilidade({
            solo_ph: soloValores.solo_ph,
            solo_mo: soloValores.solo_mo,
            solo_p: soloValores.solo_p,
            solo_k: soloValores.solo_k,
            solo_v: soloValores.solo_v
        });

        await pool.query(
            `UPDATE talhoes SET
                nome = ?, coordenadas = ?, area_ha = ?, cultura_nome = ?, cultura_estagio = ?,
                solo_ph = ?, solo_mo = ?, solo_p = ?, solo_k = ?, solo_ca = ?, solo_mg = ?, solo_v = ?,
                solo_ctc = ?, solo_al = ?, solo_m = ?, solo_smp = ?, fertilidade_score = ?
             WHERE id = ? AND user_id = ?`,
            [
                nome, JSON.stringify(coordenadas), areaHa, culturaNome, culturaEstagio,
                soloValores.solo_ph, soloValores.solo_mo, soloValores.solo_p, soloValores.solo_k,
                soloValores.solo_ca, soloValores.solo_mg, soloValores.solo_v,
                soloValores.solo_ctc, soloValores.solo_al, soloValores.solo_m, soloValores.solo_smp,
                fertilidadeScore,
                id, req.user.userId
            ]
        );

        const [rows] = await pool.query('SELECT * FROM talhoes WHERE id = ?', [id]);

        return res.status(200).json({ success: true, talhao: rowToTalhao(rows[0]) });
    } catch (err) {
        console.error('Erro ao atualizar talhão:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ----------------------------------------------------------------------------
// DELETE /api/talhoes/:id
// ----------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.query(
            'DELETE FROM talhoes WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Talhão não encontrado' });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Erro ao remover talhão:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
