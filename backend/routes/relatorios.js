// ============================================================================
// Rotas da Central de Relatórios (relatorios.html): 4 endpoints que GERAM
// relatórios com dados atuais das tabelas já existentes (talhoes,
// historico_culturas, precos_culturas) + 4 endpoints de persistência
// (salvar/listar/buscar/excluir o snapshot gerado). Nenhum dado é inventado
// — se um campo estiver NULL no banco, o relatório mostra "Dado não
// informado" naquele item.
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const CULTURAS = require('../data/culturas');
const {
    gerarRecomendacao,
    ordenarHistoricoCronologico,
    determinarProximaSafra,
    FAMILIA_LABEL
} = require('../utils/rotacaoEngine');
const { classifyAdequacy, ADEQUACY_SCORE_MAP } = require('./talhoes');

const router = express.Router();

router.use(authMiddleware);

// ----------------------------------------------------------------------------
// Helpers compartilhados pelos 4 relatórios
// ----------------------------------------------------------------------------

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesesLabel(mesesArray) {
    if (!Array.isArray(mesesArray) || mesesArray.length === 0) return 'não definido';
    return mesesArray.map((m) => MESES_PT[m - 1]).join('–');
}

function round2(n) {
    return n === null || n === undefined ? null : Math.round(n * 100) / 100;
}

// "Verão 2025/2026" | "Inverno 2026" -> "2025/2026" | "2026" (mesmo formato
// livre usado em historico_culturas.safra_ano).
function safraAnoDoLabel(label) {
    return String(label || '').replace(/^(Verão|Inverno)\s+/, '');
}

async function buscarTalhaoDoUsuario(talhaoId, userId) {
    const [rows] = await pool.query(
        'SELECT * FROM talhoes WHERE id = ? AND user_id = ?',
        [talhaoId, userId]
    );
    return rows[0] || null;
}

async function buscarPrecosMap() {
    const [rows] = await pool.query('SELECT cultura_nome, preco_saca FROM precos_culturas');
    const map = new Map();
    rows.forEach((row) => map.set(row.cultura_nome, row.preco_saca != null ? Number(row.preco_saca) : null));
    return map;
}

async function buscarHistoricoRecente(talhaoId, limite = 4) {
    const [rows] = await pool.query(
        `SELECT cultura_nome, familia_botanica, safra_tipo, safra_ano, produtividade_real, created_at
         FROM historico_culturas WHERE talhao_id = ? ORDER BY created_at DESC LIMIT 20`,
        [talhaoId]
    );
    return ordenarHistoricoCronologico(rows).slice(0, limite);
}

async function buscarHistoricoCompleto(talhaoId) {
    const [rows] = await pool.query(
        `SELECT cultura_nome, familia_botanica, safra_tipo, safra_ano, produtividade_real, created_at
         FROM historico_culturas WHERE talhao_id = ?`,
        [talhaoId]
    );
    // Cronológico ascendente (mais antiga primeiro) — ideal para gráficos de evolução.
    return ordenarHistoricoCronologico(rows).reverse();
}

function talhaoResumo(row) {
    return {
        id: row.id,
        nome: row.nome,
        area_ha: row.area_ha !== null ? Number(row.area_ha) : null
    };
}

// ============================================================================
// RELATÓRIO 1 — NUTRICIONAL DO SOLO
// ============================================================================

