// ============================================================================
// Motor de recomendação do Planejador de Rotação de Culturas. Recebe os
// dados de um talhão + seu histórico de plantio + os preços atuais e
// devolve as culturas viáveis para a próxima safra, ordenadas por score
// (0-100). Puro/sem I/O — routes/rotacao.js busca os dados no banco e só
// chama gerarRecomendacao().
// ============================================================================

const CULTURAS = require('../data/culturas');

const FAMILIA_LABEL = {
    leguminosa: 'Leguminosa',
    graminea: 'Gramínea',
    brassicacea: 'Brassicácea',
    solanacea: 'Solanácea'
};

function familiaLabel(familia) {
    return FAMILIA_LABEL[familia] || familia || 'cultura';
}

// Mês atual decide se a PRÓXIMA safra a planejar é verão ou inverno: de
// março a agosto a safra de inverno já está no campo, então o que falta
// planejar é o verão seguinte; de setembro a fevereiro é o inverso.
function determinarProximaSafra(date = new Date()) {
    const mes = date.getMonth() + 1;
    const ano = date.getFullYear();
    if (mes >= 3 && mes <= 8) {
        return { tipo: 'verao', label: `Verão ${ano}/${ano + 1}` };
    }
    return { tipo: 'inverno', label: `Inverno ${ano}` };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Mapeia v (entre min e max) para uma nota 0-100. Se max <= min (ex: nenhuma
// cultura viável deu lucro positivo), evita divisão por zero.
function normalizar(v, min, max) {
    if (max <= min) return v > min ? 100 : 0;
    return clamp(((v - min) / (max - min)) * 100, 0, 100);
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

// Lucro estimado por hectare. Fumo usa receita_estimada_ha (fixa, não
// depende de preço por saca); as demais usam produtividade × preço da saca.
// Coberturas não geram receita (retorna null).
function calcularLucroHa(dados, precoSaca) {
    if (dados.cobertura) return null;
    if (dados.receita_estimada_ha != null) {
        return { receita: dados.receita_estimada_ha, lucro: dados.receita_estimada_ha - dados.custo_estimado_ha };
    }
    if (precoSaca == null || !dados.produtividade_media_sc_ha) return null;
    const receita = dados.produtividade_media_sc_ha * precoSaca;
    return { receita, lucro: receita - dados.custo_estimado_ha };
}

function avaliarSolo(dados, solo) {
    const alertas = [];
    let ok = true;

    const checks = [
        ['ph', 'pH', solo.ph],
        ['P', 'P', solo.P],
        ['K', 'K', solo.K],
        ['V', 'V%', solo.V]
    ];

    checks.forEach(([key, label, valor]) => {
        if (valor == null) return; // dado ausente: não penaliza, não alerta
        const minimo = dados.solo_minimo[key];
        if (minimo == null) return;
        if (valor < minimo) {
            ok = false;
            alertas.push(`${label} abaixo do mínimo (${valor} < ${minimo})`);
        }
    });

    return { ok, alertas };
}

function scoreSolo(dados, solo) {
    let score = 50;
    const pares = [
        ['ph', 15, 5, -20],
        ['P', 12, 5, -15],
        ['K', 12, 5, -15],
        ['V', 11, 5, -10]
    ];

    pares.forEach(([key, bonusIdeal, bonusMinimo, penalidade]) => {
        const valor = solo[key];
        if (valor == null) return;
        const ideal = dados.solo_ideal[key];
        const minimo = dados.solo_minimo[key];
        if (ideal != null && valor >= ideal) score += bonusIdeal;
        else if (minimo != null && valor >= minimo) score += bonusMinimo;
        else score += penalidade;
    });

    return clamp(score, 0, 100);
}

function scoreAgronomico(dados, nomeCultura, ultimaCulturaDados, familiasRecentes, soloMo) {
    let score = 50;
    const justificativasBonus = [];

    if (ultimaCulturaDados && Array.isArray(ultimaCulturaDados.ideal_apos) && ultimaCulturaDados.ideal_apos.includes(nomeCultura)) {
        score += 25;
        justificativasBonus.push('sequencia_ideal');
    }

    if (!familiasRecentes.has(dados.familia)) {
        score += 10;
        justificativasBonus.push('diversidade');
    }

    const beneficios = dados.beneficios_solo || [];
    if (soloMo != null && soloMo < 2.5 && beneficios.includes('melhora_MO')) {
        score += 10;
        justificativasBonus.push('melhora_mo');
    }
    if (soloMo != null && soloMo < 2.5 && beneficios.includes('fixa_N')) {
        score += 10;
        justificativasBonus.push('fixa_n_mo');
    }
    if (beneficios.includes('descompactacao') || beneficios.includes('raiz_pivotante')) {
        score += 5;
        justificativasBonus.push('descompactacao');
    }
    if (beneficios.includes('palhada_abundante') || beneficios.includes('cobertura_densa')) {
        score += 5;
        justificativasBonus.push('palhada');
    }

    return { score: clamp(score, 0, 100), bonus: justificativasBonus };
}

function montarJustificativas({ dados, nomeCultura, ultimaCulturaNome, ultimaCulturaDados, bonusAgronomico, soloAvaliado, lucroInfo, soloMo }) {
    const j = [];

    if (bonusAgronomico.includes('sequencia_ideal') && ultimaCulturaDados) {
        j.push(`✓ ${familiaLabel(dados.familia)} após ${familiaLabel(ultimaCulturaDados.familia)} — sequência ideal de rotação`);
    }

    if ((dados.beneficios_solo || []).includes('fixa_N')) {
        j.push('✓ Fixa nitrogênio, reduz custo de adubação da próxima safra');
    }

    if (soloAvaliado.ok && soloAvaliado.checked) {
        j.push(`✓ Solo compatível com as exigências da cultura`);
    }
    soloAvaliado.alertas.forEach((a) => j.push(`Solo precisa correção: ${a}`));

    if (dados.cobertura) {
        j.push(`✓ Baixo custo (R$ ${dados.custo_estimado_ha}/ha), protege o solo`);
    } else if (lucroInfo && lucroInfo.lucro > 0) {
        const produtividadeTxt = dados.produtividade_media_sc_ha
            ? `${dados.produtividade_media_sc_ha} sc/ha`
            : `${dados.produtividade_ton_ha} ton/ha`;
        const lucroTxt = round2(lucroInfo.lucro).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        j.push(`✓ Lucro estimado: R$ ${lucroTxt}/ha (${produtividadeTxt} — custo R$ ${dados.custo_estimado_ha}/ha)`);
    }

    if (bonusAgronomico.includes('diversidade')) {
        j.push('✓ Diversifica a rotação (família botânica diferente das últimas culturas)');
    }
    if (bonusAgronomico.includes('melhora_mo') || bonusAgronomico.includes('fixa_n_mo')) {
        j.push(`✓ Matéria orgânica atual baixa (${soloMo}%) — esta cultura ajuda a melhorá-la`);
    }
    if (bonusAgronomico.includes('descompactacao')) {
        j.push('✓ Raiz pivotante ajuda a descompactar o solo naturalmente');
    }
    if (bonusAgronomico.includes('palhada')) {
        j.push('✓ Gera palhada abundante, protege o solo e facilita o plantio direto seguinte');
    }

    return j;
}

// ----------------------------------------------------------------------------
// gerarRecomendacao(talhao, historico, precosPorCultura, dataRef?)
//
// talhao: { area_ha, cultura_nome, solo_ph, solo_mo, solo_p, solo_k, solo_v }
// historico: array (mais recente primeiro) de { cultura_nome, familia_botanica }
// precosPorCultura: Map<string, number|null> (nome da cultura -> preco_saca)
// ----------------------------------------------------------------------------
function gerarRecomendacao(talhao, historico, precosPorCultura, dataRef) {
    const proximaSafra = determinarProximaSafra(dataRef);

    const ultimaCulturaNome = (historico[0] && historico[0].cultura_nome) || talhao.cultura_nome || null;
    const ultimaCulturaDados = ultimaCulturaNome ? CULTURAS[ultimaCulturaNome] : null;

    const familiasRecentes = new Set();
    for (let i = 0; i < 2; i++) {
        const nome = (historico[i] && historico[i].cultura_nome) || (i === 0 ? talhao.cultura_nome : null);
        const dados = nome ? CULTURAS[nome] : null;
        if (dados) familiasRecentes.add(dados.familia);
    }

    const solo = {
        ph: talhao.solo_ph != null ? Number(talhao.solo_ph) : null,
        P: talhao.solo_p != null ? Number(talhao.solo_p) : null,
        K: talhao.solo_k != null ? Number(talhao.solo_k) : null,
        V: talhao.solo_v != null ? Number(talhao.solo_v) : null
    };
    const soloMo = talhao.solo_mo != null ? Number(talhao.solo_mo) : null;

    const candidatosSafra = Object.entries(CULTURAS).filter(([, dados]) => dados.safra === proximaSafra.tipo);

    let viaveis = candidatosSafra.filter(([nome]) => {
        if (!ultimaCulturaDados || !Array.isArray(ultimaCulturaDados.evitar_apos)) return true;
        return !ultimaCulturaDados.evitar_apos.includes(nome);
    });

    // Se a restrição de família zerou tudo, relaxa em vez de devolver vazio.
    if (viaveis.length === 0) viaveis = candidatosSafra;

    // Primeira passada: lucro bruto de cada candidata, pra achar o teto usado
    // na normalização do score de lucro.
    const lucros = viaveis.map(([nome, dados]) => {
        const preco = precosPorCultura.get(nome) ?? null;
        return calcularLucroHa(dados, preco);
    });
    const maiorLucro = Math.max(0, ...lucros.filter((l) => l).map((l) => l.lucro));

    const recomendacoes = viaveis.map(([nome, dados], idx) => {
        const preco = precosPorCultura.get(nome) ?? null;
        const lucroInfo = lucros[idx];

        let scoreLucro;
        if (dados.cobertura) scoreLucro = 20;
        else if (lucroInfo) scoreLucro = normalizar(lucroInfo.lucro, 0, maiorLucro);
        else scoreLucro = 30;

        const scoreSoloVal = scoreSolo(dados, solo);
        const { score: scoreAgro, bonus: bonusAgronomico } = scoreAgronomico(dados, nome, ultimaCulturaDados, familiasRecentes, soloMo);

        const scoreFinal = Math.round(scoreLucro * 0.4 + scoreSoloVal * 0.3 + scoreAgro * 0.3);

        const soloAvaliadoRaw = avaliarSolo(dados, solo);
        const soloAvaliado = { ...soloAvaliadoRaw, checked: solo.ph != null || solo.P != null || solo.K != null || solo.V != null };

        const justificativas = montarJustificativas({
            dados, nomeCultura: nome, ultimaCulturaNome, ultimaCulturaDados,
            bonusAgronomico, soloAvaliado, lucroInfo, soloMo
        });

        return {
            cultura: nome,
            emoji: dados.emoji,
            familia: dados.familia,
            score: scoreFinal,
            scores_detalhados: { lucro: Math.round(scoreLucro), solo: scoreSoloVal, agronomico: scoreAgro },
            lucro_estimado_ha: lucroInfo ? round2(lucroInfo.lucro) : null,
            receita_bruta_ha: lucroInfo ? round2(lucroInfo.receita) : null,
            custo_estimado_ha: dados.custo_estimado_ha,
            produtividade_media: dados.produtividade_media_sc_ha
                ? `${dados.produtividade_media_sc_ha} sc/ha`
                : (dados.produtividade_ton_ha ? `${dados.produtividade_ton_ha} ton/ha` : 'cobertura'),
            preco_saca: preco,
            cobertura: !!dados.cobertura,
            solo_ok: soloAvaliado.ok,
            alertas: soloAvaliado.alertas,
            justificativas,
            notas: dados.notas
        };
    });

    recomendacoes.sort((a, b) => b.score - a.score);
    recomendacoes.forEach((r, i) => { r.rank = i + 1; });

    return {
        proximaSafra,
        ultimaCultura: ultimaCulturaNome,
        soloResumo: { ph: solo.ph, mo: soloMo, P: solo.P, K: solo.K, V: solo.V },
        recomendacoes: recomendacoes.slice(0, 3)
    };
}

// Histórico pode ser preenchido fora de ordem (ex: agricultor cadastra uma
// safra antiga depois de já ter registrado safras mais recentes), então não
// dá pra confiar em `created_at` (ordem de cadastro) pra achar a "última
// cultura" — precisa da ordem agronômica real de plantio. safra_ano é texto
// livre ("2025" ou "2025/2026"); aproximamos por ano + 0.5 para verão
// (que começa na metade final do ano) vs +0 para inverno (começa antes,
// no mesmo ano civil), então "Inverno 2025" < "Verão 2025/2026" < "Inverno 2026".
function chaveCronologica(registro) {
    const match = String(registro.safra_ano || '').match(/(\d{4})/);
    const ano = match ? Number(match[1]) : 0;
    const offset = registro.safra_tipo === 'verao' ? 0.5 : 0;
    return ano + offset;
}

function ordenarHistoricoCronologico(historico) {
    return [...historico].sort((a, b) => {
        const diff = chaveCronologica(b) - chaveCronologica(a);
        if (diff !== 0) return diff;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

module.exports = { gerarRecomendacao, determinarProximaSafra, ordenarHistoricoCronologico, FAMILIA_LABEL };
