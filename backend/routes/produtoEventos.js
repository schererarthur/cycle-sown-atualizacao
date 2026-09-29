// ============================================================================
// Rastreamento PÚBLICO (sem login) das interações com produtos de insumo:
//
//   POST /api/produtos/:id/visualizacao   o produtor abriu "ver detalhes"
//   POST /api/produtos/:id/clique         o produtor clicou para comprar
//
// Chamadas pelas funções de js/rastreamento-produtos.js, sem esperar
// resposta ("fire-and-forget"). Alimentam os números do painel da empresa
// (routes/empresaInsumos.js). Só aceitam produto ativo; clique só é aceito
// em produto que tem link de compra (sem link não existe botão de compra).
//
// PRIVACIDADE: não gravamos IP. Cada evento leva um `sessao_hash`, um
// HMAC-SHA256 (chave TRACKING_SECRET, ver config/tracking.js) de:
//   - "u:<id>"               se vier um token válido de produtor (opcional)
//   - "a:<IP>|<navegador>"   se for visitante anônimo
// O hash só serve para reconhecer "a mesma sessão" de novo; sem a chave,
// não dá para descobrir o IP a partir dele.
//
// CONTRA NÚMEROS INFLADOS, duas camadas:
//   1) aqui, no banco: o mesmo evento, do mesmo produto, pela mesma sessão,
//      não é gravado de novo dentro de 30 minutos;
//   2) produtoEventoRateLimiter (rateLimiter.js): limite geral por IP.
// ============================================================================

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const { TRACKING_SECRET } = require('../config/tracking');
const { produtoEventoRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// :id da URL -> inteiro positivo, ou null (mesma regra de routes/empresaInsumos.js)
function lerId(valor) {
    return /^[1-9]\d{0,9}$/.test(String(valor)) ? Number(valor) : null;
}

// O token de produtor é OPCIONAL nestas rotas: se vier um válido, o evento
// fica associado à conta (usuario_id); se não vier, estiver expirado ou for
// de empresa, seguimos como visitante anônimo. Por isso não usamos o
// authMiddleware aqui — ele responderia 401 e o evento se perderia.
function usuarioIdDoToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    try {
        const payload = jwt.verify(authHeader.slice('Bearer '.length).trim(), process.env.JWT_SECRET);
        if (payload.role === 'empresa') return null;
        return Number.isInteger(payload.userId) && payload.userId > 0 ? payload.userId : null;
    } catch (err) {
        return null;
    }
}

// req.ip só é o IP real do visitante porque o server.js tem
// app.set('trust proxy', 1) — sem isso, atrás do proxy da hospedagem, todo
// mundo teria o IP do proxy e todos os anônimos virariam uma "sessão" só.
function calcularSessaoHash(req, usuarioId) {
    const identidade = usuarioId
        ? `u:${usuarioId}`
        : `a:${req.ip}|${req.headers['user-agent'] || ''}`;
    return crypto.createHmac('sha256', TRACKING_SECRET).update(identidade).digest('hex');
}

async function registrarEvento(req, res, tipoEvento) {
    const produtoId = lerId(req.params.id);
    if (!produtoId) {
        return res.status(404).json({ error: 'Produto não encontrado' });
    }

    try {
        const [produtos] = await pool.execute(
            'SELECT link_compra FROM produtos_insumo WHERE id = ? AND ativo = 1',
            [produtoId]
        );
        const produto = produtos[0];
        if (!produto) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        if (tipoEvento === 'clique_compra' && !produto.link_compra) {
            return res.status(400).json({ error: 'Este produto não tem link de compra' });
        }

        const usuarioId = usuarioIdDoToken(req);
        const sessaoHash = calcularSessaoHash(req, usuarioId);

        // Mesmo evento + mesmo produto + mesma sessão nos últimos 30 min?
        // Então não grava de novo (responde 200 em vez de 201, só para
        // quem estiver depurando saber o que aconteceu). Duas requisições
        // exatamente simultâneas da mesma sessão ainda podem passar as
        // duas — aceitável para uma métrica de painel.
        const [recentes] = await pool.execute(
            `SELECT 1 FROM produto_eventos
             WHERE produto_id = ? AND tipo_evento = ? AND sessao_hash = ?
               AND criado_em >= NOW() - INTERVAL 30 MINUTE
             LIMIT 1`,
            [produtoId, tipoEvento, sessaoHash]
        );
        if (recentes.length > 0) {
            return res.status(200).json({ registrado: false });
        }

        await pool.execute(
            `INSERT INTO produto_eventos (produto_id, tipo_evento, usuario_id, sessao_hash)
             VALUES (?, ?, ?, ?)`,
            [produtoId, tipoEvento, usuarioId, sessaoHash]
        );

        return res.status(201).json({ registrado: true });
    } catch (err) {
        console.error('Erro ao registrar evento de produto:', err.message);
        return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
}

router.post('/:id/visualizacao', produtoEventoRateLimiter, (req, res) => registrarEvento(req, res, 'visualizacao'));
router.post('/:id/clique', produtoEventoRateLimiter, (req, res) => registrarEvento(req, res, 'clique_compra'));

module.exports = router;
