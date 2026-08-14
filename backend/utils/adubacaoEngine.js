// ============================================================================
// Calculadora de Adubação e Calagem (routes/relatorios.js, relatório
// "adubacao") — dose de calcário (método SMP) + N/P₂O₅/K₂O + custo estimado
// para Soja, Milho, Trigo e Fumo, RS/SC. Fonte: Manual de Calagem e Adubação
// CQFS-RS/SC (2016), mesma referência de data/culturas.js e rotacaoEngine.js.
// Motor puro (sem I/O) — a rota busca os dados do talhão/histórico e chama
// calcularAdubacao().
//
// Corrigido a partir de um prompt de referência com 4 problemas reais:
//   1. As faixas de classificação de P/K tinham lacunas entre bandas
//      (ex.: "0–2.0" e depois "2.1–4.0" — um valor como 2.05 não caía em
//      nenhuma das duas e virava "Muito Alto" por padrão, subestimando a
//      necessidade de adubação). Reescrito como cascata de limites máximos.
//   2. A extrapolação de calagem para SMP abaixo do mínimo da tabela (4.4)
//      interpolava entre a primeira e a última linha da tabela inteira,
//      OBTENDO UMA DOSE MENOR do que a do próprio SMP 4.4 para solos ainda
//      mais ácidos — o oposto do que deveria acontecer. Agora usa a dose da
//      linha 4.4 como piso, com aviso.
//   3. "Cultura anterior" (usada para reduzir N do trigo após leguminosa)
//      comparava contra uma lista fixa de strings. Substituído por consulta
//      a CULTURAS[nome].familia === 'leguminosa' — mesma fonte de dados já
//      usada pelo Planejador de Rotação, então cobre qualquer leguminosa
//      cadastrada (Soja, Feijão, Ervilhaca), não só as 3 citadas no prompt.
//   4. As colunas de pH-alvo 5,5 usadas por outro método do manual foram
//      removidas: as 4 culturas cobertas aqui usam todas pH-alvo 6,0 no
//      RS/SC, então a coluna 5,5/ramo morto do prompt original foi só
//      simplificada, não usada por engano.
// ============================================================================

const CULTURAS = require('../data/culturas');

const CULTURAS_SUPORTADAS = ['Soja', 'Milho', 'Trigo', 'Fumo'];

// ----------------------------------------------------------------------------
// Preços de insumos — estimativas fixas (posto fazenda, referência RS) para
// o custo aproximado exibido no relatório. NÃO vêm do banco. Atualizar
// periodicamente à mão conforme o mercado (mesma limitação já assumida por
// custo_estimado_ha em data/culturas.js).
// ----------------------------------------------------------------------------
const PRECOS_INSUMOS = {
    calcario_ton: 120.00,            // R$/ton, calcário dolomítico PRNT 70-80%
    ureia_kg: 3.50,                  // R$/kg, 45% N
    superfosfato_triplo_kg: 3.80,    // R$/kg, 41% P2O5
    kcl_kg: 3.20,                    // R$/kg, 60% K2O
    k2so4_kg: 5.50                   // R$/kg, 50% K2O (fumo, sem cloro)
};

// ----------------------------------------------------------------------------
// LÓGICA 1 — CALAGEM (método SMP)
// Dose de calcário (ton/ha, PRNT 100%) para elevar o pH a 6,0 — CQFS-RS/SC.
// ----------------------------------------------------------------------------
const TABELA_SMP_PH60 = {
    '4.4': 21.0, '4.5': 17.3, '4.6': 15.1, '4.7': 13.3, '4.8': 11.9, '4.9': 10.7,
    '5.0': 9.9, '5.1': 8.8, '5.2': 7.8, '5.3': 6.9, '5.4': 6.2, '5.5': 5.4,
    '5.6': 4.8, '5.7': 4.2, '5.8': 3.5, '5.9': 2.8, '6.0': 2.2, '6.1': 1.8,
    '6.2': 1.4, '6.3': 1.1, '6.4': 0.8, '6.5': 0.6, '6.6': 0.3, '6.7': 0.2,
    '6.8': 0.0
};
const SMP_MIN = 4.4;
const SMP_MAX = 6.8;

