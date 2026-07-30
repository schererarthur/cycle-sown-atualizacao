// ============================================================================
// Pool de conexões com o MySQL.
//
// Em vez de abrir uma conexão nova a cada consulta, usamos um "pool":
// um grupo de conexões já abertas que ficam disponíveis para reuso. Isso é
// bem mais rápido e evita esgotar o limite de conexões do MySQL quando
// várias requisições chegam ao mesmo tempo.
//
// Toda a configuração (host, usuário, senha, etc.) vem do arquivo .env —
// nunca deixe essas informações escritas direto no código.
// ============================================================================

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10, // no máximo 10 conexões abertas ao mesmo tempo
    queueLimit: 0        // sem limite de requisições esperando na fila
});

module.exports = pool;
