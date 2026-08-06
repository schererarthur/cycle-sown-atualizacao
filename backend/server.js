// ============================================================================
// Ponto de entrada do servidor da Cycle Sown.
//
// Para rodar:  npm install   (uma vez)
//              npm run dev   (com nodemon, reinicia sozinho ao salvar)
//           ou npm start     (sem reinício automático)
// ============================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const talhoesRoutes = require('./routes/talhoes');
const laudoParserRoutes = require('./laudo-parser-route');

const app = express();

// Helmet adiciona vários cabeçalhos HTTP de segurança recomendados
// (ex: impede que o site seja carregado dentro de um <iframe> de outro
// domínio, evita que o navegador "adivinhe" tipos de arquivo, etc).
// crossOriginResourcePolicy precisa ser "cross-origin" porque o frontend
// (Live Server, outra porta/origem) precisa poder ler as respostas desta
// API — com o padrão "same-origin" do Helmet, o navegador bloqueia a
// resposta mesmo com CORS liberado (curl não reproduz esse bloqueio,
// só navegadores aplicam essa política).
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
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

// Todas as rotas de autenticação ficam sob /api/auth/...
app.use('/api/auth', authRoutes);

// Talhões (parcelas) do Mapa de Fertilidade, sob /api/talhoes/...
app.use('/api/talhoes', talhoesRoutes);

// Leitura automática de laudo de solo via IA (POST /api/parse-laudo)
app.use('/api', laudoParserRoutes);

// Rota simples para checar se o servidor está de pé
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Qualquer rota não encontrada cai aqui
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Cycle Sown rodando em http://localhost:${PORT}`);
});