function calcularCalagem(indiceSMP, prntCalcario) {
    if (indiceSMP === null || indiceSMP === undefined || Number.isNaN(Number(indiceSMP))) {
        return null;
    }
    const smp = Number(indiceSMP);
    const prnt = Number.isFinite(Number(prntCalcario)) && Number(prntCalcario) > 0
        ? Number(prntCalcario) : 100;

    let smpClamped = smp;
    let alertaExtremo = null;
    if (smp < SMP_MIN) {
        smpClamped = SMP_MIN;
        alertaExtremo = `Índice SMP (${smp}) abaixo da faixa coberta pela tabela CQFS-RS/SC — usando a maior dose tabelada (SMP ${SMP_MIN}) como piso. Solo com acidez muito elevada: reanálise e acompanhamento agronômico são recomendados antes de aplicar.`;
    } else if (smp > SMP_MAX) {
        smpClamped = SMP_MAX;
    }

    const dosePRNT100 = TABELA_SMP_PH60[smpClamped.toFixed(1)] ?? 0;
    const doseReal = Math.round(dosePRNT100 * (100 / prnt) * 10) / 10;

    return {
        indice_smp: smp,
        ph_alvo: 6.0,
        dose_prnt100_ton_ha: Math.round(dosePRNT100 * 10) / 10,
        prnt_usado: prnt,
        dose_real_ton_ha: doseReal,
        necessaria: dosePRNT100 > 0,
        observacao: alertaExtremo || (doseReal > 5.0
            ? 'Dose alta — recomenda-se parcelar: metade antes da aração, metade antes da gradagem.'
            : null)
    };
}

// ----------------------------------------------------------------------------
// LÓGICA 2 — CLASSIFICAÇÃO DE FÓSFORO (por classe de argila)
// Faixas em cascata (limite máximo de cada classe) — sem lacunas entre
// bandas, ao contrário de comparar min/max de bandas vizinhas separadamente.
// ----------------------------------------------------------------------------
const FAIXAS_FOSFORO = {
    1: [{ max: 2.0, classe: 'Muito Baixo' }, { max: 4.0, classe: 'Baixo' }, { max: 6.0, classe: 'Médio' }, { max: 9.0, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }],
    2: [{ max: 3.0, classe: 'Muito Baixo' }, { max: 6.0, classe: 'Baixo' }, { max: 9.0, classe: 'Médio' }, { max: 12.0, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }],
    3: [{ max: 4.0, classe: 'Muito Baixo' }, { max: 8.0, classe: 'Baixo' }, { max: 12.0, classe: 'Médio' }, { max: 18.0, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }],
    4: [{ max: 7.0, classe: 'Muito Baixo' }, { max: 14.0, classe: 'Baixo' }, { max: 21.0, classe: 'Médio' }, { max: 30.0, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }]
};

function determinarClasseSolo(argila) {
    if (argila > 60) return 1;
    if (argila >= 41) return 2;
    if (argila >= 21) return 3;
    return 4;
}

function classificarFosforo(valorP, argila) {
    const classeSolo = determinarClasseSolo(argila);
    const faixa = FAIXAS_FOSFORO[classeSolo].find((f) => valorP <= f.max);
    return { classe: faixa.classe, classeSolo };
}

// ----------------------------------------------------------------------------
// LÓGICA 3 — CLASSIFICAÇÃO DE POTÁSSIO (por classe de CTC)
// ----------------------------------------------------------------------------
const FAIXAS_POTASSIO = {
    1: [{ max: 30, classe: 'Muito Baixo' }, { max: 60, classe: 'Baixo' }, { max: 90, classe: 'Médio' }, { max: 120, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }],
    2: [{ max: 20, classe: 'Muito Baixo' }, { max: 40, classe: 'Baixo' }, { max: 60, classe: 'Médio' }, { max: 80, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }],
    3: [{ max: 15, classe: 'Muito Baixo' }, { max: 30, classe: 'Baixo' }, { max: 45, classe: 'Médio' }, { max: 60, classe: 'Alto' }, { max: Infinity, classe: 'Muito Alto' }]
};

