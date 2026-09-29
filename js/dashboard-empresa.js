// ============================================================================
// dashboard-empresa.js — lógica do Painel da Empresa de Insumos
// (dashboard-empresa.html). Conversa com backend/routes/empresaInsumos.js:
//   GET /api/empresa/dashboard/resumo?periodo=     números dos cards
//   GET /api/empresa/dashboard/metricas?periodo=   gráfico + números da tabela
//   GET/POST/PUT/DELETE /api/empresa/produtos      lista e modal de produto
//
// A sessão da empresa fica no localStorage (cycleSownEmpresaToken /
// cycleSownEmpresa, salvas por js/empresa-auth.js no login). A guarda no
// <head> da página já barrou quem não tem sessão de empresa de insumos;
// aqui, qualquer 401/403 da API (token expirou, empresa desativada...)
// também leva de volta ao login.
// ============================================================================

(function () {
    const API_BASE_URL = '/api';
    const CHAVE_TOKEN = 'cycleSownEmpresaToken';
    const CHAVE_EMPRESA = 'cycleSownEmpresa';

    const TIPOS_PRODUTO = {
        corretivo: 'Corretivo',
        fertilizante: 'Fertilizante',
        substrato: 'Substrato',
        defensivo: 'Defensivo',
        semente: 'Semente',
        inoculante: 'Inoculante',
        outro: 'Outro'
    };

    const PERIODOS = { '7d': 7, '30d': 30, '90d': 90 };

    // Cores das duas linhas do gráfico. Visualização -> clique é um funil
    // (o clique é a etapa mais funda), então as duas usam o MESMO verde da
    // marca em dois tons, o mais escuro para a etapa mais valiosa. Paleta
    // conferida com um validador de cores (tom único, claridade crescente,
    // contraste mínimo de 2:1 no fundo branco). Como o verde claro fica abaixo
    // de 3:1, a tabela "Ver dados do gráfico" traz os mesmos números em texto.
    const COR_VISUALIZACOES = '#5dc135';
    const COR_CLIQUES = '#066a04';

    // Tons neutros do gráfico (os mesmos do gráfico de produtividade.html)
    const COR_TEXTO_EIXO = '#52514e';
    const COR_GRADE = '#e1e0d9';
    const COR_LINHA_BASE = '#c3c2b7';

    const ICONE_LINK_EXTERNO = '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>';
    const ICONE_AVISO = '<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>';

    const estado = {
        periodo: '30d',
        produtos: null,       // lista de GET /produtos (null = ainda não carregou)
        resumo: null,         // resposta de GET /dashboard/resumo
        metricas: null,       // resposta de GET /dashboard/metricas
        editandoId: null,     // produto aberto no modal (null = cadastro novo)
        ultimaCargaPainel: 0  // descarta respostas antigas se o período mudar no meio
    };

    let grafico = null;
    let elementoQueAbriuModal = null;
    let timerFeedback = null;
    let saindoDaPagina = false; // já redirecionando para o login

    const $ = (id) => document.getElementById(id);

    // ------------------------------------------------------------------
    // Sessão e API
    // ------------------------------------------------------------------

    function lerEmpresa() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_EMPRESA) || 'null');
        } catch (err) {
            return null;
        }
    }

    // Vai para o login UMA vez só: o painel faz requisições em paralelo, e
    // se todas receberem 401 juntas, cada redirecionamento novo cancelaria
    // o anterior no meio do caminho.
    function irParaLogin(apagarSessao) {
        if (saindoDaPagina) return;
        saindoDaPagina = true;
        if (apagarSessao) {
            localStorage.removeItem(CHAVE_TOKEN);
            localStorage.removeItem(CHAVE_EMPRESA);
        }
        window.location.replace('empresa-login.html');
    }

    function sair() {
        irParaLogin(true);
    }

    // Mesmo papel do apiRequest das outras páginas (relatorios.js etc.), mas
    // com o token de EMPRESA e tratando sessão inválida: 401 (token expirado,
    // empresa desativada) apaga a sessão e volta ao login; 403 (conta que não
    // é de insumos) só volta ao login.
    async function apiEmpresa(path, method = 'GET', body = null) {
        const headers = { Authorization: `Bearer ${localStorage.getItem(CHAVE_TOKEN) || ''}` };
        if (body !== null) headers['Content-Type'] = 'application/json';

        let response;
        try {
            response = await fetch(`${API_BASE_URL}${path}`, {
                method,
                headers,
                body: body !== null ? JSON.stringify(body) : undefined
            });
        } catch (networkError) {
            throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
        }

        if (response.status === 401) {
            irParaLogin(true);
            throw new Error('Sua sessão expirou. Entre novamente.');
        }
        if (response.status === 403) {
            irParaLogin(false);
            throw new Error('Acesso não permitido para esta conta.');
        }

        let data = null;
        try {
            data = await response.json();
        } catch (parseError) {
            data = null;
        }

        if (!response.ok) {
            throw new Error((data && data.error) || 'Ocorreu um erro. Tente novamente.');
        }
        return data;
    }

    // ------------------------------------------------------------------
    // Formatação
    // ------------------------------------------------------------------

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatarNumero(n) {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
        return Number(n).toLocaleString('pt-BR');
    }

    // Nos cards, a partir de 10 mil o número fica compacto ("12,9 mil").
    function formatarNumeroCard(n) {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
        const valor = Number(n);
        return valor >= 10000
            ? valor.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
            : valor.toLocaleString('pt-BR');
    }

    function formatarTaxa(taxa) {
        if (taxa === null || taxa === undefined) return '—';
        return `${Number(taxa).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }

    // 'AAAA-MM-DD' -> 'DD/MM/AAAA'. Sem new Date() de propósito: ele leria a
    // data como meia-noite UTC e, no fuso do Brasil, mostraria o dia anterior.
    function formatarData(iso) {
        const [ano, mes, dia] = String(iso).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function formatarDiaCurto(iso) {
        const [, mes, dia] = String(iso).split('-');
        return `${dia}/${mes}`;
    }

    function textoDoPeriodo() {
        return `nos últimos ${PERIODOS[estado.periodo]} dias`;
    }

    // Mesma regra do backend (utils/validators.js → isValidHttpUrl): só
    // http/https, com domínio de verdade e sem usuário/senha embutidos.
    function linkSeguro(link) {
        if (typeof link !== 'string' || !link.trim()) return null;
        try {
            const url = new URL(link.trim());
            const valido = (url.protocol === 'http:' || url.protocol === 'https:')
                && url.hostname.includes('.')
                && !url.username && !url.password;
            return valido ? url.href : null;
        } catch (err) {
            return null;
        }
    }

    // Aceita "loja.com.br/produto" e completa com https:// (o backend só
    // aceita o endereço completo). Não mexe no que já tem esquema
    // ("https:", "javascript:"...) — esses a validação aceita ou recusa.
    // O (?!\d) evita confundir "loja.com.br:8080" (porta) com um esquema.
    function normalizarLink(valor) {
        const texto = valor.trim();
        if (!texto) return '';
        return /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(texto) ? texto : `https://${texto}`;
    }

    // ------------------------------------------------------------------
    // Período, cards e gráfico
    // ------------------------------------------------------------------

    function marcarBotaoDoPeriodo() {
        document.querySelectorAll('.periodo-btn').forEach((btn) => {
            btn.setAttribute('aria-pressed', String(btn.dataset.periodo === estado.periodo));
        });
    }

    function atualizarTextosDoPeriodo() {
        marcarBotaoDoPeriodo();
        document.querySelectorAll('[data-texto-periodo]').forEach((el) => {
            el.textContent = textoDoPeriodo();
        });
        const r = estado.resumo;
        const intervalo = r ? ` · ${formatarData(r.inicio)} a ${formatarData(r.fim)}` : '';
        $('periodoTexto').textContent = `Últimos ${PERIODOS[estado.periodo]} dias${intervalo}`;
    }

    function renderCards() {
        const r = estado.resumo;
        $('cardProdutos').textContent = r ? formatarNumeroCard(r.produtosAtivos) : '—';
        $('cardVisualizacoes').textContent = r ? formatarNumeroCard(r.visualizacoes) : '—';
        $('cardCliques').textContent = r ? formatarNumeroCard(r.cliques) : '—';
        $('cardConversao').textContent = r ? formatarTaxa(r.taxaConversao) : '—';
        $('cardConversaoNota').textContent = r && r.taxaConversao === null
            ? 'sem visualizações no período'
            : 'cliques ÷ visualizações';
    }

    function mostrarMensagemNoGrafico(html) {
        $('grafico').classList.add('invisible');
        const mensagem = $('graficoMensagem');
        mensagem.innerHTML = html;
        mensagem.classList.remove('hidden');
    }

    // Dica (tooltip) do gráfico: o número vem primeiro e em destaque; o nome
    // da série fica ao lado, com um traço na cor da linha.
    function formatarDicaDoGrafico(params) {
        const itens = Array.isArray(params) ? params : [params];
        if (itens.length === 0) return '';
        const linhas = itens.map((item) =>
            '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">' +
                `<span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${item.color}"></span>` +
                `<strong style="color:#0b0b0b">${formatarNumero(item.value)}</strong>` +
                `<span style="color:${COR_TEXTO_EIXO}">${escapeHtml(item.seriesName)}</span>` +
            '</div>'
        ).join('');
        return `<div style="color:${COR_TEXTO_EIXO}">${formatarData(itens[0].axisValue)}</div>${linhas}`;
    }

    function montarOpcoesDoGrafico(serie) {
        const datas = serie.map((d) => d.data);
        const visualizacoes = serie.map((d) => d.visualizacoes);
        const cliques = serie.map((d) => d.cliques);

        // Nome da série escrito no fim de cada linha — só quando cabe. Em tela
        // estreita, ou com as duas linhas terminando quase no mesmo ponto, os
        // nomes se sobreporiam; aí a legenda e a dica identificam as linhas.
        const maximo = Math.max(1, ...visualizacoes, ...cliques);
        const distanciaNoFim = Math.abs(visualizacoes[visualizacoes.length - 1] - cliques[cliques.length - 1]) / maximo;
        const nomesNoFim = window.innerWidth >= 640 && distanciaNoFim >= 0.12;

        // Com 7 dias os pontos aparecem sempre; com 30/90 só ao passar o mouse.
        const mostrarPontos = serie.length <= 7;

        const linha = (nome, nomeCurto, dados, cor) => ({
            name: nome,
            type: 'line',
            data: dados,
            color: cor,
            lineStyle: { width: 2, cap: 'round', join: 'round' },
            symbol: 'circle',
            symbolSize: 10,
            showSymbol: mostrarPontos,
            // Anel branco de 2px em volta dos pontos: continuam legíveis
            // quando cruzam a outra linha.
            itemStyle: { color: cor, borderColor: '#ffffff', borderWidth: 2 },
            emphasis: { focus: 'none', scale: false },
            endLabel: {
                show: nomesNoFim,
                formatter: nomeCurto,
                color: COR_TEXTO_EIXO,
                fontSize: 12,
                distance: 8
            }
        });

        return {
            animationDuration: 300,
            textStyle: { fontFamily: 'Inter, sans-serif' },
            legend: {
                top: 0,
                left: 0,
                icon: 'rect',
                itemWidth: 14,
                itemHeight: 3,
                itemGap: 20,
                textStyle: { color: '#2f3a33', fontSize: 12 }
            },
            grid: { left: 4, right: nomesNoFim ? 100 : 16, top: 40, bottom: 4, containLabel: true },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: COR_LINHA_BASE, width: 1 } },
                backgroundColor: '#ffffff',
                borderColor: 'rgba(11, 11, 11, 0.10)',
                borderWidth: 1,
                padding: [8, 12],
                textStyle: { color: '#0b0b0b', fontSize: 12 },
                formatter: formatarDicaDoGrafico
            },
            xAxis: {
                type: 'category',
                data: datas,
                boundaryGap: false,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: COR_LINHA_BASE } },
                axisLabel: { color: COR_TEXTO_EIXO, formatter: formatarDiaCurto }
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                splitLine: { lineStyle: { color: COR_GRADE, width: 1, type: 'solid' } },
                axisLabel: { color: COR_TEXTO_EIXO, formatter: (valor) => valor.toLocaleString('pt-BR') }
            },
            series: [
                linha('Visualizações', 'Visualizações', visualizacoes, COR_VISUALIZACOES),
                linha('Cliques para compra', 'Cliques', cliques, COR_CLIQUES)
            ]
        };
    }

    // Tabela "Ver dados do gráfico": os mesmos números do gráfico em texto,
    // para leitores de tela e para quem não distingue bem os dois verdes.
    function renderTabelaDoGrafico(mostrar) {
        const wrap = $('graficoTabelaWrap');
        wrap.classList.toggle('hidden', !mostrar);
        if (!mostrar) return;
        $('graficoTabelaCorpo').innerHTML = [...estado.metricas.serie].reverse().map((d) =>
            '<tr class="border-t border-gray-100">' +
                `<td class="px-4 py-2">${formatarData(d.data)}</td>` +
                `<td class="px-4 py-2 text-right">${formatarNumero(d.visualizacoes)}</td>` +
                `<td class="px-4 py-2 text-right">${formatarNumero(d.cliques)}</td>` +
            '</tr>'
        ).join('');
    }

    function renderGrafico() {
        const m = estado.metricas;
        if (!m) return;

        const temEventos = m.serie.some((d) => d.visualizacoes > 0 || d.cliques > 0);
        renderTabelaDoGrafico(temEventos);

        if (!temEventos) {
            const semProdutos = estado.resumo && estado.resumo.produtosAtivos === 0;
            mostrarMensagemNoGrafico(semProdutos
                ? '<p class="text-sm text-gray-500">Cadastre um produto para começar a acompanhar visualizações e cliques.</p>'
                : `<p class="text-sm text-gray-500">Nenhuma visualização ou clique ${textoDoPeriodo()}.</p>`);
            return;
        }

        $('graficoMensagem').classList.add('hidden');
        const area = $('grafico');
        area.classList.remove('invisible');
        if (!grafico) grafico = echarts.init(area);
        grafico.setOption(montarOpcoesDoGrafico(m.serie), true);
        grafico.resize();

        const totalV = m.serie.reduce((soma, d) => soma + d.visualizacoes, 0);
        const totalC = m.serie.reduce((soma, d) => soma + d.cliques, 0);
        area.setAttribute('aria-label',
            `Gráfico de linhas de visualizações e cliques para compra por dia, ${textoDoPeriodo()}: ` +
            `${formatarNumero(totalV)} visualizações e ${formatarNumero(totalC)} cliques no total. ` +
            'Os valores de cada dia estão na tabela logo abaixo do gráfico.');
    }

    // ------------------------------------------------------------------
    // Lista de produtos (tabela em tela grande, cards no celular)
    // ------------------------------------------------------------------

    // Junta cada produto com os números dele no período (ranking de
    // /metricas) e ordena como o ranking: mais clicados primeiro.
    function produtosComMetricas() {
        const ranking = estado.metricas ? estado.metricas.ranking : null;
        const lista = estado.produtos.map((p) => ({ ...p, metricas: null }));
        if (!ranking) return lista; // sem métricas: fica a ordem alfabética da API

        const posicao = new Map(ranking.map((item, i) => [item.produtoId, i]));
        const metricasPorId = new Map(ranking.map((item) => [item.produtoId, item]));
        lista.forEach((p) => { p.metricas = metricasPorId.get(p.id) || null; });
        const fim = ranking.length; // produto recém-criado, ainda fora do ranking, vai para o fim
        return lista.sort((a, b) => (posicao.has(a.id) ? posicao.get(a.id) : fim) - (posicao.has(b.id) ? posicao.get(b.id) : fim));
    }

    function htmlTipo(tipo) {
        return '<span class="inline-block whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full" ' +
            'style="background-color: var(--tint-bg); color: var(--forest-green-dark); border: 1px solid var(--tint-border);">' +
            `${escapeHtml(TIPOS_PRODUTO[tipo] || tipo)}</span>`;
    }

    // Link para a própria empresa conferir a página de compra (não é
    // rastreado — só os cliques dos produtores na vitrine contam), ou o
    // aviso de que o produto está sem link.
    function htmlStatusDoLink(produto) {
        const link = linkSeguro(produto.linkCompra);
        if (link) {
            return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#066a04] hover:underline">Ver página de compra ${ICONE_LINK_EXTERNO}</a>`;
        }
        return `<span class="inline-flex items-center gap-1 text-xs text-amber-700">${ICONE_AVISO}Sem link, não recebe cliques</span>`;
    }

    function htmlAcoes(produto) {
        const nome = escapeHtml(produto.nome);
        return `<button type="button" data-acao="editar" data-id="${produto.id}" aria-label="Editar ${nome}" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#066a04] hover:bg-[#eaf7e2] transition-colors">Editar</button>` +
            `<button type="button" data-acao="remover" data-id="${produto.id}" aria-label="Remover ${nome}" class="ml-1 px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:text-red-700 hover:bg-red-50 transition-colors">Remover</button>`;
    }

    function htmlLinhaTabela(p) {
        const m = p.metricas;
        return '<tr class="border-b border-gray-100 last:border-0 align-top">' +
            `<td class="px-5 py-4"><div class="font-semibold text-gray-900">${escapeHtml(p.nome)}</div><div class="mt-1">${htmlStatusDoLink(p)}</div></td>` +
            `<td class="px-5 py-4">${htmlTipo(p.tipo)}</td>` +
            `<td class="px-5 py-4 text-gray-600 max-w-xs"><span class="line-clamp-2" title="${escapeHtml(p.composicao)}">${escapeHtml(p.composicao)}</span></td>` +
            `<td class="px-5 py-4 text-right tabular-nums">${m ? formatarNumero(m.visualizacoes) : '—'}</td>` +
            `<td class="px-5 py-4 text-right tabular-nums">${m ? formatarNumero(m.cliques) : '—'}</td>` +
            `<td class="px-5 py-4 text-right tabular-nums font-semibold text-gray-900">${m ? formatarTaxa(m.taxaConversao) : '—'}</td>` +
            `<td class="px-5 py-3 text-right whitespace-nowrap">${htmlAcoes(p)}</td>` +
        '</tr>';
    }

    function htmlCardCelular(p) {
        const m = p.metricas;
        const numero = (rotulo, valor) =>
            `<div><dt class="text-xs text-gray-500">${rotulo}</dt><dd class="text-base font-semibold text-gray-900 tabular-nums">${valor}</dd></div>`;
        return '<li class="stat-card rounded-xl p-5">' +
            '<div class="flex items-start justify-between gap-3">' +
                `<div class="min-w-0"><p class="font-semibold text-gray-900">${escapeHtml(p.nome)}</p><div class="mt-1">${htmlStatusDoLink(p)}</div></div>` +
                htmlTipo(p.tipo) +
            '</div>' +
            `<p class="text-sm text-gray-600 mt-3">${escapeHtml(p.composicao)}</p>` +
            '<dl class="grid grid-cols-3 gap-3 mt-4">' +
                numero('Visualizações', m ? formatarNumero(m.visualizacoes) : '—') +
                numero('Cliques', m ? formatarNumero(m.cliques) : '—') +
                numero('Conversão', m ? formatarTaxa(m.taxaConversao) : '—') +
            '</dl>' +
            `<div class="flex justify-end gap-1 mt-4 pt-3 border-t border-gray-100">${htmlAcoes(p)}</div>` +
        '</li>';
    }

    function renderProdutos() {
        if (estado.produtos === null) return; // ainda carregando

        $('produtosCarregando').classList.add('hidden');
        $('produtosErro').classList.add('hidden');

        const itens = produtosComMetricas();
        $('produtosVazio').classList.toggle('hidden', itens.length > 0);
        $('produtosLista').classList.toggle('hidden', itens.length === 0);
        $('produtosTabelaCorpo').innerHTML = itens.map(htmlLinhaTabela).join('');
        $('produtosCards').innerHTML = itens.map(htmlCardCelular).join('');
    }

    // ------------------------------------------------------------------
    // Carregamento
    // ------------------------------------------------------------------

    async function carregarProdutos() {
        try {
            const data = await apiEmpresa('/empresa/produtos');
            estado.produtos = data.produtos;
            renderProdutos();
        } catch (err) {
            if (saindoDaPagina) return;
            if (estado.produtos === null) {
                $('produtosCarregando').classList.add('hidden');
                $('produtosErro').classList.remove('hidden');
            } else {
                mostrarFeedback(`Não foi possível atualizar a lista: ${err.message}`, 'erro');
            }
        }
    }

    // Cards + gráfico + números da tabela, sempre do período selecionado.
    // Ao recarregar, o que já está na tela fica apagado (classe
    // .atualizando) até chegarem os números novos — sem piscar.
    async function carregarPainel() {
        const minhaCarga = ++estado.ultimaCargaPainel;
        const periodo = estado.periodo;
        const blocos = [$('cardsResumo'), $('graficoArea'), $('produtosLista')];
        if (estado.metricas) blocos.forEach((el) => el.classList.add('atualizando'));

        try {
            const [resumo, metricas] = await Promise.all([
                apiEmpresa(`/empresa/dashboard/resumo?periodo=${periodo}`),
                apiEmpresa(`/empresa/dashboard/metricas?periodo=${periodo}`)
            ]);
            if (minhaCarga !== estado.ultimaCargaPainel) return; // já pediram outro período
            estado.resumo = resumo;
            estado.metricas = metricas;
            atualizarTextosDoPeriodo();
            renderCards();
            renderGrafico();
            renderProdutos();
        } catch (err) {
            if (saindoDaPagina || minhaCarga !== estado.ultimaCargaPainel) return;
            if (estado.metricas) {
                // Mantém os números anteriores na tela e volta o seletor
                // para o período deles, para não mostrar números de um
                // período com o rótulo de outro.
                estado.periodo = estado.metricas.periodo;
                marcarBotaoDoPeriodo();
                mostrarFeedback(`Não foi possível atualizar o painel: ${err.message}`, 'erro');
            } else {
                mostrarMensagemNoGrafico(
                    '<p class="text-sm text-gray-600">Não foi possível carregar os dados do painel.</p>' +
                    '<button type="button" data-tentar-painel class="px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Tentar novamente</button>'
                );
            }
        } finally {
            if (minhaCarga === estado.ultimaCargaPainel) {
                blocos.forEach((el) => el.classList.remove('atualizando'));
            }
        }
    }

    function recarregarTudo() {
        return Promise.all([carregarProdutos(), carregarPainel()]);
    }

    function trocarPeriodo(periodo) {
        if (!Object.hasOwn(PERIODOS, periodo) || periodo === estado.periodo) return;
        estado.periodo = periodo;
        marcarBotaoDoPeriodo();
        carregarPainel();
    }

    // ------------------------------------------------------------------
    // Mensagens
    // ------------------------------------------------------------------

    function mostrarFeedback(texto, tipo) {
        const el = $('feedback');
        el.textContent = texto;
        el.className = 'mb-4 rounded-lg px-4 py-3 text-sm border ' + (tipo === 'sucesso'
            ? 'bg-[#eaf7e2] border-[#cdeab8] text-[#043f03]'
            : 'bg-red-50 border-red-200 text-red-700');
        clearTimeout(timerFeedback);
        timerFeedback = setTimeout(() => el.classList.add('hidden'), 5000);
    }

    function mostrarErroDoModal(texto) {
        const el = $('produtoModalErro');
        el.textContent = texto;
        el.classList.remove('hidden');
    }

    function esconderErroDoModal() {
        const el = $('produtoModalErro');
        el.textContent = '';
        el.classList.add('hidden');
    }

    // ------------------------------------------------------------------
    // Modal de cadastro/edição e remoção
    // ------------------------------------------------------------------

    function abrirModal(produto) {
        elementoQueAbriuModal = document.activeElement;
        estado.editandoId = produto ? produto.id : null;

        $('produtoModalTitulo').textContent = produto ? 'Editar produto' : 'Novo produto';
        $('produtoSalvarBtn').textContent = produto ? 'Salvar alterações' : 'Salvar produto';
        $('produtoNome').value = produto ? produto.nome : '';
        $('produtoComposicao').value = produto ? produto.composicao : '';
        $('produtoTipo').value = produto ? produto.tipo : '';
        $('produtoLink').value = produto && produto.linkCompra ? produto.linkCompra : '';
        esconderErroDoModal();

        $('produtoModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        $('produtoNome').focus();
    }

    function fecharModal() {
        $('produtoModal').classList.add('hidden');
        document.body.style.overflow = '';
        estado.editandoId = null;
        // Devolve o foco para quem abriu o modal (se o botão ainda existir —
        // a lista é redesenhada depois de salvar).
        const voltarPara = elementoQueAbriuModal && document.contains(elementoQueAbriuModal)
            ? elementoQueAbriuModal
            : $('novoProdutoBtn');
        voltarPara.focus();
    }

    function validarFormulario(dados) {
        if (dados.nome.length < 2) {
            return { erro: 'Informe o nome do produto (mínimo 2 caracteres).', campo: 'produtoNome' };
        }
        if (dados.composicao.length < 2) {
            return { erro: 'Informe a composição do produto (ex.: NPK 05-20-20).', campo: 'produtoComposicao' };
        }
        if (!Object.hasOwn(TIPOS_PRODUTO, dados.tipo)) {
            return { erro: 'Selecione o tipo do produto.', campo: 'produtoTipo' };
        }
        if (dados.linkCompra && !linkSeguro(dados.linkCompra)) {
            return {
                erro: 'Link de compra inválido — use o endereço da página do produto (ex.: https://www.suaempresa.com.br/produto).',
                campo: 'produtoLink'
            };
        }
        return null;
    }

    async function salvarProduto(event) {
        event.preventDefault();
        esconderErroDoModal();

        const dados = {
            nome: $('produtoNome').value.trim(),
            composicao: $('produtoComposicao').value.trim(),
            tipo: $('produtoTipo').value,
            linkCompra: normalizarLink($('produtoLink').value)
        };

        const problema = validarFormulario(dados);
        if (problema) {
            mostrarErroDoModal(problema.erro);
            $(problema.campo).focus();
            return;
        }

        const editando = estado.editandoId !== null;
        const botao = $('produtoSalvarBtn');
        const textoDoBotao = botao.textContent;
        botao.disabled = true;
        botao.textContent = 'Salvando…';

        try {
            if (editando) {
                await apiEmpresa(`/empresa/produtos/${estado.editandoId}`, 'PUT', dados);
            } else {
                await apiEmpresa('/empresa/produtos', 'POST', dados);
            }
            fecharModal();
            mostrarFeedback(editando ? 'Produto atualizado.' : 'Produto cadastrado.', 'sucesso');
            await recarregarTudo();
        } catch (err) {
            if (!saindoDaPagina) mostrarErroDoModal(err.message);
        } finally {
            botao.disabled = false;
            botao.textContent = textoDoBotao;
        }
    }

    async function removerProduto(id) {
        const produto = (estado.produtos || []).find((p) => p.id === id);
        if (!produto) return;

        const confirmou = confirm(
            `Remover "${produto.nome}"?\n\nEle sai da sua lista, deixa de aparecer para os produtores e sai das métricas do painel.`
        );
        if (!confirmou) return;

        try {
            await apiEmpresa(`/empresa/produtos/${id}`, 'DELETE');
            mostrarFeedback('Produto removido.', 'sucesso');
            await recarregarTudo();
        } catch (err) {
            if (!saindoDaPagina) mostrarFeedback(err.message, 'erro');
        }
    }

    // ------------------------------------------------------------------
    // Início
    // ------------------------------------------------------------------

    function iniciar() {
        const empresa = lerEmpresa();
        const nome = (empresa && (empresa.nomeFantasia || empresa.razaoSocial)) || '';
        $('navEmpresaNome').textContent = nome;
        $('headerEmpresaNome').textContent = nome;

        $('sairBtn').addEventListener('click', sair);

        document.querySelectorAll('.periodo-btn').forEach((btn) => {
            btn.addEventListener('click', () => trocarPeriodo(btn.dataset.periodo));
        });

        $('novoProdutoBtn').addEventListener('click', () => abrirModal(null));
        $('primeiroProdutoBtn').addEventListener('click', () => abrirModal(null));
        $('produtoForm').addEventListener('submit', salvarProduto);
        document.querySelectorAll('[data-fechar-modal]').forEach((el) => el.addEventListener('click', fecharModal));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !$('produtoModal').classList.contains('hidden')) fecharModal();
        });

        // Editar/Remover — um único listener para a tabela e para os cards
        // (os botões são recriados a cada renderização).
        $('produtosLista').addEventListener('click', (event) => {
            const botao = event.target.closest('[data-acao]');
            if (!botao) return;
            const id = Number(botao.dataset.id);
            if (botao.dataset.acao === 'editar') {
                const produto = (estado.produtos || []).find((p) => p.id === id);
                if (produto) abrirModal(produto);
            } else if (botao.dataset.acao === 'remover') {
                removerProduto(id);
            }
        });

        $('produtosTentarDeNovo').addEventListener('click', () => {
            $('produtosErro').classList.add('hidden');
            $('produtosCarregando').classList.remove('hidden');
            carregarProdutos();
        });

        $('graficoMensagem').addEventListener('click', (event) => {
            if (!event.target.closest('[data-tentar-painel]')) return;
            mostrarMensagemNoGrafico('<p class="text-sm text-gray-500">Carregando dados…</p>');
            carregarPainel();
        });

        // O gráfico acompanha a largura da tela (e decide de novo se os
        // nomes cabem no fim das linhas).
        let timerResize = null;
        window.addEventListener('resize', () => {
            clearTimeout(timerResize);
            timerResize = setTimeout(() => { if (grafico) renderGrafico(); }, 150);
        });

        recarregarTudo();
    }

    document.addEventListener('DOMContentLoaded', iniciar);
})();
