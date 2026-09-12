// ============================================================================
// Conversão de unidades de laudo de solo para a unidade canônica esperada
// pelos motores de cálculo do site (adubacaoEngine, rotacaoEngine,
// calcularComplexoSortivo em main.js, calcularFertilidade em talhoes.js
// etc.). Antes desta correção, nenhum lugar do sistema convertia valores —
// um laudo em mmolc/dm³, g/dm³ ou g/kg entrava direto em cálculos que
// esperam mg/dm³, cmolc/dm³ ou % (silenciosamente, sem erro), gerando
// classificações e doses de insumo erradas por um fator de 10x/391x/etc.
//
// Mesmo arquivo servido para backend (require) e frontend (<script>) — ver
// o UMD wrapper no final. Se este arquivo mudar, copie a mudança para
// js/units.js (frontend) e backend/public/js/units.js (cópia de deploy) —
// os três precisam ficar idênticos.
//
// Unidades canônicas por campo (mesma referência de fieldUnitConfig em
// main.js e de ADEQUACY_CLASSES em backend/routes/talhoes.js):
//   potássio                    → mg/dm³
//   fósforo, enxofre, micros    → mg/dm³
//   cálcio, magnésio            → cmolc/dm³
//   alumínio, acidez potencial,
//     SB/CTC efetiva/CTC pH7    → cmolc/dm³
//   matéria orgânica, argila,
//     silte, areia              → %
// ============================================================================

