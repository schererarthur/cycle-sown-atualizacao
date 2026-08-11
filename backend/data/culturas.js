// ============================================================================
// Base de dados agronômica das culturas para RS/SC, usada pelo Planejador de
// Rotação de Culturas (routes/rotacao.js). É conhecimento agronômico fixo do
// sistema — não vai para o banco de dados, só os preços (precos_culturas) e
// o histórico de plantio (historico_culturas) do agricultor são dinâmicos.
//
// Fonte: Manual de Calagem e Adubação CQFS-RS/SC (2016), Embrapa.
// solo_minimo / solo_ideal usam as mesmas unidades do restante do site:
// pH sem unidade, P e K em mg/dm³, V% em %.
// ============================================================================

const CULTURAS = {
    // ------------------------------------------------------------------
    // SAFRA DE VERÃO (outubro – março)
    // ------------------------------------------------------------------
    'Soja': {
        familia: 'leguminosa',
        safra: 'verao',
        emoji: '🫘',
        meses_plantio: [9, 10, 11],
        meses_colheita: [2, 3, 4],
        solo_minimo: { ph: 5.5, P: 9, K: 80, V: 65 },
        solo_ideal: { ph: 6.0, P: 18, K: 120, V: 75 },
        produtividade_media_sc_ha: 55,
        custo_estimado_ha: 2800,
        beneficios_solo: ['fixa_N', 'melhora_MO'],
        riscos: ['ferrugem_asiatica', 'nematoide_se_repete'],
        evitar_apos: ['Soja', 'Feijão', 'Ervilhaca'],
        ideal_apos: ['Milho', 'Trigo', 'Aveia Preta', 'Centeio', 'Sorgo'],
        notas: 'Principal cultura comercial do RS. Não repetir para evitar nematoide e ferrugem.'
    },

    'Milho': {
        familia: 'graminea',
        safra: 'verao',
        emoji: '🌽',
        meses_plantio: [8, 9, 10],
        meses_colheita: [1, 2, 3],
        solo_minimo: { ph: 5.5, P: 6, K: 60, V: 60 },
        solo_ideal: { ph: 6.0, P: 14, K: 120, V: 70 },
        produtividade_media_sc_ha: 140,
        custo_estimado_ha: 2400,
        beneficios_solo: ['palhada_abundante', 'raiz_profunda', 'alto_residuo_carbono'],
        riscos: ['exigente_em_N', 'cigarrinha'],
        evitar_apos: ['Milho', 'Sorgo', 'Trigo', 'Aveia Preta'],
        ideal_apos: ['Soja', 'Ervilhaca', 'Feijão', 'Nabo Forrageiro'],
        notas: 'Excelente após leguminosa (aproveita N fixado). Palhada duradoura beneficia plantio direto.'
    },

    'Feijão': {
        familia: 'leguminosa',
        safra: 'verao',
        emoji: '🫘',
        meses_plantio: [9, 10, 1, 2],
        meses_colheita: [12, 1, 4, 5],
        solo_minimo: { ph: 5.5, P: 9, K: 80, V: 60 },
        solo_ideal: { ph: 6.0, P: 18, K: 120, V: 70 },
        produtividade_media_sc_ha: 30,
        custo_estimado_ha: 2200,
        beneficios_solo: ['fixa_N'],
        riscos: ['sensivel_a_geada', 'antracnose'],
        evitar_apos: ['Soja', 'Feijão', 'Ervilhaca'],
        ideal_apos: ['Milho', 'Trigo', 'Aveia Preta'],
        notas: 'Preço alto mas produtividade baixa. Bom para diversificação em áreas menores.'
    },

    'Fumo': {
        familia: 'solanacea',
        safra: 'verao',
        emoji: '🍂',
        meses_plantio: [7, 8, 9],
        meses_colheita: [12, 1, 2],
        solo_minimo: { ph: 5.5, P: 12, K: 100, V: 65 },
        solo_ideal: { ph: 6.0, P: 24, K: 160, V: 75 },
        produtividade_media_sc_ha: null,
        produtividade_ton_ha: 2.5,
        custo_estimado_ha: 6000,
        receita_estimada_ha: 14000,
        beneficios_solo: [],
        riscos: ['nematoide', 'murchadeira', 'exige_K_sulfato'],
        evitar_apos: ['Fumo'],
        ideal_apos: ['Aveia Preta', 'Centeio', 'Ervilhaca'],
        notas: 'Alta rentabilidade mas alta exigência. Usar K₂SO₄ (sem cloro). Comum na região do Vale do Rio Pardo.',
        unidade_preco: 'R$/ton'
    },

    'Sorgo': {
        familia: 'graminea',
        safra: 'verao',
        emoji: '🌾',
        meses_plantio: [10, 11],
        meses_colheita: [3, 4],
        solo_minimo: { ph: 5.0, P: 4, K: 40, V: 50 },
        solo_ideal: { ph: 5.5, P: 9, K: 80, V: 60 },
        produtividade_media_sc_ha: 80,
        custo_estimado_ha: 1600,
        beneficios_solo: ['palhada_abundante', 'tolerante_seca', 'raiz_profunda'],
        riscos: [],
        evitar_apos: ['Milho', 'Sorgo'],
        ideal_apos: ['Soja', 'Ervilhaca'],
        notas: 'Rústico, tolera seca. Boa opção para solos mais fracos onde milho teria risco.'
    },

    // ------------------------------------------------------------------
    // SAFRA DE INVERNO (abril – setembro)
    // ------------------------------------------------------------------
    'Trigo': {
        familia: 'graminea',
        safra: 'inverno',
        emoji: '🌾',
        meses_plantio: [5, 6, 7],
        meses_colheita: [10, 11],
        solo_minimo: { ph: 5.5, P: 9, K: 60, V: 65 },
        solo_ideal: { ph: 6.0, P: 18, K: 120, V: 75 },
        produtividade_media_sc_ha: 45,
        custo_estimado_ha: 2000,
        beneficios_solo: ['palhada', 'raiz_fasciculada'],
        riscos: ['giberela', 'geada_na_floracao'],
        evitar_apos: ['Trigo', 'Cevada', 'Aveia Preta'],
        ideal_apos: ['Soja', 'Feijão'],
        notas: 'Principal cultura comercial de inverno no RS. Risco de giberela em anos úmidos.'
    },

    'Cevada': {
        familia: 'graminea',
        safra: 'inverno',
        emoji: '🌾',
        meses_plantio: [5, 6],
        meses_colheita: [10, 11],
        solo_minimo: { ph: 5.5, P: 9, K: 60, V: 65 },
        solo_ideal: { ph: 6.0, P: 14, K: 120, V: 70 },
        produtividade_media_sc_ha: 50,
        custo_estimado_ha: 1800,
        beneficios_solo: ['palhada'],
        riscos: ['exigente_qualidade', 'rejeicao_maltaria'],
        evitar_apos: ['Trigo', 'Cevada'],
        ideal_apos: ['Soja', 'Feijão'],
        notas: 'Boa alternativa ao trigo. Contrato com maltaria garante preço, mas exige padrão de qualidade.'
    },

    'Canola': {
        familia: 'brassicacea',
        safra: 'inverno',
        emoji: '🌼',
        meses_plantio: [4, 5],
        meses_colheita: [9, 10],
        solo_minimo: { ph: 5.5, P: 9, K: 60, V: 60 },
        solo_ideal: { ph: 6.0, P: 18, K: 120, V: 70 },
        produtividade_media_sc_ha: 25,
        custo_estimado_ha: 1500,
        beneficios_solo: ['quebra_ciclo_doencas', 'raiz_pivotante'],
        riscos: ['sensivel_a_geada_severa'],
        evitar_apos: ['Nabo Forrageiro', 'Canola'],
        ideal_apos: ['Soja', 'Milho', 'Trigo'],
        notas: 'Família diferente de grãos — excelente para quebrar ciclos de doenças fúngicas.'
    },

    'Aveia Preta': {
        familia: 'graminea',
        safra: 'inverno',
        emoji: '🌱',
        meses_plantio: [3, 4, 5],
        meses_colheita: [8, 9],
        solo_minimo: { ph: 5.0, P: 4, K: 40, V: 45 },
        solo_ideal: { ph: 5.5, P: 9, K: 60, V: 55 },
        produtividade_media_sc_ha: 0,
        custo_estimado_ha: 400,
        beneficios_solo: ['cobertura_densa', 'palhada_abundante', 'supressao_daninhas', 'ciclagem_nutrientes'],
        riscos: [],
        evitar_apos: ['Aveia Preta', 'Trigo'],
        ideal_apos: ['Soja', 'Feijão', 'Fumo'],
        cobertura: true,
        notas: 'Cobertura mais usada no RS. Palhada protege solo e suprime invasoras no verão seguinte.'
    },

    'Centeio': {
        familia: 'graminea',
        safra: 'inverno',
        emoji: '🌾',
        meses_plantio: [3, 4, 5],
        meses_colheita: [8, 9],
        solo_minimo: { ph: 5.0, P: 4, K: 40, V: 45 },
        solo_ideal: { ph: 5.5, P: 9, K: 60, V: 55 },
        produtividade_media_sc_ha: 0,
        custo_estimado_ha: 350,
        beneficios_solo: ['cobertura', 'alelopatia_contra_daninhas', 'tolerante_frio'],
        riscos: [],
        evitar_apos: ['Centeio', 'Trigo'],
        ideal_apos: ['Soja', 'Fumo', 'Feijão'],
        cobertura: true,
        notas: 'Mais rústico que aveia, tolera solos mais ácidos e frio intenso. Efeito alelopático contra plantas daninhas.'
    },

    'Ervilhaca': {
        familia: 'leguminosa',
        safra: 'inverno',
        emoji: '🌿',
        meses_plantio: [3, 4, 5],
        meses_colheita: [8, 9],
        solo_minimo: { ph: 5.0, P: 4, K: 40, V: 45 },
        solo_ideal: { ph: 5.5, P: 9, K: 60, V: 55 },
        produtividade_media_sc_ha: 0,
        custo_estimado_ha: 300,
        beneficios_solo: ['fixa_N', 'cobertura', 'melhora_MO', 'adubo_verde'],
        riscos: [],
        evitar_apos: ['Soja', 'Feijão', 'Ervilhaca'],
        ideal_apos: ['Milho', 'Sorgo'],
        cobertura: true,
        notas: 'Leguminosa de inverno que fixa N. Ideal antes de milho para reduzir adubação nitrogenada.'
    },

    'Nabo Forrageiro': {
        familia: 'brassicacea',
        safra: 'inverno',
        emoji: '🥬',
        meses_plantio: [3, 4, 5],
        meses_colheita: [7, 8],
        solo_minimo: { ph: 5.0, P: 4, K: 30, V: 40 },
        solo_ideal: { ph: 5.5, P: 9, K: 60, V: 50 },
        produtividade_media_sc_ha: 0,
        custo_estimado_ha: 250,
        beneficios_solo: ['descompactacao', 'reciclagem_nutrientes_profundos', 'raiz_pivotante'],
        riscos: [],
        evitar_apos: ['Canola', 'Nabo Forrageiro'],
        ideal_apos: ['Soja', 'Milho'],
        cobertura: true,
        notas: 'Raiz pivotante profunda descompacta solo naturalmente. Recicla nutrientes de camadas profundas.'
    }
};

module.exports = CULTURAS;
