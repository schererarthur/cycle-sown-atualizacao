// ============================================================================
// relatorios.js — lógica da Central de Relatórios (relatorios.html).
// Busca talhões e relatórios salvos, chama os 4 endpoints de geração
// (backend/routes/relatorios.js), renderiza cada tipo de relatório e salva
// automaticamente o resultado (POST /api/relatorios) para reabrir depois
// sem recalcular. Gráficos do relatório de Produtividade são SVG puro.
// ============================================================================

(function () {
    const isLocalDev = window.location.protocol === 'file:' ||
        ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalDev
        ? 'http://localhost:3000/api'
        : 'https://backend-production-2af81.up.railway.app/api';

    // Paleta categórica só para distinguir culturas nos gráficos — não faz
    // parte do esquema de status (bom/regular/ruim) do resto do site, que
    // usa exclusivamente as cores da marca (#066a04/#5dc135) + âmbar/vermelho.
    const CULTURA_COLORS = {
        'Soja': '#066a04', 'Milho': '#F9A825', 'Trigo': '#B08968', 'Feijão': '#7c3aed',
        'Fumo': '#c2410c', 'Sorgo': '#0891b2', 'Cevada': '#a16207', 'Canola': '#be185d',
        'Aveia Preta': '#4d7c0f', 'Centeio': '#0369a1', 'Ervilhaca': '#0f766e', 'Nabo Forrageiro': '#9333ea'
    };

    let talhoes = [];
    let relatoriosSalvos = [];
    let selectedTalhaoId = null;

    function getToken() {
        return localStorage.getItem('cycleSownToken');
    }

    async function apiRequest(path, method, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        let data = null;
        try { data = await response.json(); } catch (e) { data = null; }

        if (!response.ok) {
            throw new Error((data && data.error) || 'Erro ao comunicar com o servidor.');
        }
        return data;
    }

    // ----------------------------------------------------------------------
    // Helpers de formatação
    // ----------------------------------------------------------------------
    function money(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
        const n = Number(value);
        const sinal = n < 0 ? '-' : '';
        return `${sinal}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    function statusBadge(status) {
        const label = { bom: 'BOM', regular: 'REGULAR', ruim: 'RUIM', indisponivel: '—' };
        const cls = { bom: 'badge-bom', regular: 'badge-regular', ruim: 'badge-ruim', indisponivel: 'badge-indisponivel' };
        return `<span class="text-xs font-bold px-3 py-1 rounded-full ${cls[status] || 'badge-indisponivel'}">${label[status] || '—'}</span>`;
    }

    function barPercent(status) {
        return { bom: 90, regular: 55, ruim: 25, indisponivel: 0 }[status] || 0;
    }

    function barColor(status) {
        return { bom: '#066a04', regular: '#F9A825', ruim: '#c62828', indisponivel: '#cbd5e1' }[status] || '#cbd5e1';
    }

    function scoreBadgeClass(score) {
        if (score >= 70) return 'badge-bom';
        if (score >= 50) return 'badge-regular';
        return 'badge-ruim';
    }

    function culturaColor(nome) {
        return CULTURA_COLORS[nome] || '#066a04';
    }

    function disclaimer(texto) {
        return `<p class="text-xs text-slate-400 mt-6 pt-4 border-t border-slate-100">${texto} Consulte um engenheiro agrônomo (CREA) para orientação técnica completa (ART).</p>`;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ----------------------------------------------------------------------
    // Casca comum de todos os relatórios: cabeçalho com título + botão de
    // exportar PDF (escondido na impressão) + rodapé de impressão.
    // ----------------------------------------------------------------------
    function renderReportShell(titulo, subtitulo, bodyHtml) {
        const viewer = document.getElementById('reportViewer');
        viewer.innerHTML = `
            <div class="report-content bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div class="print-only px-8 pt-8">
                    <div class="text-xs font-bold uppercase tracking-widest text-[#066a04]">Cycle Sown</div>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 sm:px-8 py-6 border-b border-slate-100">
                    <div>
                        <h2 class="text-xl font-bold text-slate-900">${escapeHtml(titulo)}</h2>
                        <p class="text-sm text-slate-500 mt-0.5">${subtitulo}</p>
                    </div>
                    <button type="button" onclick="window.print()" class="no-print shrink-0 px-4 py-2.5 rounded-lg bg-stone-900 hover:bg-black text-white text-sm font-semibold transition-colors">
                        Exportar PDF
                    </button>
                </div>
                <div class="px-6 sm:px-8 py-6">${bodyHtml}</div>
                <div class="print-only px-8 pb-8 text-xs text-slate-400 border-t border-slate-100 pt-4 mt-4">
                    Gerado por Cycle Sown · cyclesown.com · ${formatDate(new Date().toISOString())}
                </div>
            </div>
        `;
        viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ========================================================================
    // RELATÓRIO 1 — NUTRICIONAL DO SOLO
    // ========================================================================
    function renderNutricional(dados) {
        const r = dados.resumo;
        const healthPct = r.fertilidade_score != null ? r.fertilidade_score : 0;

        const resumoHtml = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 mb-8 report-section">
                <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h3 class="font-bold text-slate-900">Resumo geral</h3>
                    <div class="text-right">
                        <div class="text-3xl font-black text-slate-900">${r.fertilidade_score != null ? r.fertilidade_score + '%' : '—'}</div>
                        <div class="text-xs text-slate-500 uppercase font-bold tracking-wide">Fertilidade</div>
                    </div>
                </div>
                <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-4">
                    <div class="h-full bg-[#066a04]" style="width:${healthPct}%"></div>
                </div>
                <div class="flex flex-wrap gap-2 mb-4 text-xs font-bold">
                    <span class="px-3 py-1 rounded-full badge-bom">${r.parametros_bons} BOM</span>
                    <span class="px-3 py-1 rounded-full badge-regular">${r.parametros_regulares} REGULAR</span>
                    <span class="px-3 py-1 rounded-full badge-ruim">${r.parametros_ruins} RUIM</span>
                </div>
                <p class="text-sm text-slate-700">${escapeHtml(r.diagnostico_geral)}</p>
            </div>
        `;

        const paramsHtml = dados.parametros.map((p) => `
            <div class="border border-slate-200 rounded-xl p-4 report-section">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <span class="font-semibold text-slate-800 text-sm">${escapeHtml(p.nome)}</span>
                    ${statusBadge(p.status)}
                </div>
                <div class="flex items-baseline gap-1.5 mb-2">
                    <span class="text-2xl font-black text-slate-900">${p.valor !== null ? p.valor : '—'}</span>
                    <span class="text-xs text-slate-400">${p.unidade}</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                    <div class="h-full" style="width:${barPercent(p.status)}%; background:${barColor(p.status)}"></div>
                </div>
                <p class="text-[11px] text-slate-400 mb-1.5">${escapeHtml(p.referencia)}</p>
                <p class="text-sm text-slate-600">${escapeHtml(p.interpretacao)}</p>
            </div>
        `).join('');

        renderReportShell(
            'Relatório Nutricional do Solo',
            `${escapeHtml(dados.talhao.nome)}${dados.talhao.area_ha != null ? ' · ' + dados.talhao.area_ha + ' ha' : ''} · Gerado em ${formatDate(dados.data_geracao)}`,
            `${resumoHtml}
             <h3 class="font-bold text-slate-900 mb-4">Parâmetros detalhados</h3>
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${paramsHtml}</div>
             ${disclaimer('Fonte: Manual de Calagem e Adubação CQFS-RS/SC (2016).')}`
        );
    }

    // ========================================================================
    // RELATÓRIO 2 — RECOMENDAÇÃO DE CULTURA
    // ========================================================================
    function financeiroCard(fin) {
        if (!fin) return '';
        if (fin.cobertura) {
            return `
                <div class="bg-white rounded-xl border border-slate-200 p-4 mt-4">
                    <div class="flex justify-between text-sm py-1"><span class="text-slate-500">Custo estimado</span><strong>${money(fin.custo_estimado)}</strong></div>
                    <div class="flex justify-between text-sm py-1 border-t border-slate-100 pt-2 mt-1"><span class="text-slate-700 font-semibold">Cultura de cobertura — sem receita direta</span><strong class="text-red-600">${money(fin.lucro_estimado)}</strong></div>
                </div>`;
        }
        return `
            <div class="bg-white rounded-xl border border-slate-200 p-4 mt-4 space-y-1 text-sm">
                ${fin.produtividade_esperada != null ? `<div class="flex justify-between"><span class="text-slate-500">Produtividade esperada</span><strong>${fin.produtividade_esperada} ${fin.unidade_produtividade || ''}</strong></div>` : ''}
                ${fin.producao_total != null ? `<div class="flex justify-between"><span class="text-slate-500">Produção total</span><strong>${fin.producao_total} ${fin.unidade_produtividade || ''}</strong></div>` : ''}
                ${fin.preco_saca != null ? `<div class="flex justify-between"><span class="text-slate-500">Preço de referência</span><strong>${money(fin.preco_saca)}</strong></div>` : ''}
                <div class="flex justify-between"><span class="text-slate-500">Receita bruta</span><strong>${money(fin.receita_bruta)}</strong></div>
                <div class="flex justify-between"><span class="text-slate-500">Custo estimado</span><strong>${money(fin.custo_estimado)}</strong></div>
                <div class="flex justify-between border-t border-slate-100 pt-2 mt-1"><span class="font-bold text-slate-900">Lucro estimado</span><strong class="${fin.lucro_estimado >= 0 ? 'text-[#066a04]' : 'text-red-600'}">${money(fin.lucro_estimado)}</strong></div>
                <div class="flex justify-between text-xs text-slate-400"><span>Lucro por hectare</span><span>${money(fin.lucro_por_ha)}/ha</span></div>
            </div>`;
    }

    function renderRecomendacao(dados) {
        const ctx = dados.contexto;
        const principal = dados.recomendacao_principal;

        const contextoHtml = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 mb-8 report-section text-sm space-y-1.5">
                <h3 class="font-bold text-slate-900 mb-2">Contexto do talhão</h3>
                <p><span class="text-slate-500">Última cultura:</span> <strong>${escapeHtml(ctx.ultima_cultura || 'Nenhuma registrada')}</strong>${ctx.ultima_familia ? ` <span class="text-slate-400">(${escapeHtml(ctx.ultima_familia)})</span>` : ''}</p>
                <p><span class="text-slate-500">Solo:</span> ${['ph', 'mo', 'P', 'K', 'V'].filter((k) => ctx.solo_resumo[k] != null).map((k) => `${k === 'mo' ? 'MO' : k} ${ctx.solo_resumo[k]}`).join(' · ') || 'dados não informados'}</p>
                <p><span class="text-slate-500">Fertilidade geral:</span> <strong>${ctx.fertilidade_score != null ? ctx.fertilidade_score + '/100' : 'não calculada'}</strong></p>
            </div>
        `;

        const compatHtml = (principal && principal.compatibilidade_solo.length > 0) ? `
            <h3 class="font-bold text-slate-900 mb-3 mt-8">Compatibilidade do solo com a recomendação principal</h3>
            <div class="space-y-2">
                ${principal.compatibilidade_solo.map((c) => `
                    <div class="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-4 py-2.5">
                        <span class="text-slate-600">${escapeHtml(c.parametro)}</span>
                        <span>${c.valor} <span class="text-slate-400">(mín ${c.minimo})</span></span>
                        <span class="font-bold ${c.ok ? 'text-[#066a04]' : 'text-red-600'}">${c.ok ? '✓ acima do mínimo' : '✗ abaixo do mínimo'}</span>
                    </div>
                `).join('')}
            </div>` : '';

        const principalHtml = principal ? `
            <div class="border-2 border-[#066a04] rounded-2xl p-6 mb-6 report-section">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <span class="text-xs font-bold text-[#066a04] uppercase tracking-wide">Recomendação principal</span>
                    <span class="text-sm font-bold px-3 py-1 rounded-full ${scoreBadgeClass(principal.score)}">Score: ${principal.score}/100</span>
                </div>
                <h3 class="text-2xl font-black text-slate-900 mb-3">${escapeHtml(principal.cultura.toUpperCase())}</h3>
                <p class="text-xs font-bold text-slate-500 uppercase mb-2">Por que esta cultura?</p>
                <ul class="text-sm text-slate-700 space-y-1.5 mb-2">
                    ${principal.justificativas.map((j) => `<li>${escapeHtml(j)}</li>`).join('')}
                </ul>
                ${financeiroCard(principal.projecao_financeira)}
                <div class="flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500 mt-4">
                    <span>Janela de plantio: <strong class="text-slate-700">${principal.janela_plantio}</strong></span>
                    <span>Colheita prevista: <strong class="text-slate-700">${principal.janela_colheita}</strong></span>
                </div>
            </div>
        ` : '<p class="text-sm text-slate-500">Nenhuma cultura viável encontrada para a próxima safra deste talhão.</p>';

        const altHtml = dados.alternativas.map((alt, i) => `
            <div class="border border-slate-200 rounded-xl p-5 mb-4 report-section">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span class="text-xs font-bold text-slate-400 uppercase">Alternativa ${i + 2}</span>
                    <span class="text-xs font-bold px-3 py-1 rounded-full ${scoreBadgeClass(alt.score)}">Score: ${alt.score}/100</span>
                </div>
                <h4 class="text-lg font-bold text-slate-900 mb-1">${escapeHtml(alt.cultura)}</h4>
                <p class="text-sm text-slate-600 mb-1">${alt.cobertura ? `Cobertura — custo ${money(alt.custo_estimado_ha)}/ha` : `Lucro estimado: ${money(alt.lucro_estimado_ha)}/ha`}</p>
                ${(() => { const j = alt.justificativas.find((x) => !x.startsWith('')); return j ? `<p class="text-xs text-slate-500">${escapeHtml(j)}</p>` : ''; })()}
                ${alt.alertas.length ? `<p class="text-xs text-amber-600 mt-1">${alt.alertas.map(escapeHtml).join(' · ')}</p>` : ''}
            </div>
        `).join('');

        renderReportShell(
            'Relatório de Recomendação de Cultura',
            `${escapeHtml(dados.talhao.nome)}${dados.talhao.area_ha != null ? ' · ' + dados.talhao.area_ha + ' ha' : ''} · Próxima safra: ${dados.proxima_safra.label}`,
            `${contextoHtml}${principalHtml}${altHtml}${compatHtml}${disclaimer('Recomendações baseadas no Manual CQFS-RS/SC (2016).')}`
        );
    }

    // ========================================================================
    // RELATÓRIO 3 — PLANEJAMENTO DE ROTAÇÃO E CUSTOS
    // ========================================================================
    function renderRotacao(dados) {
        const historicoHtml = dados.historico_recente.length > 0 ? `
            <h3 class="font-bold text-slate-900 mb-3">Histórico recente</h3>
            <div class="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-8 report-section">
                ${dados.historico_recente.map((h) => `
                    <div class="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span class="text-slate-500">${h.safra_tipo === 'verao' ? 'Verão' : 'Inverno'} ${h.safra_ano}</span>
                        <span class="font-medium">${escapeHtml(h.cultura_nome)}</span>
                        <span class="text-slate-500">${h.produtividade_real != null ? h.produtividade_real + ' sc/ha' : '—'}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const ciclosHtml = dados.ciclos.map((c) => `
            <div class="border border-slate-200 rounded-xl p-5 mb-4 report-section">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span class="text-xs font-bold text-slate-400 uppercase">Ciclo ${c.numero} · ${c.safra.label}</span>
                    <span class="text-xs font-bold px-3 py-1 rounded-full ${scoreBadgeClass(c.score)}">Score: ${c.score}</span>
                </div>
                <h4 class="text-lg font-bold text-slate-900 mb-2">${escapeHtml(c.cultura)}${c.cobertura ? ' <span class="text-xs font-normal text-slate-400">(cobertura)</span>' : ''}</h4>
                <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mb-3">
                    <span>Plantio: <strong class="text-slate-700">${c.janela_plantio}</strong></span>
                    <span>Colheita: <strong class="text-slate-700">${c.janela_colheita}</strong></span>
                </div>
                ${!c.cobertura ? `
                    <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-3">
                        <span class="text-slate-500">Produção: <strong class="text-slate-800">${c.financeiro.producao_total ?? '—'} ${c.financeiro.unidade_produtividade || ''}</strong></span>
                        <span class="text-slate-500">Receita: <strong class="text-slate-800">${money(c.financeiro.receita_bruta)}</strong></span>
                        <span class="text-slate-500">Custo: <strong class="text-slate-800">${money(c.financeiro.custo_estimado)}</strong></span>
                        <span class="text-slate-500">Lucro: <strong class="${c.financeiro.lucro_estimado >= 0 ? 'text-[#066a04]' : 'text-red-600'}">${money(c.financeiro.lucro_estimado)}</strong></span>
                    </div>` : `<p class="text-sm text-slate-600 mb-3">Custo: ${money(c.financeiro.custo_estimado)} · protege e melhora o solo para o ciclo seguinte.</p>`}
                <p class="text-xs font-bold text-slate-500 uppercase mb-1">Justificativa agronômica</p>
                <ul class="text-sm text-slate-600 space-y-1">
                    ${c.justificativas.map((j) => `<li>${escapeHtml(j)}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        const rf = dados.resumo_financeiro;
        const resumoHtml = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 my-8 report-section">
                <h3 class="font-bold text-slate-900 mb-4">Resumo financeiro (2 anos / 4 ciclos)</h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div><div class="text-xs text-slate-500 uppercase font-bold mb-1">Receita total</div><div class="text-lg font-black text-slate-900">${money(rf.receita_total)}</div></div>
                    <div><div class="text-xs text-slate-500 uppercase font-bold mb-1">Custo total</div><div class="text-lg font-black text-slate-900">${money(rf.custo_total)}</div></div>
                    <div><div class="text-xs text-slate-500 uppercase font-bold mb-1">Lucro total</div><div class="text-lg font-black text-[#066a04]">${money(rf.lucro_total)}</div></div>
                    <div><div class="text-xs text-slate-500 uppercase font-bold mb-1">Média/ano</div><div class="text-lg font-black text-slate-900">${money(rf.media_por_ano)}</div></div>
                </div>
                ${rf.media_por_ha != null ? `<p class="text-center text-xs text-slate-500 mt-3">Média de lucro: ${money(rf.media_por_ha)}/ha/ano</p>` : ''}
            </div>
        `;

        const seqHtml = `
            <h3 class="font-bold text-slate-900 mb-3">Sequência visual</h3>
            <div class="flex flex-wrap items-center gap-2 mb-2">
                ${dados.sequencia_visual.map((s, i) => `
                    <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 text-sm font-medium">${escapeHtml(s.cultura)}</span>
                    ${i < dados.sequencia_visual.length - 1 ? '<span class="text-slate-300">→</span>' : ''}
                `).join('')}
            </div>
            <p class="text-xs text-slate-400 mb-8">Culturas à esquerda do meio já registradas · a partir do meio, plano projetado.</p>
        `;

        renderReportShell(
            'Plano de Rotação de Culturas (2 anos)',
            `${escapeHtml(dados.talhao.nome)}${dados.talhao.area_ha != null ? ' · ' + dados.talhao.area_ha + ' ha' : ''} · Gerado em ${formatDate(dados.data_geracao)}`,
            `${historicoHtml}<h3 class="font-bold text-slate-900 mb-3">Plano projetado</h3>${ciclosHtml}${resumoHtml}${seqHtml}${disclaimer('Projeções baseadas em produtividade média e preços atuais — valores reais dependem de clima, manejo e mercado.')}`
        );
    }

    // ========================================================================
    // RELATÓRIO 4 — PRODUTIVIDADE (gráficos SVG puro)
    // ========================================================================
    function buildLineChart(serie) {
        const valid = serie.filter((s) => s.produtividade_real != null);
        if (valid.length === 0) return '<p class="text-sm text-slate-400">Sem dados suficientes para o gráfico.</p>';

        const w = 720, h = 260, padL = 40, padR = 16, padT = 16, padB = 36;
        const maxVal = Math.max(...valid.map((s) => s.produtividade_real)) * 1.15 || 1;
        const stepX = valid.length > 1 ? (w - padL - padR) / (valid.length - 1) : 0;

        const xy = valid.map((s, i) => ({
            x: padL + stepX * i,
            y: padT + (1 - s.produtividade_real / maxVal) * (h - padT - padB),
            ...s
        }));

        const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = padT + f * (h - padT - padB);
            const val = Math.round(maxVal * (1 - f));
            return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/><text x="${padL - 8}" y="${y + 3}" font-size="9" fill="#94a3b8" text-anchor="end">${val}</text>`;
        }).join('');

        const pathD = xy.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
        const points = xy.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${culturaColor(p.cultura_nome)}" stroke="white" stroke-width="1.5"><title>${escapeHtml(p.safra_label)} — ${escapeHtml(p.cultura_nome)}: ${p.produtividade_real}</title></circle>`).join('');
        const labels = xy.map((p) => `<text x="${p.x.toFixed(1)}" y="${h - padB + 16}" font-size="9" fill="#64748b" text-anchor="middle">${escapeHtml(p.safra_label.replace('Verão', 'Ver.').replace('Inverno', 'Inv.'))}</text>`).join('');

        const culturasNoGrafico = [...new Set(valid.map((s) => s.cultura_nome))];
        const legenda = culturasNoGrafico.map((c) => `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${culturaColor(c)}"></span>${escapeHtml(c)}</span>`).join('');

        return `
            <svg viewBox="0 0 ${w} ${h}" class="w-full h-auto">
                ${gridLines}
                <path d="${pathD}" fill="none" stroke="#94a3b8" stroke-width="2"/>
                ${points}
                ${labels}
            </svg>
            <div class="flex flex-wrap gap-3 mt-3">${legenda}</div>
        `;
    }

    function buildRevenueBarChart(serie) {
        const valid = serie.filter((s) => s.receita_estimada != null);
        if (valid.length === 0) return '<p class="text-sm text-slate-400">Sem dados de receita estimada.</p>';

        const w = 720, h = 220, padL = 48, padR = 16, padT = 16, padB = 36;
        const maxVal = Math.max(...valid.map((s) => s.receita_estimada)) * 1.15 || 1;
        const barW = (w - padL - padR) / valid.length * 0.6;
        const stepX = (w - padL - padR) / valid.length;

        const bars = valid.map((s, i) => {
            const barH = (s.receita_estimada / maxVal) * (h - padT - padB);
            const x = padL + stepX * i + (stepX - barW) / 2;
            const y = h - padB - barH;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${culturaColor(s.cultura_nome)}"><title>${escapeHtml(s.safra_label)}: R$ ${s.receita_estimada.toLocaleString('pt-BR')}</title></rect>
                    <text x="${(x + barW / 2).toFixed(1)}" y="${h - padB + 16}" font-size="9" fill="#64748b" text-anchor="middle">${escapeHtml(s.safra_label.replace('Verão', 'Ver.').replace('Inverno', 'Inv.'))}</text>`;
        }).join('');

        const gridLines = [0, 0.5, 1].map((f) => {
            const y = padT + f * (h - padT - padB);
            const val = Math.round(maxVal * (1 - f));
            return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/><text x="${padL - 8}" y="${y + 3}" font-size="9" fill="#94a3b8" text-anchor="end">${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}</text>`;
        }).join('');

        return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto">${gridLines}${bars}</svg>`;
    }

    function porCulturaCard(c) {
        const maxVal = Math.max(...c.registros.map((r) => r.produtividade_real), c.media_regional || 0) * 1.1 || 1;
        const linhas = c.registros.map((r, i) => {
            const pct = (r.produtividade_real / maxVal) * 100;
            const prev = i > 0 ? c.registros[i - 1].produtividade_real : null;
            const delta = (prev && prev !== 0) ? ((r.produtividade_real - prev) / prev) * 100 : null;
            return `
                <div class="flex items-center gap-3 text-sm mb-2">
                    <span class="w-28 shrink-0 text-slate-500">${escapeHtml(r.safra_label)}</span>
                    <div class="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden"><div class="h-full" style="width:${pct}%;background:${culturaColor(c.cultura_nome)}"></div></div>
                    <span class="w-20 shrink-0 text-right font-semibold text-slate-800">${r.produtividade_real} ${c.unidade}</span>
                    <span class="w-14 shrink-0 text-right text-xs font-bold ${delta == null ? 'text-slate-300' : (delta >= 0 ? 'text-[#066a04]' : 'text-red-600')}">${delta == null ? '—' : (delta >= 0 ? '▲' : '▼') + Math.abs(delta).toFixed(0) + '%'}</span>
                </div>`;
        }).join('');

        const compLabel = { acima: 'Acima da média regional', abaixo: 'Abaixo da média regional', na_media: '● Na média regional' }[c.comparacao_regional] || '';

        return `
            <div class="border border-slate-200 rounded-xl p-5 mb-4 report-section">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <h4 class="font-bold text-slate-900">${escapeHtml(c.cultura_nome.toUpperCase())}</h4>
                    <span class="text-xs text-slate-500">Média: <strong class="text-slate-800">${c.media} ${c.unidade}</strong></span>
                </div>
                ${linhas}
                <p class="text-sm font-semibold mt-2" style="color:${c.tendencia.cor}">${escapeHtml(c.tendencia.texto)}</p>
                ${compLabel ? `<p class="text-xs text-slate-500 mt-1">${compLabel}${c.media_regional ? ` (referência: ${c.media_regional} ${c.unidade})` : ''}</p>` : ''}
            </div>`;
    }

    function renderProdutividade(dados) {
        if (dados.sem_dados) {
            renderReportShell(
                'Relatório de Produtividade',
                `${escapeHtml(dados.talhao.nome)}`,
                `<div class="text-center py-10">
                    <p class="text-slate-600 mb-3">${escapeHtml(dados.mensagem)}</p>
                    <a href="rotacao.html" class="inline-block px-5 py-2.5 rounded-lg bg-[#066a04] hover:bg-[#055503] text-white text-sm font-semibold transition-colors no-print">Ir para o Planejador de Rotação</a>
                </div>`
            );
            return;
        }

        const graficoHtml = `
            <h3 class="font-bold text-slate-900 mb-3">Produtividade por safra</h3>
            <div class="border border-slate-200 rounded-xl p-5 mb-8 report-section">${buildLineChart(dados.serie_cronologica)}</div>

            <h3 class="font-bold text-slate-900 mb-3">Evolução por cultura</h3>
            <div class="mb-8">${dados.por_cultura.map(porCulturaCard).join('')}</div>

            <h3 class="font-bold text-slate-900 mb-3">Receita estimada por safra</h3>
            <p class="text-xs text-slate-400 mb-3">Calculada com produtividade real × preço atual da saca — não é o preço da época de cada venda.</p>
            <div class="border border-slate-200 rounded-xl p-5 mb-8 report-section">${buildRevenueBarChart(dados.serie_cronologica)}</div>
        `;

        const analiseHtml = dados.resumo.analise.length > 0 ? `
            <h3 class="font-bold text-slate-900 mb-3">Análise geral</h3>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 report-section">
                <ul class="text-sm text-slate-700 space-y-2">
                    ${dados.resumo.analise.map((a) => `<li>• ${escapeHtml(a)}</li>`).join('')}
                </ul>
            </div>
        ` : '';

        renderReportShell(
            'Relatório de Produtividade',
            `${escapeHtml(dados.talhao.nome)}${dados.talhao.area_ha != null ? ' · ' + dados.talhao.area_ha + ' ha' : ''} · Histórico completo`,
            `${graficoHtml}${analiseHtml}${disclaimer('Dados: histórico de safras registrado no Cycle Sown. Análise automatizada.')}`
        );
    }

    const RENDERERS = {
        nutricional: renderNutricional,
        recomendacao: renderRecomendacao,
        rotacao: renderRotacao,
        produtividade: renderProdutividade
    };

    // ========================================================================
    // LAUDO DE FERTILIDADE — antigo relatorios.html. Não depende de talhão nem
    // de backend: lê userStorage.soilAnalysisReports (gravado por index.html
    // via main.js) e usa calculateHealthScoreFromData() do main.js para a
    // nota de Saúde Geral bater com index.html/recommendations.html.
    // ========================================================================
    const LAUDO_NUTRIENT_LABELS = {
        phosphorus: 'Fósforo (P)', potassium: 'Potássio (K)',
        calcium: 'Cálcio (Ca)', magnesium: 'Magnésio (Mg)', sulfur: 'Enxofre (S)',
        iron: 'Ferro (Fe)', manganese: 'Manganês (Mn)', zinc: 'Zinco (Zn)',
        copper: 'Cobre (Cu)', boron: 'Boro (B)'
    };
    const LAUDO_MACRO_KEYS = ['Fósforo (P)', 'Potássio (K)', 'Cálcio (Ca)', 'Magnésio (Mg)', 'Enxofre (S)'];
    const LAUDO_REFERENCE_VALUES = {
        'Fósforo (P)': 20, 'Potássio (K)': 150, 'Cálcio (Ca)': 1000,
        'Magnésio (Mg)': 120, 'Enxofre (S)': 15, 'Ferro (Fe)': 50, 'Manganês (Mn)': 25,
        'Zinco (Zn)': 2.0, 'Cobre (Cu)': 1.0, 'Boro (B)': 1.0
    };
    const LAUDO_CROP_LABELS = { milho: 'Milho', soja: 'Soja', trigo: 'Trigo', tabaco: 'Tabaco' };

    let laudoReports = [];

    function normalizeLaudoData(report) {
        const defaultData = { ph: 6.0, mo: 3.2, nutrients: {} };
        const soilData = report && (report.soilData || report);
        if (!soilData || !soilData.nutrients) return defaultData;

        const nutrients = {};
        Object.entries(soilData.nutrients).forEach(([key, value]) => {
            const label = LAUDO_NUTRIENT_LABELS[key] || key;
            const refValue = LAUDO_REFERENCE_VALUES[label] || Math.max(value || 0, 1);
            nutrients[label] = { val: value, ref: refValue };
        });

        const phVal = soilData.ph ?? soilData.pH ?? soilData.soilPH ?? defaultData.ph;
        return { ph: phVal, mo: soilData.organicMatter ?? defaultData.mo, nutrients };
    }

    function laudoNutrientCard(name, info) {
        const hasValue = info.val !== null && info.val !== undefined && !Number.isNaN(Number(info.val));
        if (!hasValue) {
            return `
                <div class="border border-slate-200 rounded-xl p-4 report-section">
                    <div class="flex items-center justify-between gap-3 mb-2">
                        <span class="font-semibold text-slate-800 text-sm">${escapeHtml(name)}</span>
                        ${statusBadge('indisponivel')}
                    </div>
                    <div class="text-2xl font-black text-slate-300">—</div>
                </div>`;
        }
        const percent = Math.min((Number(info.val) / info.ref) * 100, 100);
        const status = percent >= 90 ? 'bom' : (percent < 60 ? 'ruim' : 'regular');
        return `
            <div class="border border-slate-200 rounded-xl p-4 report-section">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <span class="font-semibold text-slate-800 text-sm">${escapeHtml(name)}</span>
                    ${statusBadge(status)}
                </div>
                <div class="flex items-baseline gap-1.5 mb-2">
                    <span class="text-2xl font-black text-slate-900">${info.val}</span>
                    <span class="text-xs text-slate-400">ppm</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full" style="width:${percent}%; background:${barColor(status)}"></div>
                </div>
            </div>`;
    }

    function laudoRecommendations(data) {
        const recs = [];
        if (data.ph !== undefined && data.ph !== null) {
            if (data.ph < 5.5) recs.push('Solo ácido: aplicar calcário para corrigir acidez.');
            else if (data.ph > 7.5) recs.push('Solo alcalino: considerar aplicação de enxofre para reduzir pH.');
            else recs.push('pH dentro da faixa adequada para muitas culturas.');
        }
        if (data.mo !== undefined && data.mo !== null) {
            if (data.mo < 2) recs.push('Baixa matéria orgânica: adicionar composto ou esterco para melhorar estrutura e retenção de água.');
            else recs.push('Matéria orgânica adequada. Continue manejos que aumentem conteúdo orgânico.');
        }
        Object.entries(data.nutrients || {}).forEach(([label, info]) => {
            const val = parseFloat(info.val);
            const ref = parseFloat(info.ref) || 1;
            if (Number.isNaN(val)) return;
            const short = label.split(' (')[0];
            if (val < ref * 0.6) recs.push(`${short}: nível muito baixo (${val} ppm). Recomenda-se correção pontual antes do plantio.`);
            else if (val < ref * 0.9) recs.push(`${short}: nível moderadamente baixo (${val} ppm). Monitorar e, se necessário, corrigir.`);
        });
        return recs;
    }

    function laudoAdequacy(report, data) {
        const soil = report && (report.soilData || report);
        const ph = soil && (soil.ph ?? soil.pH ?? soil.soilPH);
        const om = soil && (soil.organicMatter ?? soil.mo);
        const entries = [];
        if (ph !== undefined && ph !== null) {
            const value = parseFloat(ph);
            entries.push({ label: 'pH', value, status: value >= 5.5 && value <= 7.5 ? 'Adequado' : 'Precisa correção' });
        }
        if (om !== undefined && om !== null) {
            const value = parseFloat(om);
            entries.push({ label: 'Matéria orgânica', value, status: value >= 2 && value <= 6 ? 'Adequado' : 'Precisa correção' });
        }
        Object.entries(data.nutrients || {}).forEach(([label, info]) => {
            const value = parseFloat(info.val);
            const ref = parseFloat(info.ref) || 1;
            if (!Number.isNaN(value) && ref > 0) {
                const status = value >= ref * 0.8 && value <= ref * 1.2 ? 'Adequado' : 'Precisa correção';
                entries.push({ label, value, ref, status });
            }
        });
        return entries;
    }

    function renderLaudo(idx) {
        const report = laudoReports[idx];
        const data = normalizeLaudoData(report);
        const rawSoil = report && (report.soilData || report);
        const score = (typeof calculateHealthScoreFromData === 'function' && rawSoil)
            ? calculateHealthScoreFromData(rawSoil) : 0;

        const phNum = (data.ph !== undefined && data.ph !== null) ? parseFloat(data.ph) : NaN;
        let phLabel = 'Detectando...', phColor = '#94a3b8';
        if (!Number.isNaN(phNum)) {
            if (phNum < 6) { phLabel = 'Ácido'; phColor = '#c62828'; }
            else if (phNum <= 7) { phLabel = 'Ideal'; phColor = '#066a04'; }
            else { phLabel = 'Alcalino'; phColor = '#F9A825'; }
        }

        const macroHtml = LAUDO_MACRO_KEYS.filter((k) => data.nutrients[k]).map((k) => laudoNutrientCard(k, data.nutrients[k])).join('');
        const microHtml = Object.entries(data.nutrients).filter(([k]) => !LAUDO_MACRO_KEYS.includes(k)).map(([k, v]) => laudoNutrientCard(k, v)).join('');

        const recs = laudoRecommendations(data);
        const recsHtml = recs.length
            ? recs.map((r) => `<div class="mb-2">${escapeHtml(r)}</div>`).join('')
            : '<div>Sem recomendações necessárias — solo em boas condições.</div>';

        const adequacyEntries = laudoAdequacy(report, data);
        const adequacyHtml = adequacyEntries.length
            ? adequacyEntries.map((item) => `
                <div class="bg-white p-4 rounded-xl border border-amber-100">
                    <div class="flex items-center justify-between gap-3">
                        <strong>${escapeHtml(item.label)}</strong>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${item.status === 'Adequado' ? 'badge-bom' : 'badge-regular'}">${item.status}</span>
                    </div>
                    <div class="text-sm text-slate-600 mt-1">Valor informado: ${Number.isNaN(item.value) ? '—' : item.value}${item.ref ? ` · Referência usada: ${item.ref}` : ''}</div>
                </div>`).join('')
            : '<div>Nenhum dado informado para comparar.</div>';

        const plantedCrop = report && report.plantedCropFollowUp;
        const plantedCropHtml = plantedCrop ? `
            <div class="mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 report-section">
                <h4 class="text-slate-700 font-bold mb-2 text-sm">Cultura plantada posteriormente</h4>
                <p class="text-slate-700 text-sm">${escapeHtml(LAUDO_CROP_LABELS[plantedCrop] || plantedCrop)}</p>
            </div>` : '';

        const seletorHtml = laudoReports.length > 1 ? `
            <div class="mb-6 no-print">
                <label class="block text-xs font-bold uppercase text-slate-500 mb-2">Análise salva</label>
                <select onchange="trocarLaudo(this.value)" class="w-full sm:w-96 border border-slate-300 rounded-lg px-3 py-2.5 text-sm">
                    ${laudoReports.map((r, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${escapeHtml(r.title || 'Relatório ' + (i + 1))} — ${formatDate(r.timestamp)}</option>`).join('')}
                </select>
            </div>` : '';

        const bodyHtml = `
            ${seletorHtml}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 report-section">
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                    <div class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Saúde Geral</div>
                    <div class="text-3xl font-black text-slate-900">${score}%</div>
                    <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-3"><div class="h-full bg-[#066a04]" style="width:${score}%"></div></div>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                    <div class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">pH</div>
                    <div class="text-3xl font-black text-slate-900">${Number.isNaN(phNum) ? '—' : phNum.toFixed(1)}</div>
                    <div class="text-xs font-bold mt-2" style="color:${phColor}">${phLabel}</div>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                    <div class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Matéria Orgânica</div>
                    <div class="text-3xl font-black text-slate-900">${data.mo != null ? Number(data.mo).toFixed(1) + '%' : '—'}</div>
                </div>
            </div>

            <h3 class="font-bold text-slate-900 mb-4">Macronutrientes</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">${macroHtml}</div>

            <h3 class="font-bold text-slate-900 mb-4">Micronutrientes</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">${microHtml}</div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 mb-6 report-section">
                <h3 class="font-bold text-xs uppercase tracking-widest text-[#066a04] mb-3">Parecer técnico</h3>
                <p class="text-slate-700 text-base leading-relaxed italic mb-4">${laudoVerdictText(score)}</p>
                <div class="bg-white p-4 rounded-lg border border-slate-200">
                    <h5 class="text-[#066a04] font-bold mb-2 text-sm">Recomendações</h5>
                    <div class="text-slate-700 text-sm">${recsHtml}</div>
                </div>
            </div>

            <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-6 report-section">
                <h5 class="text-amber-800 font-bold mb-4 text-sm">Adequação dos dados informados</h5>
                <div class="space-y-3">${adequacyHtml}</div>
            </div>
            ${plantedCropHtml}
            ${disclaimer('Cálculo de saúde geral e parecer técnico gerados a partir dos valores informados na Análise de Solo.')}
        `;

        renderReportShell(
            'Laudo de Fertilidade',
            `${escapeHtml(report && report.title ? report.title : 'Análise de Solo')} · ${formatDate(report && report.timestamp)}`,
            bodyHtml
        );
    }

    function laudoVerdictText(score) {
        return score > 80
            ? 'Análise conclui um solo de altíssima produtividade. O equilíbrio químico permite o plantio imediato com foco apenas na adubação de arranque.'
            : 'Atenção necessária em pontos específicos de deficiência. Recomenda-se a correção pontual dos nutrientes marcados em vermelho antes do início do ciclo vegetativo.';
    }

    window.trocarLaudo = function (idx) {
        renderLaudo(Number(idx));
    };

    function gerarLaudo() {
        const errorEl = document.getElementById('laudoError');
        laudoReports = JSON.parse(userStorage.getItem('soilAnalysisReports') || '[]');

        if (laudoReports.length === 0) {
            const latest = userStorage.getItem('soilAnalysisData');
            if (latest) laudoReports = [{ title: 'Análise atual', timestamp: new Date().toISOString(), ...JSON.parse(latest) }];
        }

        if (laudoReports.length === 0) {
            errorEl.textContent = 'Nenhuma análise de solo encontrada. Faça uma análise em "Análise" primeiro.';
            errorEl.classList.remove('hidden');
            return;
        }

        errorEl.classList.add('hidden');
        renderLaudo(laudoReports.length - 1);
    }

    // ----------------------------------------------------------------------
    // Título/resumo automáticos para salvar cada tipo de relatório gerado
    // ----------------------------------------------------------------------
    function tituloResumoAuto(tipo, dados, talhaoNome) {
        if (tipo === 'nutricional') {
            const r = dados.resumo;
            return {
                titulo: `Relatório Nutricional — ${talhaoNome}`,
                resumo: `Fertilidade ${r.fertilidade_score != null ? r.fertilidade_score + '/100' : '—'} — ${r.parametros_bons} bons, ${r.parametros_regulares} regular, ${r.parametros_ruins} ruim`
            };
        }
        if (tipo === 'recomendacao') {
            const p = dados.recomendacao_principal;
            return {
                titulo: `Recomendação de Cultura — ${talhaoNome} — ${dados.proxima_safra.label}`,
                resumo: p ? `Top: ${p.cultura} (score ${p.score})${p.projecao_financeira ? ' — Lucro ' + money(p.projecao_financeira.lucro_estimado) : ''}` : 'Sem recomendação viável'
            };
        }
        if (tipo === 'rotacao') {
            return {
                titulo: `Plano de Rotação (2 anos) — ${talhaoNome}`,
                resumo: `Lucro projetado: ${money(dados.resumo_financeiro.lucro_total)}`
            };
        }
        return {
            titulo: `Relatório de Produtividade — ${talhaoNome}`,
            resumo: dados.sem_dados ? 'Sem histórico suficiente ainda' : `Receita histórica estimada: ${money(dados.resumo.receita_total_estimada)}`
        };
    }

    // ----------------------------------------------------------------------
    // Gerar novo relatório: busca dados atuais, renderiza, salva
    // ----------------------------------------------------------------------
    async function gerarRelatorio(tipo) {
        const errorEl = document.getElementById('gerarError');
        errorEl.classList.add('hidden');

        if (!selectedTalhaoId) {
            errorEl.textContent = 'Selecione um talhão primeiro.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const dados = await apiRequest(`/relatorios/${tipo}/${selectedTalhaoId}`, 'GET');
            RENDERERS[tipo](dados);

            const talhao = talhoes.find((t) => t.id === selectedTalhaoId);
            const { titulo, resumo } = tituloResumoAuto(tipo, dados, talhao ? talhao.nome : 'Talhão');

            await apiRequest('/relatorios', 'POST', { talhao_id: selectedTalhaoId, tipo, titulo, dados, resumo });
            await loadRelatoriosSalvos();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }

    // ----------------------------------------------------------------------
    // Visualizar / excluir relatório salvo
    // ----------------------------------------------------------------------
    window.visualizarRelatorio = async function (id) {
        try {
            const data = await apiRequest(`/relatorios/${id}`, 'GET');
            const relatorio = data.relatorio;
            const dados = typeof relatorio.dados === 'string' ? JSON.parse(relatorio.dados) : relatorio.dados;
            RENDERERS[relatorio.tipo](dados);
        } catch (err) {
            alert('Não foi possível abrir este relatório: ' + err.message);
        }
    };

    window.exportarPdfSalvo = async function (id) {
        await window.visualizarRelatorio(id);
        window.print();
    };

    window.excluirRelatorio = async function (id) {
        if (!confirm('Excluir este relatório salvo? Essa ação não pode ser desfeita.')) return;
        try {
            await apiRequest(`/relatorios/${id}`, 'DELETE');
            await loadRelatoriosSalvos();
        } catch (err) {
            alert('Não foi possível excluir: ' + err.message);
        }
    };

    // ----------------------------------------------------------------------
    // Lista de relatórios salvos + filtros
    // ----------------------------------------------------------------------
    function renderRelatoriosSalvos() {
        const loading = document.getElementById('salvosLoading');
        const empty = document.getElementById('salvosEmpty');
        const list = document.getElementById('salvosList');
        loading.classList.add('hidden');

        const filtroTipo = document.getElementById('filtroTipo').value;
        const filtroTalhao = document.getElementById('filtroTalhao').value;

        const filtrados = relatoriosSalvos.filter((r) =>
            (!filtroTipo || r.tipo === filtroTipo) &&
            (!filtroTalhao || String(r.talhao_id) === filtroTalhao)
        );

        if (filtrados.length === 0) {
            empty.classList.remove('hidden');
            empty.textContent = relatoriosSalvos.length === 0
                ? 'Nenhum relatório gerado ainda. Selecione um talhão acima e gere seu primeiro relatório.'
                : 'Nenhum relatório encontrado para esse filtro.';
            list.classList.add('hidden');
            list.innerHTML = '';
            return;
        }

        empty.classList.add('hidden');
        list.classList.remove('hidden');
        list.innerHTML = filtrados.map((r) => {
            return `
                <div class="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-semibold text-slate-900 truncate">${escapeHtml(r.titulo)}</span>
                        </div>
                        <p class="text-xs text-slate-500">${escapeHtml(r.talhao_nome)} · ${formatDate(r.data_geracao)}</p>
                        ${r.resumo ? `<p class="text-sm text-slate-600 mt-1">${escapeHtml(r.resumo)}</p>` : ''}
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button type="button" onclick="visualizarRelatorio(${r.id})" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 transition-colors">Visualizar</button>
                        <button type="button" onclick="exportarPdfSalvo(${r.id})" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 transition-colors">PDF</button>
                        <button type="button" onclick="excluirRelatorio(${r.id})" class="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">Excluir</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function loadRelatoriosSalvos() {
        try {
            const data = await apiRequest('/relatorios', 'GET');
            relatoriosSalvos = data.relatorios || [];
            renderRelatoriosSalvos();
        } catch (err) {
            console.warn('Não foi possível carregar relatórios salvos:', err.message);
            document.getElementById('salvosLoading').textContent = 'Não foi possível carregar seus relatórios agora.';
        }
    }

    // ----------------------------------------------------------------------
    // Talhões
    // ----------------------------------------------------------------------
    async function loadTalhoes() {
        const loading = document.getElementById('talhoesLoading');
        const empty = document.getElementById('talhoesEmpty');
        const content = document.getElementById('talhoesContent');

        try {
            const data = await apiRequest('/talhoes', 'GET');
            talhoes = data.talhoes || [];
            loading.classList.add('hidden');

            if (talhoes.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            content.classList.remove('hidden');

            const talhaoSelect = document.getElementById('talhaoSelect');
            talhaoSelect.innerHTML = talhoes.map((t) => `<option value="${t.id}">${escapeHtml(t.nome)}${t.area_ha != null ? ' — ' + t.area_ha + ' ha' : ''}</option>`).join('');
            selectedTalhaoId = talhoes[0].id;
            talhaoSelect.addEventListener('change', () => { selectedTalhaoId = Number(talhaoSelect.value); });

            const filtroTalhao = document.getElementById('filtroTalhao');
            talhoes.forEach((t) => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.nome;
                filtroTalhao.appendChild(opt);
            });
        } catch (err) {
            loading.textContent = 'Não foi possível carregar seus talhões agora. Verifique sua conexão e tente novamente.';
            console.warn('Erro ao carregar talhões:', err.message);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.gerar-btn').forEach((btn) => {
            btn.addEventListener('click', () => gerarRelatorio(btn.dataset.tipo));
        });
        document.getElementById('filtroTipo').addEventListener('change', renderRelatoriosSalvos);
        document.getElementById('filtroTalhao').addEventListener('change', renderRelatoriosSalvos);
        document.getElementById('gerarLaudoBtn').addEventListener('click', gerarLaudo);

        loadTalhoes();
        loadRelatoriosSalvos();

        if (new URLSearchParams(window.location.search).get('laudo') === 'last') {
            gerarLaudo();
        }
    });
})();
