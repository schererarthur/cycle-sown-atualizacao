// ============================================================================
// main.js — motor de análise de solo do Cycle Sown.
// Carregado por index.html, calendar.html, recommendations.html e
// relatorios.html (via <script src="main.js">). Não depende de nenhuma
// página específica: lê/escreve nos elementos de formulário quando eles
// existem (checagens `document.getElementById(...)?`) e expõe funções
// globais (window.updateAnalysis, window.generateFullReport, etc.) para
// o script inline de cada página chamar.
//
// Culturas suportadas pelo site: apenas milho, soja, trigo e tabaco
// (definidas em cropDatabase abaixo). Para adicionar uma cultura nova,
// crie uma nova entrada aqui com os mesmos campos e adicione a chave em
// `allowedCropKeys` (recommendations.html) e no <select> de
// calendar.html.
// ============================================================================

// ----------------------------------------------------------------------------
// SEÇÃO 1 — Banco de dados de culturas (pH ideal e necessidade de cada
// nutriente por cultura). Usado para calcular compatibilidade do solo com
// cada cultura e para as recomendações de correção.
//
// Dados baseados no Manual de Calagem e Adubação para os Estados do Rio
// Grande do Sul e Santa Catarina (CQFS-RS/SC, 2016). Unidades (mesmas de
// laudos ROLAS RS/SC — ver fieldUnitConfig): P, S, Fe, Mn, Zn, Cu, B em
// mg/dm³; K em mg/dm³; Ca e Mg em cmolc/dm³. Sem Nitrogênio (laudos de solo
// não medem N diretamente — é estimado pela matéria orgânica) nem Molibdênio
// (não faz parte do laudo padrão ROLAS).
// "optimal" = centro da faixa adequada para a cultura; "range" = [mínimo
// aceitável, máximo antes de excesso/toxidez] — valores de exigência da
// cultura, não a classificação genérica de fertilidade do solo (essa é
// `adequacyClasses`, abaixo).
// ----------------------------------------------------------------------------
const cropDatabase = {
    'milho': {
        name: 'Milho',
        phRange: [5.5, 6.5],
        optimalPh: 6.0,
        nutrients: {
            phosphorus: { optimal: 12, range: [6, 25] },
            potassium: { optimal: 120, range: [60, 200] },
            calcium: { optimal: 4.0, range: [2.0, 8.0] },
            magnesium: { optimal: 1.5, range: [0.5, 3.0] },
            sulfur: { optimal: 10, range: [5, 20] },
            iron: { optimal: 15, range: [5, 50] },
            manganese: { optimal: 8, range: [2.5, 30] },
            zinc: { optimal: 0.8, range: [0.2, 2.0] },
            copper: { optimal: 0.6, range: [0.2, 2.0] },
            boron: { optimal: 0.4, range: [0.1, 0.8] }
        },
        compatibility: 0,
        image: ''
    },
    'soja': {
        name: 'Soja',
        phRange: [5.5, 6.5],
        optimalPh: 6.0,
        nutrients: {
            phosphorus: { optimal: 14, range: [9, 28] },
            potassium: { optimal: 130, range: [80, 200] },
            calcium: { optimal: 5.0, range: [2.0, 8.0] },
            magnesium: { optimal: 1.5, range: [0.5, 3.0] },
            sulfur: { optimal: 12, range: [5, 25] },
            iron: { optimal: 15, range: [5, 50] },
            manganese: { optimal: 8, range: [2.5, 30] },
            zinc: { optimal: 0.8, range: [0.2, 2.0] },
            copper: { optimal: 0.6, range: [0.2, 2.0] },
            boron: { optimal: 0.4, range: [0.1, 0.8] }
        },
        compatibility: 0,
        image: ''
    },
    'trigo': {
        name: 'Trigo',
        phRange: [5.5, 6.5],
        optimalPh: 6.0,
        nutrients: {
            phosphorus: { optimal: 14, range: [9, 30] },
            potassium: { optimal: 120, range: [60, 200] },
            calcium: { optimal: 5.0, range: [2.0, 8.0] },
            magnesium: { optimal: 1.5, range: [0.5, 3.0] },
            sulfur: { optimal: 12, range: [5, 25] },
            iron: { optimal: 15, range: [5, 50] },
            manganese: { optimal: 10, range: [2.5, 35] },
            zinc: { optimal: 0.8, range: [0.2, 2.0] },
            copper: { optimal: 0.6, range: [0.2, 2.0] },
            boron: { optimal: 0.4, range: [0.1, 0.8] }
        },
        compatibility: 0,
        image: ''
    },
    'tabaco': {
        name: 'Tabaco',
        phRange: [5.5, 6.5],
        optimalPh: 6.0,
        nutrients: {
            phosphorus: { optimal: 18, range: [12, 30] },
            potassium: { optimal: 150, range: [100, 220] },
            calcium: { optimal: 5.0, range: [2.5, 8.0] },
            magnesium: { optimal: 1.5, range: [0.5, 3.0] },
            sulfur: { optimal: 12, range: [5, 25] },
            iron: { optimal: 15, range: [5, 50] },
            manganese: { optimal: 8, range: [2.5, 30] },
            zinc: { optimal: 0.8, range: [0.2, 2.0] },
            copper: { optimal: 0.6, range: [0.2, 2.0] },
            boron: { optimal: 0.4, range: [0.1, 0.8] }
        },
        compatibility: 0,
        image: ''
    }
};

