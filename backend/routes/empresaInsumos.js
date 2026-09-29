// ============================================================================
// Área logada das empresas de insumos (dashboard-empresa.html).
//
//   GET    /api/empresa/produtos                      lista os produtos ativos
//   POST   /api/empresa/produtos                      cadastra um produto
//   PUT    /api/empresa/produtos/:id                  edita
//   DELETE /api/empresa/produtos/:id                  remove (soft delete: ativo = 0)
//   GET    /api/empresa/dashboard/resumo?periodo=     números dos cards do painel
//   GET    /api/empresa/dashboard/metricas?periodo=   gráfico diário + ranking
//   (periodo = 7d, 30d ou 90d; sem o parâmetro, vale 30d)
//
// Todas exigem token de empresa de insumos ativa (middleware/empresaInsumosAuth.js).
//
// SEGURANÇA — isolamento entre empresas: toda consulta filtra por
// `empresa_id = req.user.empresaId`, o id que veio DENTRO do token
// (assinado pelo servidor, não dá para falsificar). Nunca lemos empresa_id
// do body, da URL ou da query string. Para o banco, o produto de outra
// empresa simplesmente "não existe": editar/remover devolve 404, sem nem
// revelar se aquele id existe.
//
// Todas as consultas usam pool.execute(): prepared statement de verdade (o
// MySQL recebe o SQL e os valores separadamente). As rotas mais antigas usam
// pool.query() com "?", que também é seguro contra SQL injection (o mysql2
// escapa cada valor), mas monta o texto final da consulta no próprio Node.
//
// MÉTRICAS: só contam produtos ATIVOS — um produto removido sai da lista e
// dos números, para os cards, o gráfico e a tabela sempre baterem entre si.
// Os eventos antigos dele continuam guardados no banco.
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const empresaInsumosAuth = require('../middleware/empresaInsumosAuth');
const { isValidHttpUrl } = require('../utils/validators');

const router = express.Router();

router.use(empresaInsumosAuth);

const TIPOS_PRODUTO = ['corretivo', 'fertilizante', 'substrato', 'defensivo', 'semente', 'inoculante', 'outro'];

// Tamanhos máximos — os mesmos das colunas (migrations/2026-09-28_producao_completa.sql).
// composicao é TEXT, mas limitamos para não aceitar textos gigantes.
const LIMITE_NOME = 150;
const LIMITE_COMPOSICAO = 1000;
const LIMITE_LINK = 500;

const PERIODOS = { '7d': 7, '30d': 30, '90d': 90 };
const PERIODO_PADRAO = '30d';

const ERRO_INTERNO = 'Erro interno. Tente novamente mais tarde.';
const ERRO_NAO_ENCONTRADO = 'Produto não encontrado';

// ----------------------------------------------------------------------------
// Datas do painel — sempre no horário de Brasília.
//
// O Brasil não tem horário de verão desde 2019, então Brasília é UTC-3 o
// ano inteiro. O servidor e o MySQL na nuvem costumam rodar em UTC: sem
// converter, um clique às 22h de Brasília cairia no dia seguinte.
//
// Para não depender do fuso configurado no MySQL, cada dia vira um "número
// do dia": quantos dias se passaram desde 01/01/1970 no horário de Brasília.
// O MySQL faz a mesma conta com UNIX_TIMESTAMP(criado_em), que devolve o
// instante real guardado na coluna TIMESTAMP (sempre em UTC), sem aplicar
// fuso nenhum — por isso o resultado é igual no seu PC e no Railway.
// ----------------------------------------------------------------------------
const SEGUNDOS_POR_DIA = 86400;
const DESLOCAMENTO_BRASILIA = 3 * 60 * 60; // 3 horas (UTC-3), em segundos

function numeroDoDia(epochSegundos) {
    return Math.floor((epochSegundos - DESLOCAMENTO_BRASILIA) / SEGUNDOS_POR_DIA);
}

// Número do dia -> 'AAAA-MM-DD'
function dataDoDia(numeroDia) {
    return new Date(numeroDia * SEGUNDOS_POR_DIA * 1000).toISOString().slice(0, 10);
}

