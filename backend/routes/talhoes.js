// ============================================================================
// Rotas do Mapa de Fertilidade: CRUD dos talhões (parcelas/glebas) do
// agricultor logado. Todas as rotas exigem token JWT válido — cada talhão
// só é visível/editável pelo dono (user_id do token).
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { toCanonical } = require('../utils/units');

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
    'solo_v', 'solo_ctc', 'solo_al', 'solo_m', 'solo_smp', 'solo_argila'
];

// calcario_prnt não é uma leitura de solo (é o PRNT do produto de calcário
// que o agricultor pretende comprar) — guardado à parte no talhão para a
// Calculadora de Adubação e Calagem reaproveitar entre gerações de relatório.
const CALCARIO_FIELDS = ['calcario_prnt'];

// Converte number|string|null/undefined para número ou null, para não
// gravar `undefined`/`NaN` no banco.
function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// Família de conversão (units.js) de cada coluna solo_* que tem unidade de
// laudo — solo_ph, solo_v, solo_m e solo_smp ficam de fora (pH e índices
// adimensionais, V%/m% sempre em %, sem unidade de laudo).
const SOLO_FIELD_UNIT_FAMILY = {
    solo_mo: 'organicMatter',
    solo_p: 'phosphorus',
    solo_k: 'potassium',
    solo_ca: 'calcium',
    solo_mg: 'magnesium',
    solo_ctc: 'ctc',
    solo_al: 'aluminum',
    solo_argila: 'clay'
};

// Converte um campo solo_* para a unidade canônica do motor de cálculo
// (adubacaoEngine, rotacaoEngine, calcularFertilidade acima) ANTES de
// gravar no banco — assim todo motor recebe sempre a mesma unidade,
// independente de em qual unidade o laudo original informava o valor. Se o
// cliente mandar `${campo}_unit` (ex.: "mmolc/dm³"), converte a partir
// dela; sem essa chave, assume que o valor já está na unidade canônica
// (comportamento anterior, mantido por compatibilidade — o formulário
// atual de mapa-fertilidade.html já pede os valores diretamente nas
// unidades canônicas, sem seletor de unidade).
function convertSoloField(field, rawValue, rawUnit) {
    const numero = toNumberOrNull(rawValue);
    if (numero === null) return null;
    const familia = SOLO_FIELD_UNIT_FAMILY[field];
    if (!familia || !rawUnit) return numero;
    const convertido = toCanonical(familia, numero, rawUnit);
    return Number.isFinite(convertido) ? convertido : numero;
}

// ----------------------------------------------------------------------------
// Validação de faixa — roda DEPOIS de toNumberOrNull()/convertSoloField(),
// ou seja, sobre o valor já numérico e já na unidade canônica. Pega tanto
// erro de digitação (ex.: pH 55) quanto uma conversão de unidade que "sobrou"
// errada (ex.: K ainda em cmolc/dm³ virando um mg/dm³ de milhares por engano
// do cliente) — sem isso, um valor absurdo passava direto para o banco e
// contaminava score de fertilidade, adubação e rotação calculados a partir
// dele. calcario_prnt entra na mesma tabela por conveniência, mesmo não
// sendo uma leitura de solo (ver comentário de CALCARIO_FIELDS acima).
// solo_m (m%) não foi pedida explicitamente, mas é a mesma faixa 0-100 de
// solo_v (m% = Al / (SB+Al) × 100), então ficaria inconsistente deixar de
// fora.
const SOLO_FIELD_RANGES = {
    solo_ph: [3.0, 10.0],
    solo_smp: [4.0, 7.5],
    solo_mo: [0, 15],
    solo_p: [0, 500],
    solo_k: [0, 2000],
    solo_ca: [0, 50],
    solo_mg: [0, 50],
    solo_v: [0, 100],
    solo_ctc: [0, 100],
    solo_al: [0, 30],
    solo_m: [0, 100],
    solo_argila: [0, 100],
    calcario_prnt: [1, 130]
};

const SOLO_FIELD_LABELS = {
    solo_ph: 'pH',
    solo_mo: 'Matéria orgânica (%)',
    solo_p: 'Fósforo (mg/dm³)',
    solo_k: 'Potássio (mg/dm³)',
    solo_ca: 'Cálcio (cmolc/dm³)',
    solo_mg: 'Magnésio (cmolc/dm³)',
    solo_v: 'Saturação por bases (V%)',
    solo_ctc: 'CTC a pH 7,0',
    solo_al: 'Alumínio (cmolc/dm³)',
    solo_m: 'Saturação por alumínio (m%)',
    solo_smp: 'Índice SMP',
    solo_argila: 'Argila (%)',
    calcario_prnt: 'PRNT do calcário (%)'
};

