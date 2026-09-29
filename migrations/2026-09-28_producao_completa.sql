-- =================================================================
-- Migration 2026-09-28 — deixa o banco de PRODUÇÃO (Railway) completo
-- para o sistema de empresas e para o painel da empresa de insumos.
--
-- O QUE ESTE ARQUIVO FAZ (e só isso):
--   1. Cria a tabela `empresas`        (cadastro/login de empresas — routes/empresas.js)
--   2. Cria a tabela `produtos_insumo` (produtos de cada empresa de insumos)
--   3. Cria a tabela `produto_eventos` (visualizações e cliques dos produtores)
--   4. Em `talhoes`: acrescenta as colunas `solo_argila` e `calcario_prnt`,
--      SÓ SE ainda não existirem (entraram no schema.sql em 13/08/2026 e são
--      usadas pelo Mapa de Fertilidade e pela Calculadora de Adubação).
--   5. Em `relatorios.tipo`: acrescenta o valor 'adubacao' à lista, SÓ SE
--      ainda não existir (mesma data; usado pela Calculadora de Adubação).
--
-- O QUE ELE NÃO FAZ: não apaga, não recria e não altera os dados de
-- nenhuma tabela que já existe. Os passos 4 e 5 só mexem na ESTRUTURA
-- (coluna nova vazia / valor novo no fim da lista), com ALGORITHM=INSTANT:
-- o MySQL só atualiza a definição da tabela, sem reescrever as linhas — e,
-- se por algum motivo não conseguir fazer assim, ele PARA com erro em vez
-- de reconstruir a tabela.
--
-- PODE RODAR MAIS DE UMA VEZ: as tabelas usam CREATE TABLE IF NOT EXISTS e
-- os passos 4 e 5 consultam o próprio banco antes de agir. Quando já está
-- tudo certo, cada passo só mostra uma mensagem "nada a fazer".
--
-- COMO RODAR:
--   - Conectado ao MESMO banco em que você rodou o SHOW TABLES (o que está
--     na variável DB_NAME do backend).
--   - O arquivo inteiro de uma vez, numa única conexão — no MySQL Workbench,
--     o botão de raio (Execute). Os passos 4 e 5 usam variáveis de sessão
--     (@sql), que só existem dentro da mesma conexão.
--   - No fim, confira o resultado do SELECT de verificação (último comando).
--
-- CHAVES ESTRANGEIRAS: as 3 tabelas novas só apontam umas para as outras
-- (produtos_insumo -> empresas, produto_eventos -> produtos_insumo), e as
-- referenciadas são criadas aqui mesmo, antes, com o tipo exato que a FK usa:
-- empresas.id é INT (com sinal, igual ao banco local e ao schema.sql) e
-- produtos_insumo.id é INT UNSIGNED.
-- =================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------
-- 1. empresas  (mesma definição do banco local e do schema.sql, seção 12)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  tipo                    ENUM('insumos', 'compradora') NOT NULL,
  razao_social            VARCHAR(255) NOT NULL,
  nome_fantasia           VARCHAR(255) NOT NULL,
  cnpj                    VARCHAR(18) NOT NULL UNIQUE,
  inscricao_estadual      VARCHAR(20),
  email                   VARCHAR(255) NOT NULL UNIQUE,
  telefone                VARCHAR(20) NOT NULL,
  senha_hash              VARCHAR(255) NOT NULL,
  cep                     VARCHAR(10),
  logradouro              VARCHAR(255),
  numero                  VARCHAR(20),
  complemento             VARCHAR(100),
  bairro                  VARCHAR(100),
  cidade                  VARCHAR(100),
  estado                  CHAR(2),
  area_atuacao            TEXT,
  tipos_insumos           JSON,
  culturas_compra         JSON,
  capacidade_recebimento  VARCHAR(100),
  ativo                   BOOLEAN DEFAULT true,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_empresas_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- 2. produtos_insumo  (depende de empresas)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produtos_insumo (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT NOT NULL,                  -- mesmo tipo de empresas.id (INT com sinal)
  nome           VARCHAR(150) NOT NULL,
  composicao     TEXT NOT NULL,                 -- ex.: 'NPK 05-20-20', 'PRNT 90%, CaO 32%, MgO 14%'
  tipo           ENUM('corretivo', 'fertilizante', 'substrato', 'defensivo',
                      'semente', 'inoculante', 'outro') NOT NULL,
  link_compra    VARCHAR(500) NULL,             -- opcional; sem link o produto não recebe cliques
  ativo          BOOLEAN NOT NULL DEFAULT TRUE, -- "remover" no painel = ativo = FALSE (soft delete)
  criado_em      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_produtos_insumo_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE CASCADE,
  INDEX idx_produtos_insumo_empresa (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- 3. produto_eventos  (depende de produtos_insumo)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produto_eventos (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  produto_id   INT UNSIGNED NOT NULL,           -- mesmo tipo de produtos_insumo.id
  tipo_evento  ENUM('visualizacao', 'clique_compra') NOT NULL,
  -- Produtor logado, se houver. Sem chave estrangeira de propósito: o
  -- registro de um evento nunca pode falhar por causa de uma conta de
  -- produtor removida depois de o token ter sido emitido.
  usuario_id   INT UNSIGNED NULL,
  -- HMAC-SHA256 (hex) de "u:<id do produtor>" ou de "IP + navegador" —
  -- nunca o IP puro.
  sessao_hash  VARCHAR(64) NOT NULL,
  criado_em    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_produto_eventos_produto FOREIGN KEY (produto_id)
    REFERENCES produtos_insumo(id) ON DELETE CASCADE,
  INDEX idx_produto_eventos_produto_tipo_data (produto_id, tipo_evento, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- 4. talhoes: colunas solo_argila e calcario_prnt (só se faltarem)
--
-- O MySQL 8 não tem "ADD COLUMN IF NOT EXISTS". Por isso cada passo monta
-- o comando conforme o que o próprio banco responde: se a coluna não
-- existe, @sql vira o ALTER TABLE; se já existe, vira um SELECT que só
-- mostra "nada a fazer". Depois PREPARE/EXECUTE roda o que foi escolhido.
-- As colunas entram no fim da tabela (é o que permite ALGORITHM=INSTANT
-- em qualquer MySQL 8); a ordem das colunas não importa para o código,
-- que sempre usa os nomes.
-- -----------------------------------------------------------------
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'talhoes' AND COLUMN_NAME = 'solo_argila') = 0,
    'ALTER TABLE talhoes ADD COLUMN solo_argila DECIMAL(5,2) DEFAULT NULL, ALGORITHM=INSTANT',
    'SELECT ''talhoes.solo_argila já existe — nada a fazer'' AS resultado'
);
PREPARE passo FROM @sql;
EXECUTE passo;
DEALLOCATE PREPARE passo;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'talhoes' AND COLUMN_NAME = 'calcario_prnt') = 0,
    'ALTER TABLE talhoes ADD COLUMN calcario_prnt DECIMAL(5,2) DEFAULT NULL, ALGORITHM=INSTANT',
    'SELECT ''talhoes.calcario_prnt já existe — nada a fazer'' AS resultado'
);
PREPARE passo FROM @sql;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- -----------------------------------------------------------------
-- 5. relatorios.tipo: valor 'adubacao' (só se faltar)
--
-- Só altera se a coluna estiver EXATAMENTE como o schema.sql a criava
-- antes de 13/08 (os 4 valores antigos, NOT NULL). Aí 'adubacao' entra no
-- FIM da lista: os relatórios já salvos continuam com o mesmo valor. Se a
-- definição for qualquer outra coisa inesperada, não mexe em nada e avisa.
-- -----------------------------------------------------------------
SET @tipo_atual = (SELECT CONCAT(COLUMN_TYPE, '|', IS_NULLABLE)
                     FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'relatorios' AND COLUMN_NAME = 'tipo');