// Parâmetros com classificação já existente no Mapa de Fertilidade
// (talhoes.js), reaproveitada aqui para os status baterem em todo o site.
const PARAMS_ADEQUACY = [
    { campo: 'solo_ph', field: 'ph', nome: 'pH em água (potencial hidrogeniônico)', unidade: '', referencia: 'Faixa boa: 5,5 – 7,2 (ideal 5,8 – 6,5)' },
    { campo: 'solo_mo', field: 'organicMatter', nome: 'Matéria Orgânica (M.O.)', unidade: '%', referencia: 'Faixa boa: ≥ 3,0%' },
    { campo: 'solo_p', field: 'phosphorus', nome: 'Fósforo (P)', unidade: 'mg/dm³', referencia: 'Faixa boa: ≥ 15 mg/dm³' },
    { campo: 'solo_k', field: 'potassium', nome: 'Potássio (K)', unidade: 'mg/dm³', referencia: 'Faixa boa: ≥ 120 mg/dm³' },
    { campo: 'solo_ca', field: 'calcium', nome: 'Cálcio (Ca)', unidade: 'cmolc/dm³', referencia: 'Faixa boa: ≥ 4,0 cmolc/dm³' },
    { campo: 'solo_mg', field: 'magnesium', nome: 'Magnésio (Mg)', unidade: 'cmolc/dm³', referencia: 'Faixa boa: ≥ 1,0 cmolc/dm³' }
];

const INTERPRETACOES = {
    ph: {
        bom: 'Solo com pH adequado para a maioria das culturas.',
        regular: 'pH aceitável, mas calagem pode beneficiar culturas mais exigentes.',
        ruim: 'pH fora da faixa ideal — calagem recomendada para correção. Consulte o índice SMP para dosagem.'
    },
    organicMatter: {
        bom: 'Boa reserva de matéria orgânica. Favorece estrutura do solo e retenção de água.',
        regular: 'M.O. mediana. Plantas de cobertura e manejo de palhada podem elevar o nível.',
        ruim: 'M.O. baixa — solo com pouca atividade biológica. Priorize cobertura permanente e adubação verde.'
    },
    phosphorus: {
        bom: 'Fósforo em nível adequado. Manutenção com adubação de reposição.',
        regular: 'Fósforo em nível médio. Recomenda-se adubação corretiva gradual.',
        ruim: 'Fósforo baixo — limita o desenvolvimento radicular. Correção recomendada antes do plantio.'
    },
    potassium: {
        bom: 'Potássio em bom nível. Adubação de manutenção é suficiente.',
        regular: 'Potássio em nível médio. Considere aumentar a dose de KCl na adubação de base.',
        ruim: 'Potássio deficiente — pode reduzir a produtividade. Adubação corretiva recomendada.'
    },
    calcium: {
        bom: 'Cálcio adequado. Calcário dolomítico mantém o nível na manutenção.',
        regular: 'Cálcio em nível médio. Calagem com calcário dolomítico pode elevar o nível.',
        ruim: 'Cálcio baixo — calagem com calcário dolomítico corrige Ca e Mg simultaneamente.'
    },
    magnesium: {
        bom: 'Magnésio adequado — componente central da clorofila.',
        regular: 'Magnésio em nível médio. Calagem com calcário dolomítico pode elevar o nível.',
        ruim: 'Magnésio insuficiente — use calcário dolomítico na correção.'
    }
};

function statusFromAdequacyLabel(label) {
    if (label === 'Excelente' || label === 'Bom') return 'bom';
    if (label === 'Regular') return 'regular';
    if (label === 'Ruim' || label === 'Muito Ruim') return 'ruim';
    return null;
}

// V%, CTC, Al e Índice SMP não fazem parte da tabela de classificação do
// Mapa de Fertilidade (calcularFertilidade só usa ph/mo/P/K/Ca/Mg) — faixas
// abaixo seguem o Manual CQFS-RS/SC (2016), mesma fonte citada em
// data/culturas.js e utils/rotacaoEngine.js.
function classificarComplementar(nome, valor, unidade, referencia, bandas, interpretacoes) {
    if (valor === null || valor === undefined) return null;
    const numero = Number(valor);
    const banda = bandas.find((b) => numero >= b.min && numero < b.max) || bandas[bandas.length - 1];
    return {
        nome, valor: numero, unidade,
        classe: banda.classe, status: banda.status,
        referencia,
        interpretacao: interpretacoes[banda.status]
    };
}