// ----------------------------------------------------------------------------
// SEÇÃO 1.5 — Unidades de medida por campo. Cada laudo de solo (RS/SC, outros
// estados, laboratórios diferentes) reporta os valores em unidades distintas
// (ex.: cmolc/dm³ vs mmolc/dm³, mg/dm³ vs mg/kg), então cada campo numérico
// tem um <select> de unidade ao lado do input. Trocar a unidade NÃO converte
// o valor já digitado — o agricultor redigita o número na unidade escolhida
// do próprio laudo; a unidade só é guardada junto do valor para referência
// no relatório. `options`/`default` aqui são a fonte única de verdade: os
// <select id="{campo}_unit"> em index.html começam vazios e são preenchidos
// por initUnitSelectors().
// ----------------------------------------------------------------------------
const fieldUnitConfig = {
    organicMatter: { options: ['%', 'g/kg', 'g/dm³'], default: '%' },
    aluminum: { options: ['cmolc/dm³', 'mmolc/dm³', 'meq/100mL'], default: 'cmolc/dm³' },
    potentialAcidity: { options: ['cmolc/dm³', 'mmolc/dm³', 'meq/100mL'], default: 'cmolc/dm³' },
    sb: { options: ['cmolc/dm³', 'mmolc/dm³'], default: 'cmolc/dm³' },
    ctcEfetiva: { options: ['cmolc/dm³', 'mmolc/dm³'], default: 'cmolc/dm³' },
    ctcPH7: { options: ['cmolc/dm³', 'mmolc/dm³'], default: 'cmolc/dm³' },
    sandContent: { options: ['g/kg', '%', 'g/dm³'], default: 'g/kg' },
    siltContent: { options: ['g/kg', '%', 'g/dm³'], default: 'g/kg' },
    clayContent: { options: ['g/kg', '%', 'g/dm³'], default: 'g/kg' },
    phosphorus: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    potassium: { options: ['ppm (mg/dm³)', 'mg/kg', 'cmolc/dm³'], default: 'ppm (mg/dm³)' },
    calcium: { options: ['cmolc/dm³', 'mmolc/dm³', 'mg/dm³'], default: 'cmolc/dm³' },
    magnesium: { options: ['cmolc/dm³', 'mmolc/dm³', 'mg/dm³'], default: 'cmolc/dm³' },
    sulfur: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    iron: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    manganese: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    zinc: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    copper: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' },
    boron: { options: ['ppm (mg/dm³)', 'mg/kg'], default: 'ppm (mg/dm³)' }
};

// Rótulo compacto para exibir dentro do <select> — a grade de 3 colunas do
// formulário deixa pouco espaço ao lado do input, e "ppm (mg/dm³)" por
// extenso força o dropdown a quebrar linha antes da hora. O value salvo em
// soilData.units continua o texto completo (unidade real do laudo).
const unitDisplayLabels = {
    'ppm (mg/dm³)': 'mg/dm³'
};

// Preenche cada <select id="{campo}_unit"> com as opções de fieldUnitConfig
// e seleciona a unidade padrão. Chamado uma vez em initializeAnalysis().
function initUnitSelectors() {
    Object.keys(fieldUnitConfig).forEach(field => {
        const select = document.getElementById(`${field}_unit`);
        if (!select) return;
        const { options, default: defaultUnit } = fieldUnitConfig[field];
        select.innerHTML = options
            .map(unit => `<option value="${unit}">${unitDisplayLabels[unit] || unit}</option>`)
            .join('');
        select.value = defaultUnit;
    });
}

// Lê a unidade atualmente selecionada para um campo (ou seu padrão, se o
// <select> ainda não existir na página — ex.: calendar.html/recommendations.html
// não têm o formulário completo).
function getFieldUnit(field) {
    const config = fieldUnitConfig[field];
    if (!config) return null;
    const select = document.getElementById(`${field}_unit`);
    return select ? select.value : config.default;
}

// ----------------------------------------------------------------------------
// SEÇÃO 2 — Estado em memória da análise atual (o que o usuário digitou no
// formulário de index.html). Repopulado a cada `updateAnalysis()`.
// ----------------------------------------------------------------------------
let soilData = {
    ph: null,
    phCaCl2: null,
    organicMatter: null,
    aluminum: null,
    potentialAcidity: null,
    // Complexo Sortivo e Saturações — calculados a partir de Ca, Mg, K, Al e H+Al,
    // mas mantidos editáveis para o agricultor corrigir com o valor do laudo.
    sb: null,
    ctcEfetiva: null,
    ctcPH7: null,
    vPercent: null,
    mPercent: null,
    indiceSMP: null,
    texture: {
        sand: null,
        silt: null,
        clay: null
    },
    region: '',
    state: '',
    soilType: '',
    nutrients: {
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        sulfur: null,
        iron: null,
        manganese: null,
        zinc: null,
        copper: null,
        boron: null
    },
    // Unidade escolhida pelo agricultor para cada campo de fieldUnitConfig
    // (chave = mesmo id do campo, ex.: 'organicMatter', 'calcium'). Populado
    // em updateAnalysis() e persistido junto do relatório.
    units: {}
};

