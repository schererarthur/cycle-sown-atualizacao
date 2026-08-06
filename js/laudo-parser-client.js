// ============================================================================
// Cycle Sown — upload do laudo de solo (PDF/foto) e preenchimento automático
// do formulário de index.html via IA (backend: POST /api/parse-laudo).
// ============================================================================

// Mesmo endereço de API usado em js/auth.js: backend local em desenvolvimento,
// backend publicado (Railway) em produção.
const LAUDO_API_BASE_URL = (window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname))
    ? 'http://localhost:3000/api'
    : 'https://backend-production-2af81.up.railway.app/api';

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
const LAUDO_FIELD_MAP = [
    { path: 'phWater', elementId: 'soilPH' },
    { path: 'phCaCl2', elementId: 'soilPHCaCl2' },
    { path: 'smpIndex', elementId: 'indiceSMP' },

    { path: 'organicMatter.value', elementId: 'organicMatter' },
    { path: 'organicMatter.unit', elementId: 'organicMatter_unit', isUnit: true },

    { path: 'clay.value', elementId: 'clayContent' },
    { path: 'clay.unit', elementId: 'clayContent_unit', isUnit: true },
    { path: 'sand.value', elementId: 'sandContent' },
    { path: 'sand.unit', elementId: 'sandContent_unit', isUnit: true },
    { path: 'silt.value', elementId: 'siltContent' },
    { path: 'silt.unit', elementId: 'siltContent_unit', isUnit: true },

    { path: 'phosphorus.value', elementId: 'phosphorus' },
    { path: 'phosphorus.unit', elementId: 'phosphorus_unit', isUnit: true },
    { path: 'potassium.value', elementId: 'potassium' },
    { path: 'potassium.unit', elementId: 'potassium_unit', isUnit: true },
    { path: 'calcium.value', elementId: 'calcium' },
    { path: 'calcium.unit', elementId: 'calcium_unit', isUnit: true },
    { path: 'magnesium.value', elementId: 'magnesium' },
    { path: 'magnesium.unit', elementId: 'magnesium_unit', isUnit: true },
    { path: 'sulfur.value', elementId: 'sulfur' },
    { path: 'sulfur.unit', elementId: 'sulfur_unit', isUnit: true },

    { path: 'aluminum.value', elementId: 'aluminum' },
    { path: 'aluminum.unit', elementId: 'aluminum_unit', isUnit: true },
    { path: 'potentialAcidity.value', elementId: 'potentialAcidity' },
    { path: 'potentialAcidity.unit', elementId: 'potentialAcidity_unit', isUnit: true },

    { path: 'iron.value', elementId: 'iron' },
    { path: 'iron.unit', elementId: 'iron_unit', isUnit: true },
    { path: 'manganese.value', elementId: 'manganese' },
    { path: 'manganese.unit', elementId: 'manganese_unit', isUnit: true },
    { path: 'zinc.value', elementId: 'zinc' },
    { path: 'zinc.unit', elementId: 'zinc_unit', isUnit: true },
    { path: 'copper.value', elementId: 'copper' },
    { path: 'copper.unit', elementId: 'copper_unit', isUnit: true },
    { path: 'boron.value', elementId: 'boron' },
    { path: 'boron.unit', elementId: 'boron_unit', isUnit: true },
    { path: 'molybdenum.value', elementId: 'molybdenum' },
    { path: 'molybdenum.unit', elementId: 'molybdenum_unit', isUnit: true },

    // Complexo sortivo — preenchidos por último de propósito (ver comentário acima).
    { path: 'sb.value', elementId: 'sb' },
    { path: 'sb.unit', elementId: 'sb_unit', isUnit: true },
    { path: 'ctcEffective.value', elementId: 'ctcEfetiva' },
    { path: 'ctcEffective.unit', elementId: 'ctcEfetiva_unit', isUnit: true },
    { path: 'ctcPH7.value', elementId: 'ctcPH7' },
    { path: 'ctcPH7.unit', elementId: 'ctcPH7_unit', isUnit: true },
    { path: 'vPercentage', elementId: 'vPercent' },
    { path: 'mPercentage', elementId: 'mPercent' }
];

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
    LAUDO_FIELD_MAP.forEach(({ path, elementId, isUnit }) => {
        const rawValue = laudoGetNestedValue(data, path);
        if (rawValue === null || rawValue === undefined || rawValue === '') return;
        const applied = laudoSetFieldValue({ elementId, rawValue, isUnit });
        if (applied) filledCount++;
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

        const response = await fetch(`${LAUDO_API_BASE_URL}/parse-laudo`, {
            method: 'POST',
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