function classificarSolo(talhao) {
    const parametros = [];

    PARAMS_ADEQUACY.forEach(({ campo, field, nome, unidade, referencia }) => {
        const valor = talhao[campo];
        if (valor === null || valor === undefined) {
            parametros.push({ nome, valor: null, unidade, classe: 'Não informado', status: 'indisponivel', referencia, interpretacao: 'Dado não informado para este talhão.' });
            return;
        }
        const numero = Number(valor);
        const label = classifyAdequacy(field, numero);
        parametros.push({
            nome, valor: numero, unidade,
            classe: label || 'Não informado',
            status: statusFromAdequacyLabel(label) || 'indisponivel',
            referencia,
            interpretacao: (INTERPRETACOES[field] && INTERPRETACOES[field][statusFromAdequacyLabel(label)]) || 'Sem interpretação disponível.'
        });
    });

    const v = classificarComplementar(
        'Saturação por Bases (V%)', talhao.solo_v, '%', 'Ideal: 65% – 80%',
        [
            { min: -Infinity, max: 45, classe: 'Baixo', status: 'ruim' },
            { min: 45, max: 65, classe: 'Médio', status: 'regular' },
            { min: 65, max: Infinity, classe: 'Alto', status: 'bom' }
        ],
        {
            bom: 'V% adequado — solo com boa disponibilidade de bases trocáveis.',
            regular: 'V% médio. Calagem pode elevar para a faixa ideal.',
            ruim: 'V% baixo — solo ácido, provável excesso de alumínio. Calagem prioritária.'
        }
    );
    if (v) parametros.push(v);

    const ctc = classificarComplementar(
        'CTC a pH 7,0', talhao.solo_ctc, 'cmolc/dm³', 'Ideal: > 15 cmolc/dm³',
        [
            { min: -Infinity, max: 7.5, classe: 'Baixo', status: 'ruim' },
            { min: 7.5, max: 15, classe: 'Médio', status: 'regular' },
            { min: 15, max: Infinity, classe: 'Alto', status: 'bom' }
        ],
        {
            bom: 'CTC alta — solo com boa capacidade de reter nutrientes.',
            regular: 'CTC média. Aumentar matéria orgânica ajuda a elevá-la.',
            ruim: 'CTC baixa — nutrientes são lixiviados com facilidade. Aumentar M.O. é prioridade.'
        }
    );
    if (ctc) parametros.push(ctc);

    const al = classificarComplementar(
        'Alumínio trocável (Al)', talhao.solo_al, 'cmolc/dm³', 'Ideal: < 0,2 cmolc/dm³',
        [
            { min: -Infinity, max: 0.2, classe: 'Baixo', status: 'bom' },
            { min: 0.2, max: 1.0, classe: 'Médio', status: 'regular' },
            { min: 1.0, max: Infinity, classe: 'Alto', status: 'ruim' }
        ],
        {
            bom: 'Alumínio trocável desprezível — sem toxidez para as raízes.',
            regular: 'Alumínio em nível intermediário. Monitorar em culturas sensíveis.',
            ruim: 'Alumínio tóxico presente — prejudica o desenvolvimento radicular. Calagem necessária.'
        }
    );
    if (al) parametros.push(al);

    const smp = classificarComplementar(
        'Índice SMP', talhao.solo_smp, '', 'Usado para calcular a dose de calcário',
        [
            { min: -Infinity, max: 5.5, classe: 'Baixo', status: 'ruim' },
            { min: 5.5, max: 6.0, classe: 'Médio', status: 'regular' },
            { min: 6.0, max: Infinity, classe: 'Bom', status: 'bom' }
        ],
        {
            bom: 'Índice SMP confortável — necessidade de calagem baixa ou nula.',
            regular: 'Índice SMP intermediário — consulte a tabela CQFS-RS/SC para a dose de calcário.',
            ruim: 'Índice SMP baixo — indica necessidade de calagem mais alta. Consulte a tabela CQFS-RS/SC.'
        }
    );
    if (smp) parametros.push(smp);

    return parametros;
}