// Ponto de entrada chamado por index.html no DOMContentLoaded.
function initializeAnalysis() {
    initUnitSelectors();
    updateAnalysis();
    updateSavedReportCount();

    // Recalcula o Complexo Sortivo (SB, CTC, V%, m%) sempre que Ca, Mg, K, Al
    // ou H+Al mudarem — os demais campos calculados continuam editáveis entre
    // essas atualizações.
    ['calcium', 'magnesium', 'potassium', 'aluminum', 'potentialAcidity'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calcularComplexoSortivo);
        }
    });
}

// ----------------------------------------------------------------------------
// SEÇÃO 3 — Faixas de referência (independentes de cultura) usadas para
// classificar cada valor de solo em Muito Ruim/Ruim/Regular/Bom/Excelente.
// ----------------------------------------------------------------------------
const adequacyClasses = {
    // Faixas contíguas (sem sobreposição e sem buraco) para que todo
    // valor de pH caia em exatamente uma classe. Antes havia um buraco
    // entre 6.8 e 7.5 em que nenhuma faixa batia e o pH caía no
    // fallback errado ("Muito Ruim"), mesmo sendo um pH neutro ótimo.
    pH: [
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
    ],
    sulfur: [
        { label: 'Excelente', min: 20, max: Infinity },
        { label: 'Bom', min: 10, max: 20 },
        { label: 'Regular', min: 5, max: 10 },
        { label: 'Ruim', min: 2, max: 5 },
        { label: 'Muito Ruim', min: -Infinity, max: 2 }
    ],
    boron: [
        { label: 'Excelente', min: 0.8, max: Infinity },
        { label: 'Bom', min: 0.3, max: 0.8 },
        { label: 'Regular', min: 0.2, max: 0.3 },
        { label: 'Ruim', min: -Infinity, max: 0.2 }
    ],
    zinc: [
        { label: 'Excelente', min: 5, max: Infinity },
        { label: 'Bom', min: 2, max: 5 },
        { label: 'Regular', min: 1, max: 2 },
        { label: 'Ruim', min: -Infinity, max: 1 }
    ],
    copper: [
        { label: 'Excelente', min: 2, max: Infinity },
        { label: 'Bom', min: 0.8, max: 2 },
        { label: 'Regular', min: 0.5, max: 0.8 },
        { label: 'Ruim', min: -Infinity, max: 0.5 }
    ],
    manganese: [
        { label: 'Excelente', min: 50, max: Infinity },
        { label: 'Bom', min: 10, max: 50 },
        { label: 'Regular', min: 5, max: 10 },
        { label: 'Ruim', min: -Infinity, max: 5 }
    ],
    // Alumínio e acidez potencial: quanto menor, melhor (escala invertida)
    aluminum: [
        { label: 'Excelente', min: -Infinity, max: 0.3 },
        { label: 'Bom', min: 0.3, max: 0.5 },
        { label: 'Regular', min: 0.5, max: 1.0 },
        { label: 'Ruim', min: 1.0, max: 2.0 },
        { label: 'Muito Ruim', min: 2.0, max: Infinity }
    ],
    potentialAcidity: [
        { label: 'Excelente', min: -Infinity, max: 2.5 },
        { label: 'Bom', min: 2.5, max: 5.0 },
        { label: 'Regular', min: 5.0, max: 7.5 },
        { label: 'Ruim', min: 7.5, max: 10.0 },
        { label: 'Muito Ruim', min: 10.0, max: Infinity }
    ]
};

const adequacyScoreMap = { Excelente: 100, Bom: 80, Regular: 60, Ruim: 40, 'Muito Ruim': 20 };

function classifyAdequacy(nutrient, value) {
    const reference = adequacyClasses[nutrient] || adequacyClasses[convertNutrientKey(nutrient)];
    if (!reference || value === null || value === undefined || Number.isNaN(Number(value))) return 'Não informado';
    const numericValue = Number(value);
    return reference.find(item => numericValue >= item.min && numericValue < item.max)?.label || reference[reference.length - 1].label;
}

function convertNutrientKey(nutrient) {
    const map = {
        phosphorus: 'phosphorus',
        potassium: 'potassium',
        calcium: 'calcium',
        magnesium: 'magnesium',
        sulfur: 'sulfur',
        iron: 'iron',
        manganese: 'manganese',
        zinc: 'zinc',
        copper: 'copper',
        boron: 'boron'
    };
    return map[nutrient] || nutrient;
}

function getAdequacyColor(score) {
    const normalized = Math.max(0, Math.min(100, Number(score) || 0));
    if (normalized < 40) return '#ef4444';
    if (normalized < 75) return '#facc15';
    return '#5dc135';
}

