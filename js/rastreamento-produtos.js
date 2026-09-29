// ============================================================================
// Cycle Sown — rastreamento das interações do produtor com produtos de
// insumo. Funções reutilizáveis para a vitrine de produtos; os números que
// elas geram aparecem no painel da empresa (dashboard-empresa.html).
//
//   registrarVisualizacao(produtoId)   -> POST /api/produtos/:id/visualizacao
//   registrarCliqueCompra(produtoId)   -> POST /api/produtos/:id/clique
//   criarBotaoCompra(produto, opcoes)  -> botão "Comprar" pronto, ou null
//
// ONDE CHAMAR — a vitrine ainda não existe (hoje o catalogo.html mostra
// produtos fixos no código, sem banco). Quando o catálogo passar a listar
// os produtos de `produtos_insumo`:
//   - registrarVisualizacao(produto.id) no clique em "Ver detalhes" — em
//     catalogo.html, dentro de openProductModal();
//   - criarBotaoCompra(produto) para montar o botão de compra (ex.: no
//     modal de detalhes). Ele já registra o clique e abre o link numa aba
//     nova, e devolve null quando o produto não tem link — nesse caso não
//     existe botão de compra:
//         const botao = criarBotaoCompra(produto);
//         if (botao) areaDoBotao.appendChild(botao);
//   - registrarCliqueCompra(produto.id) só se você montar o link de compra
//     na mão, sem criarBotaoCompra().
// Carregue com <script src="js/rastreamento-produtos.js"></script>.
//
// Nada aqui trava a navegação: os registros são "fire-and-forget" (a
// requisição sai e ninguém espera a resposta) e qualquer erro é engolido
// em silêncio — o produtor nunca percebe se o rastreamento falhar.
// ============================================================================

(function (global) {
    const API_BASE_URL = '/api';

    // Token do PRODUTOR (o mesmo de js/auth.js), se houver alguém logado —
    // assim o evento fica associado à conta dele. Sem login o backend
    // registra como visitante anônimo.
    function tokenDoProdutor() {
        try {
            return localStorage.getItem('cycleSownToken');
        } catch (err) {
            return null;
        }
    }

    function enviarEvento(produtoId, rota) {
        const id = Number(produtoId);
        if (!Number.isInteger(id) || id <= 0) return;

        const headers = {};
        const token = tokenDoProdutor();
        if (token) headers.Authorization = `Bearer ${token}`;

        try {
            // Sem await de propósito. keepalive: true deixa a requisição
            // terminar mesmo se a página for fechada ou trocada logo depois.
            fetch(`${API_BASE_URL}/produtos/${id}/${rota}`, { method: 'POST', headers, keepalive: true })
                .catch(() => {});
        } catch (err) {
            // Navegador sem fetch/keepalive: só não registra.
        }
    }

    function registrarVisualizacao(produtoId) {
        enviarEvento(produtoId, 'visualizacao');
    }

    function registrarCliqueCompra(produtoId) {
        enviarEvento(produtoId, 'clique');
    }

    // Mesma regra do backend (utils/validators.js → isValidHttpUrl): só
    // http/https. Repetida aqui porque este texto vira o href do botão, e um
    // `javascript:` ali executaria código no navegador do produtor.
    function linkDeCompraValido(link) {
        if (typeof link !== 'string' || !link.trim()) return false;
        try {
            const url = new URL(link.trim());
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (err) {
            return false;
        }
    }

    // Cria o link-botão "Comprar" de um produto (objeto vindo da API, com id
    // e linkCompra). Devolve null se o produto não tiver link válido — quem
    // chama simplesmente não mostra botão nenhum.
    // opcoes.texto e opcoes.className trocam o texto e as classes padrão.
    function criarBotaoCompra(produto, opcoes = {}) {
        const link = produto && (produto.linkCompra || produto.link_compra);
        if (!produto || !linkDeCompraValido(link)) return null;

        const botao = document.createElement('a');
        botao.href = link.trim();
        botao.target = '_blank';
        // noopener: a aba nova (site da empresa) não ganha acesso a esta
        // página via window.opener.
        botao.rel = 'noopener';
        botao.textContent = opcoes.texto || 'Comprar no site da empresa';
        botao.className = opcoes.className
            || 'inline-flex items-center justify-center px-5 py-3 rounded-lg bg-[#066a04] hover:bg-[#055503] text-white text-sm font-semibold transition-colors';
        // Sem preventDefault: o próprio navegador abre o link, e o registro
        // sai em paralelo.
        botao.addEventListener('click', () => registrarCliqueCompra(produto.id));
        return botao;
    }

    global.registrarVisualizacao = registrarVisualizacao;
    global.registrarCliqueCompra = registrarCliqueCompra;
    global.criarBotaoCompra = criarBotaoCompra;
})(window);
