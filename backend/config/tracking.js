// ============================================================================
// Chave secreta do rastreamento de produtos (routes/produtoEventos.js).
//
// O rastreamento não grava o IP de quem vê ou clica num produto (LGPD).
// Cada evento leva um `sessao_hash`: um HMAC-SHA256 do IP + navegador (ou
// do id do produtor logado) calculado com esta chave. Um hash SEM chave não
// protegeria nada — existem só ~4 bilhões de IPv4, dá para calcular o hash
// de todos e descobrir o IP de volta. Com a chave, só o servidor consegue
// fazer essa conta.
//
// Sem TRACKING_SECRET o servidor NÃO inicia (este arquivo lança um erro no
// momento em que é carregado, ainda na subida do server.js). Não existe
// valor padrão de propósito: um padrão escrito aqui estaria no GitHub,
// visível para qualquer um, e anularia a proteção. A regra vale em qualquer
// ambiente, não só em produção — o servidor não tem como saber com certeza
// que está em produção (NODE_ENV nem sempre vem definido na hospedagem).
//
// Para gerar um valor:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ============================================================================

require('dotenv').config();

const TAMANHO_MINIMO = 32;
const TRACKING_SECRET = (process.env.TRACKING_SECRET || '').trim();

if (TRACKING_SECRET.length < TAMANHO_MINIMO) {
    throw new Error(
        `TRACKING_SECRET não definida ou com menos de ${TAMANHO_MINIMO} caracteres. ` +
        'Cadastre essa variável de ambiente antes de iniciar o servidor (modelo em backend/.env.example).'
    );
}

module.exports = { TRACKING_SECRET };
