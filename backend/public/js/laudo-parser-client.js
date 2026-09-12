// ============================================================================
// Cycle Sown — upload do laudo de solo (PDF/foto) e preenchimento automático
// do formulário de index.html via IA (backend: POST /api/parse-laudo).
// ============================================================================

// Mesmo endereço de API usado em js/auth.js: caminho relativo, já que o
// backend serve o frontend a partir da mesma origem.
const LAUDO_API_BASE_URL = '/api';

const LAUDO_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const LAUDO_ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// ----------------------------------------------------------------------------
// Mapeamento chave do JSON da IA → id do campo no formulário (index.html).
// A ordem importa: os campos-fonte do Complexo Sortivo (Ca, Mg, K, Al, H+Al)
// precisam ser preenchidos ANTES de sb/ctcEfetiva/ctcPH7/vPercent/mPercent,
// porque preencher aqueles dispara o recálculo automático em main.js
// (calcularComplexoSortivo, ligado ao evento "input" desses 5 campos). Assim,
// se o laudo trouxer SB/CTC/V%/m% já calculados, eles sobrescrevem o valor
// recalculado; se não trouxer, o valor calculado automaticamente permanece.
// ----------------------------------------------------------------------------
// Campos com `unitElementId` são pares valor+unidade no JSON da IA
// (ex.: data.potassium = { value, unit }); `canonicalField` é o nome de
// família usado por units.js (backend/utils/units.js, também servido ao
// frontend como js/units.js) para converter o valor para a unidade
// canônica dos motores de cálculo ANTES de gravar no campo — ver
// laudoFillFormFromData() abaixo. Campos sem `unitElementId` (pH, SMP,
// V%, m%) não têm unidade de laudo e são gravados como vieram.
const LAUDO_FIELD_MAP = [
    { path: 'phWater', elementId: 'soilPH' },
    { path: 'phCaCl2', elementId: 'soilPHCaCl2' },
    { path: 'smpIndex', elementId: 'indiceSMP' },

    { path: 'organicMatter', elementId: 'organicMatter', unitElementId: 'organicMatter_unit', canonicalField: 'organicMatter' },

    { path: 'clay', elementId: 'clayContent', unitElementId: 'clayContent_unit', canonicalField: 'clay' },
    { path: 'sand', elementId: 'sandContent', unitElementId: 'sandContent_unit', canonicalField: 'sand' },
    { path: 'silt', elementId: 'siltContent', unitElementId: 'siltContent_unit', canonicalField: 'silt' },

    { path: 'phosphorus', elementId: 'phosphorus', unitElementId: 'phosphorus_unit', canonicalField: 'phosphorus' },
    { path: 'potassium', elementId: 'potassium', unitElementId: 'potassium_unit', canonicalField: 'potassium' },
    { path: 'calcium', elementId: 'calcium', unitElementId: 'calcium_unit', canonicalField: 'calcium' },
    { path: 'magnesium', elementId: 'magnesium', unitElementId: 'magnesium_unit', canonicalField: 'magnesium' },
    { path: 'sulfur', elementId: 'sulfur', unitElementId: 'sulfur_unit', canonicalField: 'sulfur' },

    { path: 'aluminum', elementId: 'aluminum', unitElementId: 'aluminum_unit', canonicalField: 'aluminum' },
    { path: 'potentialAcidity', elementId: 'potentialAcidity', unitElementId: 'potentialAcidity_unit', canonicalField: 'potentialAcidity' },

    { path: 'iron', elementId: 'iron', unitElementId: 'iron_unit', canonicalField: 'iron' },
    { path: 'manganese', elementId: 'manganese', unitElementId: 'manganese_unit', canonicalField: 'manganese' },
    { path: 'zinc', elementId: 'zinc', unitElementId: 'zinc_unit', canonicalField: 'zinc' },
    { path: 'copper', elementId: 'copper', unitElementId: 'copper_unit', canonicalField: 'copper' },
    { path: 'boron', elementId: 'boron', unitElementId: 'boron_unit', canonicalField: 'boron' },

    // Complexo sortivo — preenchidos por último de propósito (ver comentário acima).
    { path: 'sb', elementId: 'sb', unitElementId: 'sb_unit', canonicalField: 'ctc' },
    { path: 'ctcEffective', elementId: 'ctcEfetiva', unitElementId: 'ctcEfetiva_unit', canonicalField: 'ctc' },
    { path: 'ctcPH7', elementId: 'ctcPH7', unitElementId: 'ctcPH7_unit', canonicalField: 'ctc' },
    { path: 'vPercentage', elementId: 'vPercent' },
    { path: 'mPercentage', elementId: 'mPercent' }
];