function determinarClasseCtc(ctc) {
    if (ctc > 15) return 1;
    if (ctc >= 5) return 2;
    return 3;
}

function classificarPotassio(valorK, ctc) {
    const classeCtc = determinarClasseCtc(ctc);
    const faixa = FAIXAS_POTASSIO[classeCtc].find((f) => valorK <= f.max);
    return { classe: faixa.classe, classeCtc };
}

// ----------------------------------------------------------------------------
// Conversão de rendimento esperado (sc/ha, exceto Fumo em ton/ha) para
// toneladas/ha — 1 saca = 60 kg para grãos (soja/milho/trigo).
// ----------------------------------------------------------------------------
function rendimentoParaTon(cultura, rendimentoEsperado) {
    return cultura === 'Fumo' ? Number(rendimentoEsperado) : (Number(rendimentoEsperado) * 60) / 1000;
}

// ----------------------------------------------------------------------------
// LÓGICA 4/5 — P₂O₅ e K₂O por cultura, classe do solo e rendimento esperado
// ----------------------------------------------------------------------------
const RECOMENDACAO_P2O5 = {
    'Soja': { base_rendimento_ton: 3.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 130, 'Baixo': 90, 'Médio': 60, 'Alto': 30, 'Muito Alto': 0 } },
    'Milho': { base_rendimento_ton: 6.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 150, 'Baixo': 100, 'Médio': 70, 'Alto': 40, 'Muito Alto': 0 } },
    'Trigo': { base_rendimento_ton: 2.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 120, 'Baixo': 80, 'Médio': 50, 'Alto': 25, 'Muito Alto': 0 } },
    'Fumo': { base_rendimento_ton: 2.0, ajuste_por_05ton: 15, por_classe: { 'Muito Baixo': 160, 'Baixo': 120, 'Médio': 80, 'Alto': 40, 'Muito Alto': 0 } }
};

const RECOMENDACAO_K2O = {
    'Soja': { base_rendimento_ton: 3.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 130, 'Baixo': 90, 'Médio': 60, 'Alto': 30, 'Muito Alto': 0 } },
    'Milho': { base_rendimento_ton: 6.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 130, 'Baixo': 90, 'Médio': 60, 'Alto': 30, 'Muito Alto': 0 } },
    'Trigo': { base_rendimento_ton: 2.0, ajuste_por_05ton: 10, por_classe: { 'Muito Baixo': 100, 'Baixo': 70, 'Médio': 40, 'Alto': 20, 'Muito Alto': 0 } },
    'Fumo': { base_rendimento_ton: 2.0, ajuste_por_05ton: 15, por_classe: { 'Muito Baixo': 180, 'Baixo': 140, 'Médio': 100, 'Alto': 60, 'Muito Alto': 0 } }
};

function calcularDoseAjustada(tabela, cultura, classe, rendimentoEsperado) {
    const rec = tabela[cultura];
    if (!rec) return null;
    const rendTon = rendimentoParaTon(cultura, rendimentoEsperado);
    let dose = rec.por_classe[classe] || 0;
    const excedente = rendTon - rec.base_rendimento_ton;
    if (excedente > 0) {
        dose += Math.ceil(excedente / 0.5) * rec.ajuste_por_05ton;
    }
    return Math.max(0, Math.round(dose));
}

// ----------------------------------------------------------------------------
// LÓGICA 6 — NITROGÊNIO
// ----------------------------------------------------------------------------
function ehLeguminosa(nomeCultura) {
    const dados = nomeCultura ? CULTURAS[nomeCultura] : null;
    return !!(dados && dados.familia === 'leguminosa');
}