router.get('/nutricional/:talhaoId', async (req, res) => {
    try {
        const talhao = await buscarTalhaoDoUsuario(req.params.talhaoId, req.user.userId);
        if (!talhao) return res.status(404).json({ error: 'Talhão não encontrado' });

        const parametros = classificarSolo(talhao);
        const avaliados = parametros.filter((p) => p.status !== 'indisponivel');
        const bons = avaliados.filter((p) => p.status === 'bom').length;
        const regulares = avaliados.filter((p) => p.status === 'regular').length;
        const ruins = avaliados.filter((p) => p.status === 'ruim').length;

        let diagnostico;
        if (avaliados.length === 0) {
            diagnostico = 'Nenhum dado de solo informado para este talhão ainda. Preencha os valores no Mapa de Fertilidade para gerar o diagnóstico.';
        } else if (ruins > 0) {
            const nomesRuins = avaliados.filter((p) => p.status === 'ruim').map((p) => p.nome).join(', ');
            diagnostico = `Solo requer atenção em ${ruins} parâmetro(s): ${nomesRuins}.`;
        } else if (regulares > 0) {
            const nomesRegulares = avaliados.filter((p) => p.status === 'regular').map((p) => p.nome).join(', ');
            diagnostico = `Solo em boas condições gerais. Atenção a ${regulares} parâmetro(s) em nível médio: ${nomesRegulares}.`;
        } else {
            diagnostico = 'Solo em excelentes condições — todos os parâmetros avaliados estão em bons níveis.';
        }

        return res.status(200).json({
            success: true,
            talhao: talhaoResumo(talhao),
            data_geracao: new Date().toISOString(),
            parametros,
            resumo: {
                parametros_bons: bons,
                parametros_regulares: regulares,
                parametros_ruins: ruins,
                total: avaliados.length,
                fertilidade_score: talhao.fertilidade_score,
                diagnostico_geral: diagnostico
            }
        });
    } catch (err) {
        console.error('Erro ao gerar relatório nutricional:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ============================================================================
// RELATÓRIO 2 — RECOMENDAÇÃO DE CULTURA
// ============================================================================

function projecaoFinanceira(rec, areaHa) {
    if (rec.cobertura) {
        const custoTotal = round2((rec.custo_estimado_ha || 0) * areaHa);
        return {
            cobertura: true,
            produtividade_esperada: null,
            producao_total: null,
            preco_saca: null,
            receita_bruta: 0,
            custo_estimado: custoTotal,
            lucro_estimado: round2(-custoTotal),
            lucro_por_ha: round2(-(rec.custo_estimado_ha || 0))
        };
    }

    const dadosCultura = CULTURAS[rec.cultura] || {};
    const produtividadeHa = dadosCultura.produtividade_media_sc_ha || dadosCultura.produtividade_ton_ha || null;
    const unidade = dadosCultura.produtividade_media_sc_ha ? 'sc/ha' : (dadosCultura.produtividade_ton_ha ? 'ton/ha' : null);

    return {
        cobertura: false,
        produtividade_esperada: produtividadeHa,
        unidade_produtividade: unidade,
        producao_total: produtividadeHa !== null ? round2(produtividadeHa * areaHa) : null,
        preco_saca: rec.preco_saca,
        receita_bruta: round2((rec.receita_bruta_ha || 0) * areaHa),
        custo_estimado: round2((rec.custo_estimado_ha || 0) * areaHa),
        lucro_estimado: round2((rec.lucro_estimado_ha || 0) * areaHa),
        lucro_por_ha: rec.lucro_estimado_ha
    };
}

function compatibilidadeSolo(dadosCultura, soloResumo) {
    if (!dadosCultura || !dadosCultura.solo_minimo) return [];
    const linhas = [];
    const mapa = [
        ['ph', 'pH', soloResumo.ph],
        ['P', 'Fósforo (P)', soloResumo.P],
        ['K', 'Potássio (K)', soloResumo.K],
        ['V', 'Saturação por Bases (V%)', soloResumo.V]
    ];
    mapa.forEach(([chave, label, valor]) => {
        const minimo = dadosCultura.solo_minimo[chave];
        if (valor === null || valor === undefined || minimo === null || minimo === undefined) return;
        linhas.push({ parametro: label, valor, minimo, ok: valor >= minimo });
    });
    return linhas;
}

router.get('/recomendacao/:talhaoId', async (req, res) => {
    try {
        const talhao = await buscarTalhaoDoUsuario(req.params.talhaoId, req.user.userId);
        if (!talhao) return res.status(404).json({ error: 'Talhão não encontrado' });

        const [historico, precosMap] = await Promise.all([
            buscarHistoricoRecente(talhao.id),
            buscarPrecosMap()
        ]);

        const resultado = gerarRecomendacao(talhao, historico, precosMap);
        const areaHa = talhao.area_ha !== null ? Number(talhao.area_ha) : 0;

        const ultimaCulturaNome = resultado.ultimaCultura;
        const ultimaCulturaDados = ultimaCulturaNome ? CULTURAS[ultimaCulturaNome] : null;

        const [principal, ...alternativas] = resultado.recomendacoes;

        const principalDetalhado = principal ? {
            ...principal,
            projecao_financeira: projecaoFinanceira(principal, areaHa),
            janela_plantio: mesesLabel((CULTURAS[principal.cultura] || {}).meses_plantio),
            janela_colheita: mesesLabel((CULTURAS[principal.cultura] || {}).meses_colheita),
            compatibilidade_solo: compatibilidadeSolo(CULTURAS[principal.cultura], resultado.soloResumo)
        } : null;

        return res.status(200).json({
            success: true,
            talhao: talhaoResumo(talhao),
            data_geracao: new Date().toISOString(),
            proxima_safra: resultado.proximaSafra,
            contexto: {
                ultima_cultura: ultimaCulturaNome,
                ultima_familia: ultimaCulturaDados ? FAMILIA_LABEL[ultimaCulturaDados.familia] : null,
                solo_resumo: resultado.soloResumo,
                fertilidade_score: talhao.fertilidade_score
            },
            recomendacao_principal: principalDetalhado,
            alternativas: alternativas.map((alt) => ({
                ...alt,
                projecao_financeira: projecaoFinanceira(alt, areaHa)
            }))
        });
    } catch (err) {
        console.error('Erro ao gerar relatório de recomendação:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ============================================================================
// RELATÓRIO 3 — PLANEJAMENTO DE ROTAÇÃO E CUSTOS (4 ciclos / 2 anos)
// ============================================================================

const NUM_CICLOS = 4;

router.get('/rotacao/:talhaoId', async (req, res) => {
    try {
        const talhao = await buscarTalhaoDoUsuario(req.params.talhaoId, req.user.userId);
        if (!talhao) return res.status(404).json({ error: 'Talhão não encontrado' });

        const [historicoReal, precosMap] = await Promise.all([
            buscarHistoricoRecente(talhao.id),
            buscarPrecosMap()
        ]);

        const areaHa = talhao.area_ha !== null ? Number(talhao.area_ha) : 0;

        let talhaoSimulado = talhao;
        let historicoSimulado = historicoReal;
        let dataRef = new Date();
        const ciclos = [];

        for (let i = 0; i < NUM_CICLOS; i++) {
            const resultado = gerarRecomendacao(talhaoSimulado, historicoSimulado, precosMap, dataRef);
            const top = resultado.recomendacoes[0];

            if (!top) break; // sem candidata viável (não deveria acontecer, mas evita crash)

            const dadosCultura = CULTURAS[top.cultura] || {};
            const financeiro = projecaoFinanceira(top, areaHa);

            ciclos.push({
                numero: i + 1,
                safra: resultado.proximaSafra,
                cultura: top.cultura,
                emoji: top.emoji,
                familia: top.familia,
                score: top.score,
                cobertura: top.cobertura,
                justificativas: top.justificativas,
                janela_plantio: mesesLabel(dadosCultura.meses_plantio),
                janela_colheita: mesesLabel(dadosCultura.meses_colheita),
                financeiro
            });

            // "Planta" a recomendação e avança a simulação para o próximo ciclo.
            const safraAno = safraAnoDoLabel(resultado.proximaSafra.label);
            historicoSimulado = [
                {
                    cultura_nome: top.cultura,
                    familia_botanica: dadosCultura.familia || null,
                    safra_tipo: resultado.proximaSafra.tipo,
                    safra_ano: safraAno,
                    produtividade_real: null,
                    created_at: new Date().toISOString()
                },
                ...historicoSimulado
            ].slice(0, 4);
            talhaoSimulado = { ...talhaoSimulado, cultura_nome: null };

            dataRef = new Date(dataRef);
            dataRef.setMonth(dataRef.getMonth() + 6);
        }

        const totais = ciclos.reduce((acc, c) => {
            acc.receita += c.financeiro.receita_bruta || 0;
            acc.custo += c.financeiro.custo_estimado || 0;
            acc.lucro += c.financeiro.lucro_estimado || 0;
            return acc;
        }, { receita: 0, custo: 0, lucro: 0 });

        const numAnos = NUM_CICLOS / 2;

        return res.status(200).json({
            success: true,
            talhao: talhaoResumo(talhao),
            data_geracao: new Date().toISOString(),
            historico_recente: historicoReal.map((h) => ({
                cultura_nome: h.cultura_nome,
                emoji: (CULTURAS[h.cultura_nome] || {}).emoji || '🌱',
                safra_tipo: h.safra_tipo,
                safra_ano: h.safra_ano,
                produtividade_real: h.produtividade_real !== null && h.produtividade_real !== undefined ? Number(h.produtividade_real) : null
            })),
            ciclos,
            resumo_financeiro: {
                receita_total: round2(totais.receita),
                custo_total: round2(totais.custo),
                lucro_total: round2(totais.lucro),
                media_por_ano: round2(totais.lucro / numAnos),
                media_por_ha: areaHa > 0 ? round2(totais.lucro / (areaHa * numAnos)) : null
            },
            sequencia_visual: [
                ...historicoReal.slice().reverse().map((h) => ({ cultura: h.cultura_nome, emoji: (CULTURAS[h.cultura_nome] || {}).emoji || '🌱', familia: h.familia_botanica })),
                ...ciclos.map((c) => ({ cultura: c.cultura, emoji: c.emoji, familia: c.familia }))
            ]
        });
    } catch (err) {
        console.error('Erro ao gerar relatório de rotação:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ============================================================================
// RELATÓRIO 4 — PRODUTIVIDADE
// ============================================================================

function calcularTendencia(registros) {
    if (registros.length < 2) return { tipo: 'insuficiente', texto: 'Dados insuficientes para calcular tendência', cor: '#6b756f' };

    const primeiro = registros[0].produtividade_real;
    const ultimo = registros[registros.length - 1].produtividade_real;
    if (primeiro === null || ultimo === null || primeiro === 0) {
        return { tipo: 'insuficiente', texto: 'Dados insuficientes para calcular tendência', cor: '#6b756f' };
    }

    const variacao = ((ultimo - primeiro) / primeiro) * 100;
    const diferenca = ultimo - primeiro;

    if (variacao > 5) {
        return { tipo: 'crescente', texto: `▲ Crescente (${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(1)} em ${registros.length} safras)`, cor: '#066a04' };
    }
    if (variacao < -5) {
        return { tipo: 'decrescente', texto: `▼ Decrescente (${diferenca.toFixed(1)} em ${registros.length} safras)`, cor: '#c62828' };
    }
    return { tipo: 'estavel', texto: `● Estável (variação de ${variacao.toFixed(1)}%)`, cor: '#F9A825' };
}

function formatSafraLabel(tipo, ano) {
    if (tipo === 'verao') return `Verão ${ano}`;
    return `Inverno ${ano}`;
}

router.get('/produtividade/:talhaoId', async (req, res) => {
    try {
        const talhao = await buscarTalhaoDoUsuario(req.params.talhaoId, req.user.userId);
        if (!talhao) return res.status(404).json({ error: 'Talhão não encontrado' });

        const historico = await buscarHistoricoCompleto(talhao.id);

        if (historico.length === 0) {
            return res.status(200).json({
                success: true,
                talhao: talhaoResumo(talhao),
                sem_dados: true,
                mensagem: 'Registre safras anteriores no Planejador de Rotação para ver análises de produtividade deste talhão.'
            });
        }

        const precosMap = await buscarPrecosMap();

        const serieCronologica = historico.map((h) => {
            const dadosCultura = CULTURAS[h.cultura_nome] || {};
            const precoAtual = precosMap.get(h.cultura_nome);
            const produtividade = h.produtividade_real !== null && h.produtividade_real !== undefined ? Number(h.produtividade_real) : null;
            return {
                safra_label: formatSafraLabel(h.safra_tipo, h.safra_ano),
                safra_tipo: h.safra_tipo,
                safra_ano: h.safra_ano,
                cultura_nome: h.cultura_nome,
                emoji: dadosCultura.emoji || '🌱',
                cobertura: !!dadosCultura.cobertura,
                produtividade_real: produtividade,
                receita_estimada: (produtividade !== null && precoAtual !== null && precoAtual !== undefined)
                    ? round2(produtividade * precoAtual) : null
            };
        });

        const porCulturaMap = new Map();
        historico.forEach((h) => {
            if (h.produtividade_real === null || h.produtividade_real === undefined) return;
            if (!porCulturaMap.has(h.cultura_nome)) porCulturaMap.set(h.cultura_nome, []);
            porCulturaMap.get(h.cultura_nome).push({
                safra_label: formatSafraLabel(h.safra_tipo, h.safra_ano),
                produtividade_real: Number(h.produtividade_real)
            });
        });

        const porCultura = Array.from(porCulturaMap.entries()).map(([cultura_nome, registros]) => {
            const dadosCultura = CULTURAS[cultura_nome] || {};
            const media = round2(registros.reduce((s, r) => s + r.produtividade_real, 0) / registros.length);
            const mediaRegional = dadosCultura.produtividade_media_sc_ha || dadosCultura.produtividade_ton_ha || null;

            let comparacaoRegional = null;
            if (mediaRegional) {
                if (media > mediaRegional * 1.02) comparacaoRegional = 'acima';
                else if (media < mediaRegional * 0.98) comparacaoRegional = 'abaixo';
                else comparacaoRegional = 'na_media';
            }

            return {
                cultura_nome,
                emoji: dadosCultura.emoji || '🌱',
                unidade: dadosCultura.produtividade_media_sc_ha ? 'sc/ha' : (dadosCultura.produtividade_ton_ha ? 'ton/ha' : 'sc/ha'),
                media,
                registros,
                tendencia: calcularTendencia(registros),
                media_regional: mediaRegional,
                comparacao_regional: comparacaoRegional
            };
        });

        const receitas = serieCronologica.map((s) => s.receita_estimada).filter((v) => v !== null);
        const receitaTotal = round2(receitas.reduce((s, v) => s + v, 0));
        const anosCobertos = new Set(historico.map((h) => String(h.safra_ano).match(/\d{4}/)?.[0]).filter(Boolean)).size || 1;
        const areaHa = talhao.area_ha !== null ? Number(talhao.area_ha) : 0;

        const analise = [];
        porCultura.forEach((c) => {
            if (c.tendencia.tipo === 'crescente') {
                analise.push(`Produtividade de ${c.cultura_nome.toLowerCase()} crescente — o manejo e a correção de solo aplicados estão dando resultado.`);
            } else if (c.tendencia.tipo === 'decrescente') {
                analise.push(`${c.cultura_nome} em queda — vale revisar manejo, pragas/doenças e adubação para a próxima safra dessa cultura.`);
            }
            if (c.comparacao_regional === 'abaixo') {
                analise.push(`⚠️ ${c.cultura_nome}: média do talhão (${c.media} ${c.unidade}) abaixo da referência (${c.media_regional} ${c.unidade}) — avaliar manejo.`);
            } else if (c.comparacao_regional === 'acima') {
                analise.push(`✅ ${c.cultura_nome}: média do talhão (${c.media} ${c.unidade}) acima da referência (${c.media_regional} ${c.unidade}).`);
            }
        });
        if (receitaTotal > 0) {
            analise.push(`Receita estimada no histórico registrado: R$ ${receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${areaHa > 0 ? ` (R$ ${round2(receitaTotal / areaHa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/ha)` : ''}. Valores calculados com o preço atual da saca, não o preço da época de cada venda.`);
        }

        return res.status(200).json({
            success: true,
            talhao: talhaoResumo(talhao),
            data_geracao: new Date().toISOString(),
            sem_dados: false,
            serie_cronologica: serieCronologica,
            por_cultura: porCultura,
            resumo: {
                receita_total_estimada: receitaTotal,
                receita_media_anual: round2(receitaTotal / anosCobertos),
                receita_media_ha: areaHa > 0 ? round2(receitaTotal / areaHa) : null,
                analise
            }
        });
    } catch (err) {
        console.error('Erro ao gerar relatório de produtividade:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// ============================================================================
// PERSISTÊNCIA — salvar / listar / buscar / excluir relatórios gerados
// ============================================================================

const TIPOS_VALIDOS = ['nutricional', 'recomendacao', 'rotacao', 'produtividade'];

// GET /api/relatorios — lista os relatórios salvos do usuário
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.id, r.tipo, r.titulo, r.resumo, r.data_geracao, r.talhao_id, t.nome AS talhao_nome
             FROM relatorios r
             JOIN talhoes t ON t.id = r.talhao_id
             WHERE r.user_id = ?
             ORDER BY r.data_geracao DESC, r.id DESC`,
            [req.user.userId]
        );

        return res.status(200).json({ success: true, relatorios: rows });
    } catch (err) {
        console.error('Erro ao listar relatórios:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// GET /api/relatorios/:id — busca um relatório salvo (com o JSON completo)
router.get('/:id(\\d+)', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.*, t.nome AS talhao_nome
             FROM relatorios r
             JOIN talhoes t ON t.id = r.talhao_id
             WHERE r.id = ? AND r.user_id = ?`,
            [req.params.id, req.user.userId]
        );
        const relatorio = rows[0];
        if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });

        return res.status(200).json({ success: true, relatorio });
    } catch (err) {
        console.error('Erro ao buscar relatório:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// POST /api/relatorios — salva um relatório gerado
router.post('/', async (req, res) => {
    const body = req.body || {};
    const talhaoId = Number(body.talhao_id);
    const tipo = body.tipo;
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
    const resumo = typeof body.resumo === 'string' ? body.resumo.trim().slice(0, 500) : null;

    if (!Number.isFinite(talhaoId)) return res.status(400).json({ error: 'Informe o talhão' });
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
    if (!titulo) return res.status(400).json({ error: 'Informe o título do relatório' });
    if (!body.dados || typeof body.dados !== 'object') return res.status(400).json({ error: 'Informe os dados do relatório' });

    try {
        const talhao = await buscarTalhaoDoUsuario(talhaoId, req.user.userId);
        if (!talhao) return res.status(404).json({ error: 'Talhão não encontrado' });

        const [result] = await pool.query(
            `INSERT INTO relatorios (user_id, talhao_id, tipo, titulo, dados, resumo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.userId, talhaoId, tipo, titulo, JSON.stringify(body.dados), resumo]
        );

        const [rows] = await pool.query('SELECT * FROM relatorios WHERE id = ?', [result.insertId]);

        return res.status(201).json({ success: true, relatorio: rows[0] });
    } catch (err) {
        console.error('Erro ao salvar relatório:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

// DELETE /api/relatorios/:id — exclui um relatório salvo
router.delete('/:id(\\d+)', async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM relatorios WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.userId]
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Relatório não encontrado' });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir relatório:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