// Código curto (mesmo formato que a IA devolve em `*.unit`, ver
// LAUDO_UNIT_CANDIDATES abaixo) da unidade CANÔNICA de cada família — usado
// para selecionar, no <select> do campo, a opção que corresponde à unidade
// canônica depois da conversão (o valor gravado no campo é sempre
// convertido para essa unidade, então o <select> precisa refletir isso).
const CANONICAL_UNIT_CODE = {
    organicMatter: 'percentage', clay: 'percentage', sand: 'percentage', silt: 'percentage',
    phosphorus: 'mgdm3', potassium: 'mgdm3', sulfur: 'mgdm3',
    iron: 'mgdm3', manganese: 'mgdm3', zinc: 'mgdm3', copper: 'mgdm3', boron: 'mgdm3',
    calcium: 'cmolcdm3', magnesium: 'cmolcdm3', aluminum: 'cmolcdm3',
    potentialAcidity: 'cmolcdm3', ctc: 'cmolcdm3'
};

// Cada select de unidade em index.html usa o texto literal do laudo como
// value (ex.: "cmolc/dm³", "ppm (mg/dm³)", "%"), não um código curto. A IA
// devolve códigos curtos (cmolcdm3, mgdm3, percentage...), então mapeamos
// cada código para candidatos de texto e procuramos, nas <option> reais do
// próprio <select>, qual bate — assim o mesmo código "mgdm3" resolve para
// "ppm (mg/dm³)" no Fósforo e para "mg/dm³" no Cálcio, sem precisar de uma
// tabela por campo.
const LAUDO_UNIT_CANDIDATES = {
    mgdm3: ['mg/dm3', 'ppm(mg/dm3)'],
    mgkg: ['mg/kg'],
    ppm: ['ppm(mg/dm3)', 'ppm'],
    cmolcdm3: ['cmolc/dm3'],
    mmolcdm3: ['mmolc/dm3'],
    meq100ml: ['meq/100ml'],
    percentage: ['%'],
    gkg: ['g/kg'],
    gdm3: ['g/dm3']
};

function laudoNormalizeUnitText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/³/g, '3')
        .replace(/\s+/g, '');
}

function laudoFindSelectValueForUnit(selectEl, unitCode) {
    if (!selectEl || !unitCode) return null;
    const candidates = LAUDO_UNIT_CANDIDATES[laudoNormalizeUnitText(unitCode)];
    if (!candidates) return null;

    const options = Array.from(selectEl.options || []);
    for (const candidate of candidates) {
        const normalizedCandidate = laudoNormalizeUnitText(candidate);
        const match = options.find((opt) => laudoNormalizeUnitText(opt.value).includes(normalizedCandidate));
        if (match) return match.value;
    }
    return null;
}

function laudoGetNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), obj);
}

// Remove o destaque "preenchido pela IA" assim que o agricultor mexer no campo.
function laudoClearHighlightOnEdit(el) {
    el.addEventListener('focus', () => el.classList.remove('ai-filled'), { once: true });
}

