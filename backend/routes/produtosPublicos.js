// ============================================================================
// Vitrine PÚBLICA de produtos de insumo (catalogo.html):
//
//   GET /api/produtos?tipo=corretivo&busca=calcario
//
// Lista só produtos ativos (produtos_insumo.ativo = 1) de empresas de
// insumos ativas (empresas.ativo = 1 e tipo = 'insumos'). As rotas de
// rastreamento (POST /api/produtos/:id/...) ficam em routes/produtoEventos.js,
// montado no mesmo caminho — os dois routers convivem porque um só tem GET
// e o outro só tem POST.
//
// SEGURANÇA — da empresa, só sai o que é público numa vitrine: nome
// fantasia, cidade e UF. Nunca e-mail, CNPJ, telefone, endereço completo
// nem senha_hash: a consulta abaixo escolhe coluna por coluna, sem
// "SELECT *", para que uma coluna nova em `empresas` nunca vaze por
// acidente. Nome, composição e link são textos digitados pelas empresas —
// o frontend os insere com textContent, nunca como HTML.
// ============================================================================

const express = require('express');

const pool = require('../config/db');
const { produtoLeituraRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const TIPOS_PRODUTO = ['corretivo', 'fertilizante', 'substrato', 'defensivo', 'semente', 'inoculante', 'outro'];
const LIMITE_BUSCA = 100;    // caracteres aceitos no ?busca=
const LIMITE_RESULTADOS = 200;

function produtoDaVitrine(row) {
    return {
        id: row.id,
        nome: row.nome,
        composicao: row.composicao,
        tipo: row.tipo,
        linkCompra: row.link_compra, // null = sem link, a vitrine não mostra botão de compra
        empresa: {
            nomeFantasia: row.nome_fantasia,
            cidade: row.cidade,
            estado: row.estado
        }
    };
}

// ----------------------------------------------------------------------------
// GET /api/produtos
// ----------------------------------------------------------------------------
router.get('/', produtoLeituraRateLimiter, async (req, res) => {
    const { tipo, busca } = req.query;

    if (tipo !== undefined && !TIPOS_PRODUTO.includes(tipo)) {
        return res.status(400).json({ error: `Tipo inválido (use ${TIPOS_PRODUTO.join(', ')})` });
    }
    if (busca !== undefined && typeof busca !== 'string') {
        return res.status(400).json({ error: 'Busca inválida' });
    }

    const condicoes = ['p.ativo = 1', 'e.ativo = 1', "e.tipo = 'insumos'"];
    const valores = [];

    if (tipo) {
        condicoes.push('p.tipo = ?');
        valores.push(tipo);
    }

    const termo = (busca || '').trim().slice(0, LIMITE_BUSCA);
    if (termo) {
        // % e _ são curingas do LIKE — escapados para que "50%" procure o
        // texto "50%" de verdade. O termo em si vai como parâmetro (?).
        const escapado = termo.replace(/[\\%_]/g, (ch) => `\\${ch}`);
        condicoes.push('(p.nome LIKE ? OR p.composicao LIKE ?)');
        valores.push(`%${escapado}%`, `%${escapado}%`);
    }

    try {
        // LIMITE_RESULTADOS vai direto no texto: é uma constante do código,
        // e o pool.execute do mysql2 tem problemas conhecidos com LIMIT ?.
        const [rows] = await pool.execute(
            `SELECT p.id, p.nome, p.composicao, p.tipo, p.link_compra,
                    e.nome_fantasia, e.cidade, e.estado
             FROM produtos_insumo p
             JOIN empresas e ON e.id = p.empresa_id
             WHERE ${condicoes.join(' AND ')}
             ORDER BY p.nome ASC
             LIMIT ${LIMITE_RESULTADOS}`,
            valores
        );

        return res.status(200).json({ produtos: rows.map(produtoDaVitrine) });
    } catch (err) {
        console.error('Erro ao listar produtos da vitrine:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
});

module.exports = router;