// Valida um conjunto {campo: valor} contra SOLO_FIELD_RANGES. Ignora
// null/undefined (campo não informado — nada a validar). Devolve a
// mensagem de erro do primeiro campo fora da faixa, ou null se todos os
// campos informados estiverem dentro do esperado.
function validarFaixasSolo(valores) {
    for (const [field, value] of Object.entries(valores)) {
        if (value === null || value === undefined) continue;
        const range = SOLO_FIELD_RANGES[field];
        if (!range) continue;
        const [min, max] = range;
        if (value < min || value > max) {
            const label = SOLO_FIELD_LABELS[field] || field;
            return `${label} fora da faixa esperada (${min}–${max}): valor informado ${value}.`;
        }
    }
    return null;
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
            SMP: row.solo_smp !== null ? Number(row.solo_smp) : null,
            argila: row.solo_argila !== null ? Number(row.solo_argila) : null
        },
        calcario_prnt: row.calcario_prnt !== null ? Number(row.calcario_prnt) : null,
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
        soloValores[field] = convertSoloField(field, body[field], body[`${field}_unit`]);
    });
    const calcarioValores = {};
    CALCARIO_FIELDS.forEach((field) => {
        calcarioValores[field] = toNumberOrNull(body[field]);
    });

    const erroFaixa = validarFaixasSolo({ ...soloValores, ...calcarioValores });
    if (erroFaixa) {
        return res.status(400).json({ error: erroFaixa });
    }

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
                solo_ctc, solo_al, solo_m, solo_smp, solo_argila, calcario_prnt, fertilidade_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                soloValores.solo_argila, calcarioValores.calcario_prnt,
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
                ? convertSoloField(field, body[field], body[`${field}_unit`])
                : existing[field];
        });
        const calcarioValores = {};
        CALCARIO_FIELDS.forEach((field) => {
            calcarioValores[field] = body[field] !== undefined
                ? toNumberOrNull(body[field])
                : existing[field];
        });

        // Valida só os campos que vieram NESTA requisição — não os que
        // caíram no fallback `existing[field]` acima. Assim, um talhão
        // antigo com um valor fora da faixa (criado antes desta validação
        // existir) não trava a edição de um campo não relacionado (ex.:
        // renomear o talhão) até o agricultor corrigir o dado legado.
        const valoresEnviados = {};
        [...SOLO_FIELDS, ...CALCARIO_FIELDS].forEach((field) => {
            if (body[field] !== undefined) {
                valoresEnviados[field] = field in soloValores ? soloValores[field] : calcarioValores[field];
            }
        });
        const erroFaixa = validarFaixasSolo(valoresEnviados);
        if (erroFaixa) {
            return res.status(400).json({ error: erroFaixa });
        }

        const areaHa = body.area_ha !== undefined ? toNumberOrNull(body.area_ha) : existing.area_ha;
        const culturaNome = body.cultura_nome !== undefined
            ? (typeof body.cultura_nome === 'string' ? body.cultura_nome.trim() || null : null)
            : existing.cultura_nome;
        const culturaEstagio = body.cultura_estagio !== undefined
            ? (typeof body.cultura_estagio === 'string' ? body.cultura_estagio.trim() || null : null)
            : existing.cultura_estagio;

        // Corrigido: antes passava solo_v (ignorado por calcularFertilidade,
        // que só lê ph/mo/p/k/ca/mg) e nunca passava Ca/Mg — a atualização de
        // um talhão fazia a "Saúde do Solo" recalcular sem Cálcio/Magnésio,
        // divergindo do valor calculado na criação (rota POST, que já
        // passava ca/mg corretamente).
        const fertilidadeScore = calcularFertilidade({
            solo_ph: soloValores.solo_ph,
            solo_mo: soloValores.solo_mo,
            solo_p: soloValores.solo_p,
            solo_k: soloValores.solo_k,
            solo_ca: soloValores.solo_ca,
            solo_mg: soloValores.solo_mg
        });

        await pool.query(
            `UPDATE talhoes SET
                nome = ?, coordenadas = ?, area_ha = ?, cultura_nome = ?, cultura_estagio = ?,
                solo_ph = ?, solo_mo = ?, solo_p = ?, solo_k = ?, solo_ca = ?, solo_mg = ?, solo_v = ?,
                solo_ctc = ?, solo_al = ?, solo_m = ?, solo_smp = ?, solo_argila = ?, calcario_prnt = ?,
                fertilidade_score = ?
             WHERE id = ? AND user_id = ?`,
            [
                nome, JSON.stringify(coordenadas), areaHa, culturaNome, culturaEstagio,
                soloValores.solo_ph, soloValores.solo_mo, soloValores.solo_p, soloValores.solo_k,
                soloValores.solo_ca, soloValores.solo_mg, soloValores.solo_v,
                soloValores.solo_ctc, soloValores.solo_al, soloValores.solo_m, soloValores.solo_smp,
                soloValores.solo_argila, calcarioValores.calcario_prnt,
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

// Reexportados para o Relatório Nutricional (routes/relatorios.js) usar a
// MESMA classificação de solo do Mapa de Fertilidade — em vez de duplicar
// esta tabela uma terceira vez (já é uma cópia da de main.js, ver
// comentário acima).
module.exports = router;
module.exports.ADEQUACY_CLASSES = ADEQUACY_CLASSES;
module.exports.ADEQUACY_SCORE_MAP = ADEQUACY_SCORE_MAP;
module.exports.classifyAdequacy = classifyAdequacy;
module.exports.calcularFertilidade = calcularFertilidade;