function getNutrientAdequacyScore(nutrient, value) {
    const label = classifyAdequacy(nutrient, value);
    if (label !== 'Não informado') return adequacyScoreMap[label] || 0;

    const nutrientDef = cropDatabase.milho?.nutrients?.[nutrient];
    if (!nutrientDef || !Array.isArray(nutrientDef.range) || nutrientDef.range.length < 2) return 0;

    const numericValue = Number(value);
    const [min, max] = nutrientDef.range;
    if (numericValue >= min && numericValue <= max) return 100;
    if (numericValue < min) return Math.max(0, 100 - ((min - numericValue) / min) * 150);
    return Math.max(0, 100 - ((numericValue - max) / max) * 100);
}

function getAdequacyGradient(score) {
    const normalized = Math.max(0, Math.min(100, Number(score) || 0));
    if (normalized < 40) {
        return 'linear-gradient(90deg, #ef4444 0%, #f97316 55%, #facc15 100%)';
    }
    if (normalized < 75) {
        return 'linear-gradient(90deg, #facc15 0%, #5dc135 100%)';
    }
    return 'linear-gradient(90deg, #5dc135 0%, #066a04 100%)';
}

// Parses a form field as a number, correctly preserving 0 as a real value
// (unlike `parseFloat(x) || null`, which discards 0 because it's falsy).
function parseFieldValue(elementId) {
    const raw = document.getElementById(elementId)?.value;
    const value = parseFloat(raw);
    return Number.isNaN(value) ? null : value;
}

// ----------------------------------------------------------------------------
// SEÇÃO 4 — Motor de análise em tempo real: lê os campos do formulário,
// recalcula soilData e atualiza todo o painel (score de saúde, compatibilidade
// por cultura, recomendações rápidas). Roda a cada input do formulário (todo
// campo tem oninput/onchange="updateAnalysis()" em index.html) — inclusive
// preenchimentos programáticos, já que js/laudo-parser-client.js dispara um
// Event('input') sintético depois de preencher os campos via IA.
// ----------------------------------------------------------------------------
function updateAnalysis() {
    // Get soil data from form inputs
    soilData.ph = parseFieldValue('soilPH');
    soilData.phCaCl2 = parseFieldValue('soilPHCaCl2');
    soilData.organicMatter = parseFieldValue('organicMatter');
    soilData.aluminum = parseFieldValue('aluminum');
    soilData.potentialAcidity = parseFieldValue('potentialAcidity');
    soilData.sb = parseFieldValue('sb');
    soilData.ctcEfetiva = parseFieldValue('ctcEfetiva');
    soilData.ctcPH7 = parseFieldValue('ctcPH7');
    soilData.vPercent = parseFieldValue('vPercent');
    soilData.mPercent = parseFieldValue('mPercent');
    soilData.indiceSMP = parseFieldValue('indiceSMP');
    soilData.texture.sand = parseFieldValue('sandContent');
    soilData.texture.silt = parseFieldValue('siltContent');
    soilData.texture.clay = parseFieldValue('clayContent');
    soilData.region = document.getElementById('region')?.value.trim() || '';
    soilData.state = document.getElementById('state')?.value.trim() || '';
    soilData.soilType = document.getElementById('soilType')?.value.trim() || '';

    const nutrientIds = ['phosphorus', 'potassium', 'calcium', 'magnesium', 'sulfur',
                        'iron', 'manganese', 'zinc', 'copper', 'boron'];

    nutrientIds.forEach(nutrient => {
        soilData.nutrients[nutrient] = parseFieldValue(nutrient);
    });

    Object.keys(fieldUnitConfig).forEach(field => {
        soilData.units[field] = getFieldUnit(field);
    });

    // Update analysis dashboard
    updateHealthScore();
    updatePHCompatibility();
    updateNutrientStatus();
    updateQuickRecommendations();
    updateCropCompatibility();
    updateSoilChemistryIndicators();
}

// Calcula a saúde geral do solo a partir de um objeto soilData (mesmo shape
// do `soilData` global: ph, organicMatter, aluminum, potentialAcidity,
// nutrients{...}). Função pura — usada por updateHealthScore() (index.html,
// ao vivo) e também por relatorios.html/recommendations.html a partir de
// relatórios salvos, para que a mesma nota apareça em todas as páginas.
function calculateHealthScoreFromData(data) {
    if (!data) return 0;

    let totalScore = 0;
    let factorsCount = 0;

    // pH score based on user reference classes
    if (data.ph !== null && data.ph !== undefined) {
        const label = classifyAdequacy('pH', data.ph);
        totalScore += adequacyScoreMap[label] || 0;
        factorsCount++;
    }

    // Organic matter score based on user reference classes
    if (data.organicMatter !== null && data.organicMatter !== undefined) {
        const label = classifyAdequacy('organicMatter', data.organicMatter);
        totalScore += adequacyScoreMap[label] || 0;
        factorsCount++;
    }

    // Aluminum toxicity score (lower is better)
    if (data.aluminum !== null && data.aluminum !== undefined) {
        const label = classifyAdequacy('aluminum', data.aluminum);
        totalScore += adequacyScoreMap[label] || 0;
        factorsCount++;
    }

    // Potential acidity (H+Al) score (lower is better)
    if (data.potentialAcidity !== null && data.potentialAcidity !== undefined) {
        const label = classifyAdequacy('potentialAcidity', data.potentialAcidity);
        totalScore += adequacyScoreMap[label] || 0;
        factorsCount++;
    }

    // Nutrient scores based on user reference classes
    Object.keys(data.nutrients || {}).forEach(nutrient => {
        const value = data.nutrients[nutrient];
        if (value !== null && value !== undefined) {
            totalScore += getNutrientAdequacyScore(nutrient, value);
            factorsCount++;
        }
    });

    return factorsCount > 0 ? Math.round(totalScore / factorsCount) : 0;
}

