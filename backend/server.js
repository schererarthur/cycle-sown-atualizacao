// ============================================================================
// Ponto de entrada do servidor da Cycle Sown.
//
// Para rodar:  npm install   (uma vez)
//              npm run dev   (com nodemon, reinicia sozinho ao salvar)
//           ou npm start     (sem reinício automático)
// ============================================================================

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const empresaInsumosRoutes = require('./routes/empresaInsumos');
// Carregar este arquivo já exige TRACKING_SECRET (config/tracking.js): sem
// ela, o servidor para aqui mesmo, na subida, com a mensagem do erro.
const produtoEventosRoutes = require('./routes/produtoEventos');
const produtosPublicosRoutes = require('./routes/produtosPublicos');
const talhoesRoutes = require('./routes/talhoes');
const rotacaoRoutes = require('./routes/rotacao');
const historicoRoutes = require('./routes/historico');
const precosRoutes = require('./routes/precos');
const relatoriosRoutes = require('./routes/relatorios');
const laudoParserRoutes = require('./laudo-parser-route');

const app = express();

// Em produção o app roda atrás do proxy da hospedagem: sem esta linha,
// req.ip seria o IP do proxy para TODO visitante — os limites por IP
// (login, cadastro, rastreamento) bloqueariam todo mundo junto e o hash de
// sessão do rastreamento juntaria todos os anônimos numa pessoa só. O 1 =
// confiar em exatamente 1 proxy à frente do app (o da hospedagem).
app.set('trust proxy', 1);

const fs = require('fs');
const FRONTEND_DIR = path.join(__dirname, 'public');
console.log('__dirname:', __dirname);
console.log('FRONTEND_DIR:', FRONTEND_DIR);
console.log('public/ existe?', fs.existsSync(FRONTEND_DIR));
if (fs.existsSync(FRONTEND_DIR)) {
  console.log('Conteúdo de public/:', fs.readdirSync(FRONTEND_DIR));
}

// Helmet adiciona vários cabeçalhos HTTP de segurança recomendados
// (ex: impede que o site seja carregado dentro de um <iframe> de outro
// domínio, evita que o navegador "adivinhe" tipos de arquivo, etc).
// crossOriginResourcePolicy precisa ser "cross-origin" porque o frontend
// (Live Server, outra porta/origem) precisa poder ler as respostas desta
// API — com o padrão "same-origin" do Helmet, o navegador bloqueia a
// resposta mesmo com CORS liberado (curl não reproduz esse bloqueio,
// só navegadores aplicam essa política).
// contentSecurityPolicy fica desligado porque as páginas HTML do site usam
// script/style inline e atributos onclick — a CSP padrão do Helmet bloquearia
// tudo isso no navegador.
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

// CORS: por padrão, um navegador bloqueia chamadas de um site (frontend)
// para outro endereço (nossa API). Aqui liberamos explicitamente os
// endereços do frontend em desenvolvimento (Live Server do VS Code pode
// abrir tanto em localhost quanto em 127.0.0.1, que contam como origens
// diferentes para o navegador).
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map((origin) => origin.trim());

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Faz o Express entender corpo de requisição em JSON (req.body)
app.use(express.json());

// Serve os arquivos estáticos do frontend (index.html, login.html, css/, js/, img/...)
// que ficam em backend/public/ (cópia usada em produção, porque o Railway só
// faz deploy da pasta backend/). FRONTEND_DIR é declarado logo acima, junto
// com o log de debug.
app.use(express.static(FRONTEND_DIR));

// Todas as rotas de autenticação ficam sob /api/auth/...
app.use('/api/auth', authRoutes);

// Contas de empresa (insumos e compradoras), sob /api/empresas/...
app.use('/api/empresas', empresasRoutes);

// Área logada da empresa de insumos (dashboard-empresa.html), sob /api/empresa/...
app.use('/api/empresa', empresaInsumosRoutes);

// Vitrine pública de produtos (GET /api/produtos, catalogo.html) e
// rastreamento público de visualizações/cliques (POST /api/produtos/:id/...)
app.use('/api/produtos', produtosPublicosRoutes);
app.use('/api/produtos', produtoEventosRoutes);

// Talhões (parcelas) do Mapa de Fertilidade, sob /api/talhoes/...
app.use('/api/talhoes', talhoesRoutes);

// Planejador de Rotação de Culturas, sob /api/rotacao, /api/historico e /api/precos
app.use('/api/rotacao', rotacaoRoutes);
app.use('/api/historico', historicoRoutes);
app.use('/api/precos', precosRoutes);

// Central de Relatórios, sob /api/relatorios
app.use('/api/relatorios', relatoriosRoutes);

// Leitura automática de laudo de solo via IA (POST /api/parse-laudo)
app.use('/api', laudoParserRoutes);

// Rota simples para checar se o servidor está de pé
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Qualquer rota GET que não seja /api/... e não bateu em nenhum arquivo
// estático cai aqui e recebe a página inicial (ex: acessar a raiz do domínio).
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Qualquer rota não encontrada (sobrou só /api/... sem match) cai aqui
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Cycle Sown rodando em http://localhost:${PORT}`);
});