(function (root, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    } else {
        root.CycleSownUnits = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // Cada campo numérico do site pertence a uma destas "famílias" de
    // conversão. Vários nomes de campo (fieldUnitConfig, colunas solo_* do
    // banco, chaves do JSON retornado pela IA do laudo) apontam para a
    // mesma família via CAMPO_ALIASES logo abaixo.
    const CONVERSORES = {
        // --- Potássio: canônico mg/dm³ ---------------------------------------
        // Massa molar do K = 39,1 g/mol, valência 1 → 1 mmolc/dm³ = 39,1 mg/dm³
        // e 1 cmolc/dm³ (= 10 mmolc/dm³) = 391 mg/dm³.
        potassium: {
            canonical: 'mg/dm³',
            mgdm3: (v) => v,
            mgkg: (v) => v,
            cmolcdm3: (v) => v * 391,
            mmolcdm3: (v) => v * 39.1
        },
        // --- Cálcio e Magnésio: canônico cmolc/dm³ ----------------------------
        // mg/dm³ → cmolc/dm³ usando a massa equivalente (massa molar / valência
        // 2): Ca = 40,08/2 × 10 = 200,4; Mg = 24,31/2 × 10 = 121,6.
        calcium: {
            canonical: 'cmolc/dm³',
            cmolcdm3: (v) => v,
            mmolcdm3: (v) => v / 10,
            meq100ml: (v) => v,
            mgdm3: (v) => v / 200.4
        },
        magnesium: {
            canonical: 'cmolc/dm³',
            cmolcdm3: (v) => v,
            mmolcdm3: (v) => v / 10,
            meq100ml: (v) => v,
            mgdm3: (v) => v / 121.6
        },
        // --- Alumínio, Acidez potencial (H+Al) e SB/CTC: canônico cmolc/dm³ ---
        aluminum: {
            canonical: 'cmolc/dm³',
            cmolcdm3: (v) => v,
            mmolcdm3: (v) => v / 10,
            meq100ml: (v) => v
        },
        potentialAcidity: {
            canonical: 'cmolc/dm³',
            cmolcdm3: (v) => v,
            mmolcdm3: (v) => v / 10,
            meq100ml: (v) => v
        },
        ctc: {
            canonical: 'cmolc/dm³',
            cmolcdm3: (v) => v,
            mmolcdm3: (v) => v / 10,
            meq100ml: (v) => v
        },
        // --- Matéria orgânica, argila, silte, areia: canônico % --------------
        organicMatter: {
            canonical: '%',
            percent: (v) => v,
            gkg: (v) => v / 10,
            gdm3: (v) => v / 10
        },
        clay: {
            canonical: '%',
            percent: (v) => v,
            gkg: (v) => v / 10,
            gdm3: (v) => v / 10
        },
        silt: {
            canonical: '%',
            percent: (v) => v,
            gkg: (v) => v / 10,
            gdm3: (v) => v / 10
        },
        sand: {
            canonical: '%',
            percent: (v) => v,
            gkg: (v) => v / 10,
            gdm3: (v) => v / 10
        },
        // --- Fósforo, enxofre e micronutrientes: canônico mg/dm³ --------------
        phosphorus: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        sulfur: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        iron: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        manganese: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        zinc: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        copper: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v },
        boron: { canonical: 'mg/dm³', mgdm3: (v) => v, mgkg: (v) => v }
    };

    // "ppm" (fósforo/potássio/enxofre/micros) equivale a mg/dm³ em laudo de
    // solo — mesma família mgdm3 acima.
    CONVERSORES.phosphorus.ppm = CONVERSORES.phosphorus.mgdm3;
    CONVERSORES.potassium.ppm = CONVERSORES.potassium.mgdm3;
    CONVERSORES.sulfur.ppm = CONVERSORES.sulfur.mgdm3;
    CONVERSORES.iron.ppm = CONVERSORES.iron.mgdm3;
    CONVERSORES.manganese.ppm = CONVERSORES.manganese.mgdm3;
    CONVERSORES.zinc.ppm = CONVERSORES.zinc.mgdm3;
    CONVERSORES.copper.ppm = CONVERSORES.copper.mgdm3;
    CONVERSORES.boron.ppm = CONVERSORES.boron.mgdm3;

    // Nomes alternativos usados nos vários lugares do site (fieldUnitConfig
    // de main.js, colunas solo_* do banco, caminhos do JSON da IA de laudo)
    // que devem resolver para a mesma família de conversão acima. As chaves
    // abaixo podem ser escritas em qualquer capitalização — são
    // normalizadas para minúsculas ao montar CAMPO_ALIASES logo depois,
    // porque resolverFamilia() sempre consulta em minúsculas.
    const CAMPO_ALIASES_ORIGEM = {
        potassium: 'potassium', solo_k: 'potassium', k: 'potassium',
        calcium: 'calcium', solo_ca: 'calcium', ca: 'calcium',
        magnesium: 'magnesium', solo_mg: 'magnesium', mg: 'magnesium',
        aluminum: 'aluminum', solo_al: 'aluminum', al: 'aluminum',
        potentialAcidity: 'potentialAcidity', solo_h_al: 'potentialAcidity',
        ctc: 'ctc', solo_ctc: 'ctc', sb: 'ctc', ctcEfetiva: 'ctc', ctcPH7: 'ctc',
        organicMatter: 'organicMatter', solo_mo: 'organicMatter', mo: 'organicMatter',
        clay: 'clay', clayContent: 'clay', solo_argila: 'clay', argila: 'clay',
        silt: 'silt', siltContent: 'silt',
        sand: 'sand', sandContent: 'sand',
        phosphorus: 'phosphorus', solo_p: 'phosphorus', p: 'phosphorus',
        sulfur: 'sulfur', s: 'sulfur',
        iron: 'iron', fe: 'iron',
        manganese: 'manganese', mn: 'manganese',
        zinc: 'zinc', zn: 'zinc',
        copper: 'copper', cu: 'copper',
        boron: 'boron', b: 'boron'
    };
    const CAMPO_ALIASES = {};
    Object.keys(CAMPO_ALIASES_ORIGEM).forEach((chave) => {
        CAMPO_ALIASES[chave.toLowerCase()] = CAMPO_ALIASES_ORIGEM[chave];
    });

    function resolverFamilia(campo) {
        if (!campo) return null;
        const chave = String(campo).toLowerCase();
        const familia = CAMPO_ALIASES[chave];
        return familia && CONVERSORES[familia] ? familia : null;
    }

    // Normaliza o texto de uma unidade (como digitado nos <select> do site,
    // ex.: "ppm (mg/dm³)", "cmolc/dm³", ou os códigos curtos que a IA do
    // laudo devolve, ex.: "cmolcdm3") para um token comparável.
    function normalizarUnidade(unidade) {
        let u = String(unidade || '').toLowerCase();
        u = u.replace(/³/g, '3');
        u = u.replace(/\([^)]*\)/g, ''); // remove "(mg/dm³)" de "ppm (mg/dm³)"
        u = u.replace(/\s+/g, '');
        return u;
    }

    const UNIT_TOKENS = {
        'mg/dm3': 'mgdm3', mgdm3: 'mgdm3',
        'mg/kg': 'mgkg', mgkg: 'mgkg',
        ppm: 'ppm',
        'cmolc/dm3': 'cmolcdm3', cmolcdm3: 'cmolcdm3',
        'mmolc/dm3': 'mmolcdm3', mmolcdm3: 'mmolcdm3',
        'meq/100ml': 'meq100ml', meq100ml: 'meq100ml',
        '%': 'percent', percentage: 'percent', percent: 'percent',
        'g/kg': 'gkg', gkg: 'gkg',
        'g/dm3': 'gdm3', gdm3: 'gdm3'
    };

    function resolverToken(unidade) {
        const normalizado = normalizarUnidade(unidade);
        return UNIT_TOKENS[normalizado] || null;
    }

    // Converte `valor` (na `unidade` informada) para a unidade canônica do
    // `campo`. Retorna null se o valor não for um número válido. Se `campo`
    // não pertence a nenhuma família conhecida, ou `unidade` não é
    // reconhecida (incluindo vazia/undefined — comportamento anterior, sem
    // conversão), devolve o número tal como veio, para nunca travar o
    // salvamento por causa de uma unidade não mapeada.
    function toCanonical(campo, valor, unidade) {
        if (valor === null || valor === undefined || valor === '') return null;
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return null;

        const familia = resolverFamilia(campo);
        if (!familia) return numero;

        const token = resolverToken(unidade);
        if (!token) return numero;

        const conversor = CONVERSORES[familia][token];
        if (!conversor) return numero;

        const convertido = conversor(numero);
        return Number.isFinite(convertido) ? Math.round(convertido * 10000) / 10000 : numero;
    }

    // Unidade canônica (texto de exibição) de um campo, ou null se o campo
    // não faz parte de nenhuma família de conversão (ex.: pH, SMP, V%, m%).
    function getCanonicalUnit(campo) {
        const familia = resolverFamilia(campo);
        return familia ? CONVERSORES[familia].canonical : null;
    }

    return { toCanonical, getCanonicalUnit };
});