const RECOMENDACAO_N = {
    'Soja': {
        calcular: () => 0,
        observacao: 'Soja não recebe adubação nitrogenada — utilizar inoculação com Bradyrhizobium japonicum. Reinoculação anual recomendada.'
    },
    'Milho': {
        calcular: (mo, rendTon) => {
            const classMO = mo <= 2.5 ? 'baixa' : (mo <= 5.0 ? 'media' : 'alta');
            const tabela = {
                baixa: { 4: 80, 6: 130, 8: 170, max: 200 },
                media: { 4: 60, 6: 100, 8: 140, max: 170 },
                alta: { 4: 40, 6: 80, 8: 110, max: 140 }
            };
            const faixa = tabela[classMO];
            if (rendTon <= 4) return faixa[4];
            if (rendTon <= 6) return faixa[6];
            if (rendTon <= 8) return faixa[8];
            return faixa.max;
        },
        observacao: 'Parcelar: 20-30 kg/ha de N no plantio, restante em cobertura (V4-V6). Se a cultura anterior foi leguminosa, reduzir 20-30 kg/ha.'
    },
    'Trigo': {
        calcular: (mo, rendTon, culturaAnterior) => {
            const aposLeguminosa = ehLeguminosa(culturaAnterior);
            const classMO = mo <= 2.5 ? 'baixa' : (mo <= 5.0 ? 'media' : 'alta');
            const tabela = {
                baixa: { aposLeg: 60, aposGram: 90 },
                media: { aposLeg: 40, aposGram: 70 },
                alta: { aposLeg: 20, aposGram: 50 }
            };
            let dose = tabela[classMO][aposLeguminosa ? 'aposLeg' : 'aposGram'];
            if (rendTon > 2) dose += Math.round((rendTon - 2) * 20);
            return dose;
        },
        observacao: 'Parcelar: 15-20 kg/ha no plantio, restante no perfilhamento. Trigo após soja/leguminosa precisa de menos N.'
    },
    'Fumo': {
        calcular: (mo, rendTon) => {
            if (rendTon <= 1.5) return 40;
            if (rendTon <= 2.0) return 50;
            if (rendTon <= 2.5) return 60;
            return 70;
        },
        observacao: 'Aplicar N em 2-3 parcelas: 1/3 no plantio, 1/3 aos 20 dias, 1/3 aos 40 dias. Excesso de N reduz a qualidade da folha.'
    }
};

function calcularNitrogenio(cultura, materiaOrganica, rendimentoEsperado, culturaAnterior) {
    const rec = RECOMENDACAO_N[cultura];
    if (!rec) return null;
    const rendTon = rendimentoParaTon(cultura, rendimentoEsperado);
    const dose = rec.calcular(Number(materiaOrganica), rendTon, culturaAnterior);
    return { dose: Math.round(dose), observacao: rec.observacao };
}

// ----------------------------------------------------------------------------
// LÓGICA 7 — OBSERVAÇÕES ESPECÍFICAS POR CULTURA
// ----------------------------------------------------------------------------
const OBSERVACOES_CULTURA = {
    'Fumo': [
        'Usar K₂SO₄ (sulfato de potássio), nunca KCl (cloreto de potássio). Fumo é sensível ao cloro — prejudica a queima e a qualidade da folha.',
        'Calcário dolomítico é preferível (fornece Ca e Mg).',
        'Evitar excesso de N — reduz qualidade e combustibilidade da folha.'
    ],
    'Soja': [
        'Obrigatório: inoculação com Bradyrhizobium japonicum a cada safra.',
        'Em solos com V% < 65%, priorizar calagem antes da adubação.'
    ],
    'Milho': [
        'N em cobertura: aplicar entre V4 e V6 (4-6 folhas), quando a demanda é máxima.',
        'Em solos com P muito baixo, considerar adubação corretiva antecipada (fosfatagem).'
    ],
    'Trigo': [
        'N em cobertura no perfilhamento (25-45 dias após a emergência).',
        'Em anos com perspectiva de chuva excessiva na floração, considerar risco de giberela.'
    ]
};