// Janela "últimos N dias", contando hoje (7d = hoje + os 6 dias anteriores).
// Devolve null se o período pedido não for um dos permitidos.
function janelaDoPeriodo(periodoPedido) {
    const periodo = periodoPedido === undefined ? PERIODO_PADRAO : periodoPedido;
    if (typeof periodo !== 'string' || !Object.hasOwn(PERIODOS, periodo)) return null;

    const dias = PERIODOS[periodo];
    const hoje = numeroDoDia(Math.floor(Date.now() / 1000));
    const primeiroDia = hoje - (dias - 1);

    return {
        periodo,
        dias,
        primeiroDia,
        inicio: dataDoDia(primeiroDia),
        fim: dataDoDia(hoje),
        // 00:00 (Brasília) do primeiro dia, em segundos desde 1970. Vai para
        // FROM_UNIXTIME(?) nas consultas e é comparado direto com criado_em —
        // assim o MySQL consegue usar o índice por data.
        inicioEpoch: primeiroDia * SEGUNDOS_POR_DIA + DESLOCAMENTO_BRASILIA
    };
}

function responderPeriodoInvalido(res) {
    return res.status(400).json({ error: `Período inválido (use ${Object.keys(PERIODOS).join(', ')})` });
}

// Conversão = cliques ÷ visualizações, em % com 1 casa decimal. null quando
// não houve visualização (não dá para dividir por zero — o painel mostra "—").
// Pode passar de 100% se a vitrine deixar clicar em comprar sem abrir os
// detalhes do produto antes.
function calcularTaxaConversao(cliques, visualizacoes) {
    if (!visualizacoes) return null;
    return Math.round((cliques / visualizacoes) * 1000) / 10;
}

// ----------------------------------------------------------------------------
// Produtos — helpers
// ----------------------------------------------------------------------------

function produtoPublico(row) {
    return {
        id: row.id,
        nome: row.nome,
        composicao: row.composicao,
        tipo: row.tipo,
        linkCompra: row.link_compra,
        ativo: Boolean(row.ativo),
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em
    };
}

// :id da URL -> inteiro positivo, ou null. Sem essa checagem, "12abc"
// viraria 12 dentro do MySQL (ele converte texto em número sozinho).
function lerId(valor) {
    return /^[1-9]\d{0,9}$/.test(String(valor)) ? Number(valor) : null;
}

async function buscarProduto(id, empresaId) {
    const [rows] = await pool.execute(
        `SELECT id, nome, composicao, tipo, link_compra, ativo, criado_em, atualizado_em
         FROM produtos_insumo
         WHERE id = ? AND empresa_id = ? AND ativo = 1`,
        [id, empresaId]
    );
    return rows[0] || null;
}

// Valida e normaliza os campos de produto vindos do body. No cadastro
// (parcial = false) nome, composição e tipo são obrigatórios; na edição
// (parcial = true) só valida o que veio — o que não veio fica como está.
// Devolve { erro } ou { campos }, com as chaves já nos nomes das colunas.
function validarProduto(body, parcial) {
    const campos = {};
    const veio = (chave) => body[chave] !== undefined;

    if (!parcial || veio('nome')) {
        const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
        if (nome.length < 2) {
            return { erro: 'Informe o nome do produto (mínimo 2 caracteres).' };
        }
        if (nome.length > LIMITE_NOME) {
            return { erro: `O nome do produto pode ter no máximo ${LIMITE_NOME} caracteres.` };
        }
        campos.nome = nome;
    }

    if (!parcial || veio('composicao')) {
        const composicao = typeof body.composicao === 'string' ? body.composicao.trim() : '';
        if (composicao.length < 2) {
            return { erro: 'Informe a composição do produto (ex.: NPK 05-20-20).' };
        }
        if (composicao.length > LIMITE_COMPOSICAO) {
            return { erro: `A composição pode ter no máximo ${LIMITE_COMPOSICAO} caracteres.` };
        }
        campos.composicao = composicao;
    }

    if (!parcial || veio('tipo')) {
        if (!TIPOS_PRODUTO.includes(body.tipo)) {
            return { erro: `Tipo de produto inválido (use ${TIPOS_PRODUTO.join(', ')}).` };
        }
        campos.tipo = body.tipo;
    }

    // Link de compra é opcional: vazio ou null grava NULL — e produto sem
    // link não recebe cliques (routes/produtoEventos.js recusa o clique).
    if (!parcial || veio('linkCompra')) {
        const bruto = body.linkCompra;
        if (bruto !== undefined && bruto !== null && typeof bruto !== 'string') {
            return { erro: 'Link de compra inválido.' };
        }
        const link = typeof bruto === 'string' ? bruto.trim() : '';
        if (link === '') {
            campos.link_compra = null;
        } else if (link.length > LIMITE_LINK) {
            return { erro: `O link de compra pode ter no máximo ${LIMITE_LINK} caracteres.` };
        } else if (!isValidHttpUrl(link)) {
            return { erro: 'Link de compra inválido — use o endereço completo, começando com http:// ou https://.' };
        } else {
            campos.link_compra = link;
        }
    }

    return { campos };
}