// Calculate overall soil health score
function updateHealthScore() {
    const healthScore = calculateHealthScoreFromData(soilData);

    const healthScoreElement = document.getElementById('healthScore');
    const healthBarElement = document.getElementById('healthBar');
    
    if (healthScoreElement) {
        healthScoreElement.textContent = healthScore;
        healthScoreElement.style.color = getAdequacyColor(healthScore);
    }
    
    if (healthBarElement) {
        healthBarElement.style.width = `${healthScore}%`;
        healthBarElement.style.background = getAdequacyGradient(healthScore);
        healthBarElement.className = 'h-2 rounded-full transition-all duration-500';
    }
}

// Calculate individual nutrient score
function calculateNutrientScore(nutrient, value, cropRef) {
    // Coerce value to numeric if it's an object like {val, ref} or a string
    if (value && typeof value === 'object' && 'val' in value) {
        value = parseFloat(value.val);
    } else {
        value = parseFloat(value);
    }
    if (isNaN(value)) return 0;

    // Determine reference crop: accept crop key string or crop object; default to 'milho'
    let referenceCrop = cropDatabase.milho;
    if (cropRef) {
        if (typeof cropRef === 'string' && cropDatabase[cropRef]) referenceCrop = cropDatabase[cropRef];
        else if (typeof cropRef === 'object' && cropRef.nutrients) referenceCrop = cropRef;
    }

    // Prefer the nutrient definition from the reference crop; fall back to milho if missing
    const nutrientDef = (referenceCrop.nutrients && referenceCrop.nutrients[nutrient]) || (cropDatabase.milho.nutrients[nutrient]);
    if (!nutrientDef) {
        const genericLabel = classifyAdequacy(nutrient, value);
        return adequacyScoreMap[genericLabel] || 0;
    }

    const range = nutrientDef.range;
    if (!range || range.length < 2) return 0;

    if (value >= range[0] && value <= range[1]) {
        return 100; // Optimal
    } else if (value < range[0]) {
        const deficiency = (range[0] - value) / range[0];
        return Math.max(0, 100 - deficiency * 150); // Severe deficiency = 0
    } else {
        const excess = (value - range[1]) / range[1];
        return Math.max(0, 100 - excess * 100); // Excess toxicity
    }
}