// ----------------------------------------------------------------------------
// LÓGICA 8 — ESTIMATIVA DE CUSTO
// ----------------------------------------------------------------------------
function calcularCusto(cultura, calagem, doseN, doseP2O5, doseK2O) {
    const custo = {};

    custo.calcario = calagem ? calagem.dose_real_ton_ha * PRECOS_INSUMOS.calcario_ton : 0;
    custo.nitrogenio = (doseN / 0.45) * PRECOS_INSUMOS.ureia_kg;
    custo.fosforo = (doseP2O5 / 0.41) * PRECOS_INSUMOS.superfosfato_triplo_kg;

    if (cultura === 'Fumo') {
        custo.potassio = (doseK2O / 0.50) * PRECOS_INSUMOS.k2so4_kg;
        custo.fonte_k = 'K₂SO₄ (sulfato de potássio)';
    } else {
        custo.potassio = (doseK2O / 0.60) * PRECOS_INSUMOS.kcl_kg;
        custo.fonte_k = 'KCl (cloreto de potássio)';
    }

    custo.total_ha = custo.calcario + custo.nitrogenio + custo.fosforo + custo.potassio;

    Object.keys(custo).forEach((k) => {
        if (typeof custo[k] === 'number') custo[k] = Math.round(custo[k] * 100) / 100;
    });

    return custo;
}

// ----------------------------------------------------------------------------
// LÓGICA 9 — FUNÇÃO PRINCIPAL
// ----------------------------------------------------------------------------
function calcularAdubacao(dados) {
    const {
        cultura, indiceSMP, argila, fosforo, potassio, materiaOrganica, ctc,
        rendimentoEsperado, prntCalcario, culturaAnterior
    } = dados;

    if (!CULTURAS_SUPORTADAS.includes(cultura)) {
        return { erro: `Cultura "${cultura}" não suportada pela calculadora de adubação (use ${CULTURAS_SUPORTADAS.join(', ')}).` };
    }

    const calagem = calcularCalagem(indiceSMP, prntCalcario);
    const classeP = classificarFosforo(Number(fosforo), Number(argila));
    const classeK = classificarPotassio(Number(potassio), Number(ctc));

    const doseP2O5 = calcularDoseAjustada(RECOMENDACAO_P2O5, cultura, classeP.classe, rendimentoEsperado);
    const doseK2O = calcularDoseAjustada(RECOMENDACAO_K2O, cultura, classeK.classe, rendimentoEsperado);
    const nitrogenio = calcularNitrogenio(cultura, materiaOrganica, rendimentoEsperado, culturaAnterior);

    const custo = calcularCusto(cultura, calagem, nitrogenio.dose, doseP2O5, doseK2O);

    const observacoes = [
        ...(OBSERVACOES_CULTURA[cultura] || []),
        nitrogenio.observacao,
        calagem ? calagem.observacao : null
    ].filter(Boolean);

    return {
        cultura,
        rendimentoEsperado: Number(rendimentoEsperado),
        culturaAnteriorUsada: cultura === 'Trigo' ? (culturaAnterior || null) : null,
        calagem,
        nitrogenio: { dose_kg_ha: nitrogenio.dose, observacao: nitrogenio.observacao },
        fosforo: { valor_solo: Number(fosforo), classe_solo: classeP.classeSolo, classe: classeP.classe, dose_P2O5_kg_ha: doseP2O5 },
        potassio: { valor_solo: Number(potassio), classe_ctc: classeK.classeCtc, classe: classeK.classe, dose_K2O_kg_ha: doseK2O },
        custo,
        observacoes
    };
}

module.exports = { calcularAdubacao, CULTURAS_SUPORTADAS };