// Preenche um campo (input ou select) e dispara os eventos que o resto do
// site espera (updateAnalysis, calcularComplexoSortivo, barras de cor etc.
// em main.js estão todos ligados a "input"/"change").
function laudoSetFieldValue(entry) {
    const el = document.getElementById(entry.elementId);
    if (!el) return false;

    let valueToSet = entry.rawValue;
    if (entry.isUnit) {
        valueToSet = laudoFindSelectValueForUnit(el, entry.rawValue);
        if (valueToSet === null) return false;
    }

    el.value = valueToSet;
    el.classList.add('ai-filled');
    laudoClearHighlightOnEdit(el);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function laudoFillFormFromData(data) {
    let filledCount = 0;

    LAUDO_FIELD_MAP.forEach(({ path, elementId, unitElementId, canonicalField }) => {
        // Campo sem unidade de laudo (pH, SMP, V%, m%) — grava como veio.
        if (!unitElementId) {
            const rawValue = laudoGetNestedValue(data, path);
            if (rawValue === null || rawValue === undefined || rawValue === '') return;
            if (laudoSetFieldValue({ elementId, rawValue })) filledCount++;
            return;
        }

        const rawUnitCode = laudoGetNestedValue(data, `${path}.unit`);
        const rawValue = laudoGetNestedValue(data, `${path}.value`);
        if (rawValue === null || rawValue === undefined || rawValue === '') return;

        // A unidade é processada ANTES do valor: o <select> já precisa
        // mostrar a unidade canônica no momento em que o campo numérico
        // dispara seu evento "input" — calcularComplexoSortivo (main.js) lê
        // a unidade selecionada NA HORA para converter K/Ca/Mg/Al/H+Al.
        const unitSelectEl = document.getElementById(unitElementId);
        if (unitSelectEl) {
            const targetCode = CANONICAL_UNIT_CODE[canonicalField] || rawUnitCode;
            const optionValue = laudoFindSelectValueForUnit(unitSelectEl, targetCode);
            if (optionValue !== null) {
                unitSelectEl.value = optionValue;
                unitSelectEl.classList.add('ai-filled');
                laudoClearHighlightOnEdit(unitSelectEl);
                unitSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
                filledCount++;
            }
        }

        // Converte para a unidade canônica ANTES de gravar no campo — um
        // laudo em mmolc/dm³, g/kg ou g/dm³ não pode entrar direto num
        // motor que espera cmolc/dm³ ou % (ver backend/utils/units.js,
        // também servido ao frontend como js/units.js).
        const numericValue = Number(rawValue);
        let valueToSet = rawValue;
        if (Number.isFinite(numericValue) && window.CycleSownUnits) {
            const converted = window.CycleSownUnits.toCanonical(canonicalField, numericValue, rawUnitCode);
            if (Number.isFinite(converted)) valueToSet = converted;
        }

        if (laudoSetFieldValue({ elementId, rawValue: valueToSet })) filledCount++;
    });

    return filledCount;
}

// ----------------------------------------------------------------------------
// UI: status da leitura e área de upload (clique + arrastar-e-soltar)
// ----------------------------------------------------------------------------
function laudoSetStatus(type, message) {
    const statusEl = document.getElementById('laudo-status');
    if (!statusEl) return;
    if (!message) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        statusEl.className = 'laudo-status';
        return;
    }
    statusEl.style.display = 'block';
    statusEl.className = `laudo-status ${type}`;
    statusEl.textContent = message;
}

function laudoSetLoading(isLoading) {
    const area = document.getElementById('laudo-upload-area');
    if (area) area.classList.toggle('loading', isLoading);
}

function laudoValidateFile(file) {
    if (!LAUDO_ALLOWED_TYPES.includes(file.type)) {
        return 'Formato não suportado. Envie um PDF, PNG, JPG ou WebP.';
    }
    if (file.size > LAUDO_MAX_FILE_SIZE) {
        return 'Arquivo muito grande. O limite é 20 MB.';
    }
    return null;
}

async function laudoUploadFile(file) {
    const validationError = laudoValidateFile(file);
    if (validationError) {
        laudoSetStatus('error', validationError);
        return;
    }

    laudoSetLoading(true);
    laudoSetStatus('loading', 'Lendo o laudo com IA... Isso pode levar alguns segundos.');

    try {
        const formData = new FormData();
        formData.append('laudo', file);

        // /api/parse-laudo exige login (authMiddleware, backend) — sem o
        // header, a API responde 401 antes mesmo de chamar a IA.
        const token = localStorage.getItem('cycleSownToken');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const response = await fetch(`${LAUDO_API_BASE_URL}/parse-laudo`, {
            method: 'POST',
            headers,
            body: formData
        });

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            throw new Error((data && data.error) || 'Não foi possível ler o laudo.');
        }

        const filledCount = laudoFillFormFromData(data || {});
        if (filledCount > 0) {
            laudoSetStatus('success', `Laudo lido! ${filledCount} campo(s) preenchido(s). Confira os valores.`);
        } else {
            laudoSetStatus('error', 'A IA não conseguiu identificar valores neste laudo. Preencha manualmente.');
        }
    } catch (err) {
        laudoSetStatus('error', `${err.message || 'Erro ao ler o laudo.'} Você pode preencher os campos manualmente.`);
    } finally {
        laudoSetLoading(false);
    }
}

function laudoInitUploadArea() {
    const area = document.getElementById('laudo-upload-area');
    const fileInput = document.getElementById('laudo-file-input');
    if (!area || !fileInput) return;

    area.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
        if (file) laudoUploadFile(file);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
        area.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            area.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        area.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            area.classList.remove('drag-over');
        });
    });

    area.addEventListener('drop', (event) => {
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) laudoUploadFile(file);
    });
}

document.addEventListener('DOMContentLoaded', laudoInitUploadArea);