// Update pH compatibility indicators
function updatePHCompatibility() {
    if (soilData.ph === null) return;
    
    const acidCrops = document.getElementById('acidCrops');
    const neutralCrops = document.getElementById('neutralCrops');
    const alkalineCrops = document.getElementById('alkalineCrops');
    
    if (acidCrops && neutralCrops && alkalineCrops) {
        // Acid crops compatibility (5.0-6.0)
        let acidScore = 0;
        if (soilData.ph <= 6.0) {
            acidScore = Math.max(0, 100 - Math.abs(soilData.ph - 5.5) * 30);
        }
        
        // Neutral crops compatibility (6.0-7.0)
        let neutralScore = 0;
        if (soilData.ph >= 6.0 && soilData.ph <= 7.0) {
            neutralScore = 100 - Math.abs(soilData.ph - 6.5) * 40;
        }
        
        // Alkaline crops compatibility (7.0-8.0)
        let alkalineScore = 0;
        if (soilData.ph >= 7.0) {
            alkalineScore = Math.max(0, 100 - Math.abs(soilData.ph - 7.5) * 25);
        }
        
        acidCrops.style.width = `${acidScore}%`;
        neutralCrops.style.width = `${neutralScore}%`;
        alkalineCrops.style.width = `${alkalineScore}%`;
        
        // Update colors based on compatibility
        acidCrops.className = `h-2 rounded transition-all duration-500 ${acidScore > 60 ? 'nutrient-optimal' : acidScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
        neutralCrops.className = `h-2 rounded transition-all duration-500 ${neutralScore > 60 ? 'nutrient-optimal' : neutralScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
        alkalineCrops.className = `h-2 rounded transition-all duration-500 ${alkalineScore > 60 ? 'nutrient-optimal' : alkalineScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
    }
}

// Update aluminum warning and soil texture sum indicators
function updateSoilChemistryIndicators() {
    const aluminumWarning = document.getElementById('aluminumWarning');
    if (aluminumWarning) {
        if (soilData.aluminum === null) {
            aluminumWarning.classList.add('hidden');
            aluminumWarning.textContent = '';
        } else {
            const label = classifyAdequacy('aluminum', soilData.aluminum);
            aluminumWarning.classList.remove('hidden');
            if (soilData.aluminum > 0.5) {
                aluminumWarning.className = 'mt-3 text-sm font-medium text-red-600';
                aluminumWarning.textContent = `Alumínio tóxico (${label}): pode limitar o desenvolvimento radicular de culturas sensíveis.`;
            } else {
                aluminumWarning.className = 'mt-3 text-sm font-medium text-[#066a04]';
                aluminumWarning.textContent = `✓ Alumínio em nível ${label.toLowerCase()} — sem risco de toxidez.`;
            }
        }
    }

    const textureSum = document.getElementById('textureSum');
    if (textureSum) {
        const { sand, silt, clay } = soilData.texture;
        if (sand === null && silt === null && clay === null) {
            textureSum.textContent = '';
        } else {
            const total = (sand || 0) + (silt || 0) + (clay || 0);
            textureSum.textContent = `Soma: ${total} g/kg (ideal ≈ 1000 g/kg)`;
        }
    }
}

// ----------------------------------------------------------------------------
// Complexo Sortivo e Saturações — calcula SB, CTC efetiva (t), CTC a pH 7,0 (T),
// V% e m% a partir de Ca, Mg, K, Al e H+Al. Os campos calculados continuam
// editáveis: isso só roda quando o agricultor mexe em Ca/Mg/K/Al/H+Al, então
// uma correção manual no SB/CTC/V%/m% não é sobrescrita até a próxima mudança
// nesses campos-fonte.
function calcularComplexoSortivo() {
    const Ca = parseFloat(document.getElementById('calcium')?.value) || 0;
    const Mg = parseFloat(document.getElementById('magnesium')?.value) || 0;
    const K_mgdm3 = parseFloat(document.getElementById('potassium')?.value) || 0;
    const Al = parseFloat(document.getElementById('aluminum')?.value) || 0;
    const HAl = parseFloat(document.getElementById('potentialAcidity')?.value) || 0;

    // Converte K de mg/dm³ (ppm) para cmolc/dm³ (massa molar do K / valência)
    const K_cmolc = K_mgdm3 / 391;

    const SB = Ca + Mg + K_cmolc;
    const t = SB + Al;
    const T = SB + HAl;
    const V = T > 0 ? (SB / T) * 100 : 0;
    const m = t > 0 ? (Al / t) * 100 : 0;

    document.getElementById('sb').value = SB.toFixed(2);
    document.getElementById('ctcEfetiva').value = t.toFixed(2);
    document.getElementById('ctcPH7').value = T.toFixed(2);
    document.getElementById('vPercent').value = V.toFixed(1);
    document.getElementById('mPercent').value = m.toFixed(1);

    atualizarBarraV(V);
    atualizarBarraM(m);

    // Mantém soilData sincronizado imediatamente (updateAnalysis já roda no
    // mesmo evento de input, mas isso garante consistência caso a ordem mude).
    soilData.sb = SB;
    soilData.ctcEfetiva = t;
    soilData.ctcPH7 = T;
    soilData.vPercent = V;
    soilData.mPercent = m;
}

// Barra visual do V% (Saturação por Bases): vermelho < 45%, amarelo 45-64%,
// verde claro 65-80%, verde escuro > 80%.
function atualizarBarraV(v) {
    const barra = document.getElementById('vPercentBar');
    if (!barra) return;
    const largura = Math.min(100, Math.max(0, v));
    barra.style.width = largura + '%';
    if (v < 45) barra.style.backgroundColor = '#B85450';
    else if (v < 65) barra.style.backgroundColor = '#E6B17A';
    else if (v <= 80) barra.style.backgroundColor = '#5dc135';
    else barra.style.backgroundColor = '#066a04';
}

// Barra visual do m% (Saturação por Alumínio): verde ≤ 10%, amarelo 11-20%,
// vermelho > 20%.
function atualizarBarraM(m) {
    const barra = document.getElementById('mPercentBar');
    if (!barra) return;
    const largura = Math.min(100, Math.max(0, m));
    barra.style.width = largura + '%';
    if (m <= 10) barra.style.backgroundColor = '#066a04';
    else if (m <= 20) barra.style.backgroundColor = '#E6B17A';
    else barra.style.backgroundColor = '#B85450';
}

// Update nutrient status display
function updateNutrientStatus() {
    const nutrientStatusElement = document.getElementById('nutrientStatus');
    if (!nutrientStatusElement) return;
    
    let statusHTML = '';
    const nutrientNames = {
        phosphorus: 'Fósforo',
        potassium: 'Potássio',
        calcium: 'Cálcio',
        magnesium: 'Magnésio',
        sulfur: 'Enxofre',
        iron: 'Ferro',
        manganese: 'Manganês',
        zinc: 'Zinco',
        copper: 'Cobre',
        boron: 'Boro'
    };
    
    Object.keys(soilData.nutrients).forEach(nutrient => {
        if (soilData.nutrients[nutrient] !== null) {
            const score = getNutrientAdequacyScore(nutrient, soilData.nutrients[nutrient]);
            const adequacyLabel = classifyAdequacy(nutrient, soilData.nutrients[nutrient]);
            let statusText = adequacyLabel;
            if (adequacyLabel === 'Não informado') {
                if (score >= 80) statusText = 'Excelente';
                else if (score >= 60) statusText = 'Bom';
                else if (score >= 40) statusText = 'Regular';
                else statusText = 'Ruim';
            }
            
            statusHTML += `
                <div class="flex justify-between items-center">
                    <span class="text-sm">${nutrientNames[nutrient]}</span>
                    <div class="flex items-center space-x-2">
                        <div class="w-12 h-2 bg-gray-200 rounded overflow-hidden">
                            <div class="h-2 rounded transition-all duration-500" style="width: ${score}%; background: ${getAdequacyGradient(score)}"></div>
                        </div>
                        <span class="text-xs text-gray-500">${statusText}</span>
                    </div>
                </div>
            `;
        }
    });
    
    if (statusHTML === '') {
        statusHTML = '<div class="text-sm text-gray-500">Insira valores de nutrientes</div>';
    }
    
    nutrientStatusElement.innerHTML = statusHTML;
}

// Update quick recommendations
function updateQuickRecommendations() {
    const recommendationsElement = document.getElementById('quickRecommendations');
    if (!recommendationsElement) return;
    
    let recommendations = [];
    
    // pH recommendations — faixa ótima RS/SC é 5.5-6.5 (CQFS-RS/SC)
    if (soilData.ph !== null) {
        if (soilData.ph < 5.5) {
            recommendations.push('Aplicar calcário para corrigir acidez — consultar índice SMP para dosagem');
        } else if (soilData.ph > 7.5) {
            recommendations.push('Considerar aplicação de enxofre para reduzir pH');
        } else if (soilData.ph > 6.5) {
            recommendations.push('pH acima do ideal para a maioria das culturas do RS/SC');
        }
    }
    
    // Organic matter recommendations
    if (soilData.organicMatter !== null) {
        if (soilData.organicMatter < 2) {
            recommendations.push('Adicionar matéria orgânica (composto ou esterco)');
        }
    }

    // Aluminum toxicity recommendations
    if (soilData.aluminum !== null) {
        if (soilData.aluminum > 1.0) {
            recommendations.push(`Alumínio tóxico elevado (${soilData.aluminum} cmolc/dm³): aplicar calcário para neutralização`);
        } else if (soilData.aluminum > 0.5) {
            recommendations.push('Alumínio em nível de atenção: monitorar e considerar calagem');
        }
    }

    // Potential acidity (H+Al) recommendations
    if (soilData.potentialAcidity !== null && soilData.potentialAcidity > 7.5) {
        recommendations.push('Acidez potencial (H+Al) alta: solo com baixa saturação de bases, avaliar calagem');
    }

    // Nutrient-specific recommendations
    Object.keys(soilData.nutrients).forEach(nutrient => {
        if (soilData.nutrients[nutrient] !== null) {
            const score = calculateNutrientScore(nutrient, soilData.nutrients[nutrient]);
            if (score < 40) {
                const nutrientNames = {
                    phosphorus: 'fósforo',
                    potassium: 'potássio',
                    calcium: 'cálcio',
                    magnesium: 'magnésio',
                    sulfur: 'enxofre',
                    iron: 'ferro',
                    manganese: 'manganês',
                    zinc: 'zinco',
                    copper: 'cobre',
                    boron: 'boro'
                };
                recommendations.push(`Aplicar ${nutrientNames[nutrient]} em deficiência`);
            }
        }
    });
    
    if (recommendations.length === 0) {
        recommendations.push('Seu solo está em boas condições!');
    }
    
    recommendationsElement.innerHTML = recommendations.map(rec => 
        `<div class="text-sm text-gray-600 mb-1">• ${rec}</div>`
    ).join('');
}

// ----------------------------------------------------------------------------
// SEÇÃO 5 — Compatibilidade solo x cultura: para cada uma das 4 culturas de
// cropDatabase, calcula um score 0-100 combinando pH e nutrientes. Consumido
// por recommendations.html para ordenar/filtrar o grid de culturas.
// ----------------------------------------------------------------------------
function updateCropCompatibility() {
    Object.keys(cropDatabase).forEach(cropKey => {
        const result = computeCropCompatibility(soilData, cropKey);
        cropDatabase[cropKey].compatibility = result.overall;
        cropDatabase[cropKey].compatibilityBreakdown = result;
    });
}

// Compute crop-specific compatibility with detailed breakdown
function computeCropCompatibility(soil, cropKey) {
    const crop = typeof cropKey === 'string' ? cropDatabase[cropKey] : cropKey;
    if (!crop) return { overall: 0, ph: 0, nutrientScores: {} };

    const phWeight = 0.25;
    const nutrientWeight = 1 - phWeight;

    // pH score (0-100)
    let phScore = 0;
    if (soil && (soil.ph !== null && soil.ph !== undefined)) {
        const ph = parseFloat(soil.ph);
        if (isNaN(ph)) {
            phScore = 0;
        } else {
        if (ph >= crop.phRange[0] && ph <= crop.phRange[1]) {
            phScore = 100 - Math.abs(ph - crop.optimalPh) * 20;
        } else {
            const distance = Math.min(Math.abs(ph - crop.phRange[0]), Math.abs(ph - crop.phRange[1]));
            phScore = Math.max(0, 60 - distance * 30);
        }
            phScore = Math.max(0, Math.min(100, Math.round(phScore)));
        }
    }

    // Nutrient scores
    const macroKeys = ['phosphorus','potassium','calcium','magnesium','sulfur'];
    const nutrientScores = {};
    let weightedSum = 0;
    let weightSum = 0;

    Object.keys(crop.nutrients).forEach(nutr => {
        let soilVal = null;
        if (soil && soil.nutrients) {
            soilVal = soil.nutrients[nutr];
            // if nutrients saved as label-keyed objects, try to find by mapping
            if (soilVal === undefined) {
                // try human label keys mapping
                const labelMap = {
                    phosphorus: 'Fósforo (P)',
                    potassium: 'Potássio (K)',
                    calcium: 'Cálcio (Ca)',
                    magnesium: 'Magnésio (Mg)',
                    sulfur: 'Enxofre (S)',
                    iron: 'Ferro (Fe)',
                    manganese: 'Manganês (Mn)',
                    zinc: 'Zinco (Zn)',
                    copper: 'Cobre (Cu)',
                    boron: 'Boro (B)'
                };
                const maybe = soil.nutrients[labelMap[nutr]];
                if (maybe !== undefined) soilVal = maybe && maybe.val !== undefined ? maybe.val : maybe;
            }
        }
        const score = (soilVal !== null && soilVal !== undefined) ? calculateNutrientScore(nutr, soilVal, crop) : 0;
        const weight = macroKeys.includes(nutr) ? 1.5 : 1.0;
        nutrientScores[nutr] = { score: Math.round(score), value: soilVal };
        weightedSum += score * weight;
        weightSum += weight;
    });

    const nutrientAvg = weightSum > 0 ? Math.round(weightedSum / weightSum) : 0;

    const overall = Math.round(phWeight * phScore + nutrientWeight * nutrientAvg);

    return {
        overall,
        ph: phScore,
        nutrientAverage: nutrientAvg,
        nutrientScores
    };
}

// ----------------------------------------------------------------------------
// SEÇÃO 6 — Relatórios salvos: persiste a análise atual (soilData +
// compatibilidade por cultura) em userStorage, sob a chave
// 'soilAnalysisReports' (lista de relatórios) e 'soilAnalysisData' (só o
// mais recente, para carregamento rápido). relatorios.html e
// recommendations.html leem esses relatórios para exibir/recalcular.
// ----------------------------------------------------------------------------
function generateFullReport(showAlert = true, title = null) {
    updateAnalysis();

    const report = createAnalysisReport(title);
    const savedReports = getSavedReports();
    savedReports.push(report);

    userStorage.setItem('soilAnalysisReports', JSON.stringify(savedReports));
    // also store the latest analysis data for other pages to pick up
    userStorage.setItem('soilAnalysisData', JSON.stringify({ soilData: report.soilData, cropCompatibility: report.cropCompatibility }));

    updateSavedReportCount();

    if (showAlert) {
        alert('Relatório salvo com sucesso! Você pode gerar outro ou visualizar os relatórios salvos.');
    }
}

function createAnalysisReport(title = null) {
    const timestamp = new Date().toISOString();
    const formattedTitle = title && title.trim().length > 0 ? title.trim() :
        `Relatório ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    const plantedCropSelect = document.getElementById('plantedCropFollowUp');

    return {
        id: timestamp,
        title: formattedTitle,
        timestamp,
        soilData: JSON.parse(JSON.stringify(soilData)),
        cropCompatibility: JSON.parse(JSON.stringify(cropDatabase)),
        plantedCropFollowUp: plantedCropSelect ? plantedCropSelect.value : ''
    };
}

function getSavedReports() {
    return JSON.parse(userStorage.getItem('soilAnalysisReports') || '[]');
}

function saveReport() {
    const title = prompt('Nome do relatório (opcional):');
    generateFullReport(true, title);
}

function saveReportAndRedirect(targetPage) {
    generateFullReport(false);
    if (targetPage && targetPage.includes('relatorios.html')) {
        const sep = targetPage.includes('?') ? '&' : '?';
        window.location.href = `${targetPage}${sep}laudo=last`;
    } else {
        window.location.href = targetPage;
    }
}

function updateSavedReportCount() {
    const count = getSavedReports().length;
    const countElement = document.getElementById('savedReportCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

function prepareReportAndRedirect(targetPage) {
    saveReportAndRedirect(targetPage);
}

// ----------------------------------------------------------------------------
// SEÇÃO 7 — Exporta as funções que as páginas HTML chamam via onclick=""
// ou <script> inline (o restante do arquivo fica "privado" no escopo do
// módulo).
// ----------------------------------------------------------------------------
window.updateAnalysis = updateAnalysis;
window.generateFullReport = generateFullReport;
window.prepareReportAndRedirect = saveReportAndRedirect;
window.saveReport = saveReport;
window.computeCropCompatibility = computeCropCompatibility;
window.initializeAnalysis = initializeAnalysis;