SET @sql = CASE
    WHEN @tipo_atual LIKE '%''adubacao''%'
        THEN 'SELECT ''relatorios.tipo já aceita adubacao — nada a fazer'' AS resultado'
    WHEN @tipo_atual = 'enum(''nutricional'',''recomendacao'',''rotacao'',''produtividade'')|NO'
        THEN 'ALTER TABLE relatorios MODIFY COLUMN tipo ENUM(''nutricional'', ''recomendacao'', ''rotacao'', ''produtividade'', ''adubacao'') NOT NULL, ALGORITHM=INSTANT'
    ELSE 'SELECT ''ATENÇÃO: relatorios.tipo tem uma definição inesperada — nada foi alterado. Envie o resultado de SHOW CREATE TABLE relatorios.'' AS resultado'
END;
PREPARE passo FROM @sql;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- -----------------------------------------------------------------
-- Verificação final — o resultado esperado é:
--   empresas         id              int
--   produto_eventos  produto_id      int unsigned
--   produtos_insumo  empresa_id      int
--   produtos_insumo  id              int unsigned
--   relatorios       tipo            enum('nutricional','recomendacao','rotacao','produtividade','adubacao')
--   talhoes          calcario_prnt   decimal(5,2)
--   talhoes          solo_argila     decimal(5,2)
-- -----------------------------------------------------------------
SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, COLUMN_TYPE AS tipo
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND (   (TABLE_NAME = 'empresas'        AND COLUMN_NAME = 'id')
        OR (TABLE_NAME = 'produtos_insumo' AND COLUMN_NAME IN ('id', 'empresa_id'))
        OR (TABLE_NAME = 'produto_eventos' AND COLUMN_NAME = 'produto_id')
        OR (TABLE_NAME = 'talhoes'         AND COLUMN_NAME IN ('solo_argila', 'calcario_prnt'))
        OR (TABLE_NAME = 'relatorios'      AND COLUMN_NAME = 'tipo'))
 ORDER BY TABLE_NAME, COLUMN_NAME;