// ----------------------------------------------------------------------------
// GET /api/empresa/produtos
// ----------------------------------------------------------------------------
router.get('/produtos', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, nome, composicao, tipo, link_compra, ativo, criado_em, atualizado_em
             FROM produtos_insumo
             WHERE empresa_id = ? AND ativo = 1
             ORDER BY nome ASC`,
            [req.user.empresaId]
        );

        return res.status(200).json({ produtos: rows.map(produtoPublico) });
    } catch (err) {
        console.error('Erro ao listar produtos da empresa:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

// ----------------------------------------------------------------------------
// POST /api/empresa/produtos
// ----------------------------------------------------------------------------
router.post('/produtos', async (req, res) => {
    const { erro, campos } = validarProduto(req.body || {}, false);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    try {
        const [result] = await pool.execute(
            `INSERT INTO produtos_insumo (empresa_id, nome, composicao, tipo, link_compra)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.empresaId, campos.nome, campos.composicao, campos.tipo, campos.link_compra]
        );

        const produto = await buscarProduto(result.insertId, req.user.empresaId);
        return res.status(201).json({ produto: produtoPublico(produto) });
    } catch (err) {
        console.error('Erro ao cadastrar produto:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

// ----------------------------------------------------------------------------
// PUT /api/empresa/produtos/:id
// ----------------------------------------------------------------------------
router.put('/produtos/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) {
        return res.status(404).json({ error: ERRO_NAO_ENCONTRADO });
    }

    const { erro, campos } = validarProduto(req.body || {}, true);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    const colunas = Object.keys(campos);
    if (colunas.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    try {
        // Os NOMES das colunas vêm de validarProduto() (lista fixa no código,
        // nunca do body), então é seguro colocá-los no texto do SQL. Os
        // VALORES vão todos como parâmetros (?).
        // affectedRows conta as linhas que o WHERE encontrou (o mysql2 liga a
        // flag FOUND_ROWS por padrão), mesmo quando os valores novos são
        // iguais aos antigos — então 0 aqui significa mesmo "não é seu / não
        // existe / já foi removido".
        const [result] = await pool.execute(
            `UPDATE produtos_insumo
             SET ${colunas.map((coluna) => `${coluna} = ?`).join(', ')}
             WHERE id = ? AND empresa_id = ? AND ativo = 1`,
            [...colunas.map((coluna) => campos[coluna]), id, req.user.empresaId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: ERRO_NAO_ENCONTRADO });
        }

        const produto = await buscarProduto(id, req.user.empresaId);
        return res.status(200).json({ produto: produtoPublico(produto) });
    } catch (err) {
        console.error('Erro ao editar produto:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

// ----------------------------------------------------------------------------
// DELETE /api/empresa/produtos/:id — soft delete: o produto some do painel e
// da vitrine (ativo = 0), mas a linha e os eventos dela ficam no banco.
// ----------------------------------------------------------------------------
router.delete('/produtos/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) {
        return res.status(404).json({ error: ERRO_NAO_ENCONTRADO });
    }

    try {
        const [result] = await pool.execute(
            'UPDATE produtos_insumo SET ativo = 0 WHERE id = ? AND empresa_id = ? AND ativo = 1',
            [id, req.user.empresaId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: ERRO_NAO_ENCONTRADO });
        }

        return res.status(200).json({ message: 'Produto removido' });
    } catch (err) {
        console.error('Erro ao remover produto:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

// ----------------------------------------------------------------------------
// GET /api/empresa/dashboard/resumo?periodo=30d
// produtosAtivos é o total ATUAL (não depende do período); visualizações,
// cliques e conversão são do período pedido.
// ----------------------------------------------------------------------------
router.get('/dashboard/resumo', async (req, res) => {
    const janela = janelaDoPeriodo(req.query.periodo);
    if (!janela) {
        return responderPeriodoInvalido(res);
    }

    try {
        const [[produtos]] = await pool.execute(
            'SELECT COUNT(*) AS total FROM produtos_insumo WHERE empresa_id = ? AND ativo = 1',
            [req.user.empresaId]
        );

        const [[eventos]] = await pool.execute(
            `SELECT
                COUNT(CASE WHEN e.tipo_evento = 'visualizacao' THEN 1 END) AS visualizacoes,
                COUNT(CASE WHEN e.tipo_evento = 'clique_compra' THEN 1 END) AS cliques
             FROM produto_eventos e
             JOIN produtos_insumo p ON p.id = e.produto_id
             WHERE p.empresa_id = ? AND p.ativo = 1
               AND e.criado_em >= FROM_UNIXTIME(?)`,
            [req.user.empresaId, janela.inicioEpoch]
        );

        const visualizacoes = Number(eventos.visualizacoes);
        const cliques = Number(eventos.cliques);

        return res.status(200).json({
            periodo: janela.periodo,
            inicio: janela.inicio,
            fim: janela.fim,
            produtosAtivos: Number(produtos.total),
            visualizacoes,
            cliques,
            taxaConversao: calcularTaxaConversao(cliques, visualizacoes)
        });
    } catch (err) {
        console.error('Erro ao montar resumo do painel:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

// ----------------------------------------------------------------------------
// GET /api/empresa/dashboard/metricas?periodo=30d
// serie   = um item por dia do período (dias sem evento vêm zerados)
// ranking = todos os produtos ativos, do mais clicado para o menos clicado
// ----------------------------------------------------------------------------
router.get('/dashboard/metricas', async (req, res) => {
    const janela = janelaDoPeriodo(req.query.periodo);
    if (!janela) {
        return responderPeriodoInvalido(res);
    }

    try {
        // 10800 = 3 horas (UTC-3) e 86400 = segundos de um dia: é a mesma
        // conta de numeroDoDia() lá em cima, feita pelo MySQL. DIV = divisão
        // inteira (descarta a parte fracionária).
        const [linhasSerie] = await pool.execute(
            `SELECT (UNIX_TIMESTAMP(e.criado_em) - 10800) DIV 86400 AS dia,
                    e.tipo_evento AS tipoEvento,
                    COUNT(*) AS total
             FROM produto_eventos e
             JOIN produtos_insumo p ON p.id = e.produto_id
             WHERE p.empresa_id = ? AND p.ativo = 1
               AND e.criado_em >= FROM_UNIXTIME(?)
             GROUP BY dia, e.tipo_evento`,
            [req.user.empresaId, janela.inicioEpoch]
        );

        // Monta todos os dias do período já zerados e depois preenche os que
        // tiveram eventos — o gráfico precisa de todos os dias no eixo.
        const serie = [];
        const itemPorDia = new Map();
        for (let dia = janela.primeiroDia; dia < janela.primeiroDia + janela.dias; dia++) {
            const item = { data: dataDoDia(dia), visualizacoes: 0, cliques: 0 };
            serie.push(item);
            itemPorDia.set(dia, item);
        }
        linhasSerie.forEach((linha) => {
            const item = itemPorDia.get(Number(linha.dia));
            if (!item) return;
            if (linha.tipoEvento === 'visualizacao') item.visualizacoes = Number(linha.total);
            if (linha.tipoEvento === 'clique_compra') item.cliques = Number(linha.total);
        });

        // LEFT JOIN: produto que não teve nenhum evento no período também
        // aparece (com zero). O filtro de data fica no ON, não no WHERE —
        // no WHERE ele eliminaria justamente esses produtos sem evento.
        const [linhasRanking] = await pool.execute(
            `SELECT p.id, p.nome, p.tipo,
                    COUNT(CASE WHEN e.tipo_evento = 'visualizacao' THEN 1 END) AS visualizacoes,
                    COUNT(CASE WHEN e.tipo_evento = 'clique_compra' THEN 1 END) AS cliques
             FROM produtos_insumo p
             LEFT JOIN produto_eventos e
                    ON e.produto_id = p.id AND e.criado_em >= FROM_UNIXTIME(?)
             WHERE p.empresa_id = ? AND p.ativo = 1
             GROUP BY p.id, p.nome, p.tipo
             ORDER BY cliques DESC, visualizacoes DESC, p.nome ASC`,
            [janela.inicioEpoch, req.user.empresaId]
        );

        const ranking = linhasRanking.map((linha) => {
            const visualizacoes = Number(linha.visualizacoes);
            const cliques = Number(linha.cliques);
            return {
                produtoId: linha.id,
                nome: linha.nome,
                tipo: linha.tipo,
                visualizacoes,
                cliques,
                taxaConversao: calcularTaxaConversao(cliques, visualizacoes)
            };
        });

        return res.status(200).json({
            periodo: janela.periodo,
            inicio: janela.inicio,
            fim: janela.fim,
            serie,
            ranking
        });
    } catch (err) {
        console.error('Erro ao montar métricas do painel:', err.message);
        return res.status(500).json({ error: ERRO_INTERNO });
    }
});

module.exports = router;
