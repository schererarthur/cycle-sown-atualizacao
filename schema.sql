-- =================================================================
-- Cycle Sown — proposed MySQL schema
-- Maps the data currently held in localStorage / hardcoded in
-- main.js, calendar.html, catalogo.html and recommendations.html
-- into persistent tables.
--
-- Engine: InnoDB (foreign keys + transactions)
-- Charset: utf8mb4 (accents, emoji used in the UI)
-- =================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS cyclesown
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE cyclesown;

-- =================================================================
-- 1. USERS & PROFILE  (profile.html)
-- =================================================================

-- Atualizado para bater com o backend de autenticação (backend/routes/auth.js):
-- email_verified_at e is_active foram adicionadas via ALTER TABLE em cima do
-- banco que já existia (essas duas colunas não existiam na primeira versão
-- deste schema.sql).
CREATE TABLE users (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(150) NOT NULL DEFAULT 'Agricultor Cycle Sown',
  email               VARCHAR(190) NOT NULL,
  email_verified_at   DATETIME NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  password_hash       VARCHAR(255) NULL,
  phone               VARCHAR(30)  NULL,
  location            VARCHAR(150) NULL,
  bio                 TEXT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Registra cada tentativa de login (sucesso ou falha) — usada pelo
-- backend/middleware/rateLimiter.js para bloquear IPs com muitas falhas.
CREATE TABLE login_attempts (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL,
  user_id       INT UNSIGNED NULL,        -- NULL se o e-mail não existir
  success       TINYINT(1) NOT NULL DEFAULT 0,
  ip_address    VARCHAR(45) NULL,          -- suporta IPv4 e IPv6
  user_agent    VARCHAR(255) NULL,
  attempted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempts_email (email),
  INDEX idx_login_attempts_user (user_id),
  INDEX idx_login_attempts_ip (ip_address)
) ENGINE=InnoDB;

-- Os 3 toggles de "Configurações" em profile.html (hoje nem chegam
-- a ser persistidos no localStorage — este seria o lugar certo).
CREATE TABLE user_settings (
  user_id              INT UNSIGNED PRIMARY KEY,
  email_notifications  TINYINT(1) NOT NULL DEFAULT 1,
  auto_reports          TINYINT(1) NOT NULL DEFAULT 1,
  dark_mode             TINYINT(1) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =================================================================
-- 2. REFERENCE DATA — culturas & nutrientes (main.js: cropDatabase)
-- =================================================================

-- crop_key usa a mesma string já usada no JS ('milho', 'soja', ...)
-- para o backend poder ser um "drop-in" sem remapear IDs.
CREATE TABLE crops (
  crop_key       VARCHAR(30) PRIMARY KEY,
  name           VARCHAR(80) NOT NULL,
  ph_min         DECIMAL(3,1) NULL,   -- NULL = cultura só aparece no
  ph_max         DECIMAL(3,1) NULL,   -- calendário, sem perfil nutricional
  ph_optimal     DECIMAL(3,1) NULL,   -- completo ainda (ver nota abaixo)
  show_in_recommendations TINYINT(1) NOT NULL DEFAULT 0, -- = allowedCropKeys
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE nutrients (
  nutrient_key   VARCHAR(30) PRIMARY KEY,   -- 'nitrogen', 'phosphorus', ...
  name_pt        VARCHAR(60) NOT NULL,      -- 'Nitrogênio (N)'
  unit           VARCHAR(20) NOT NULL,      -- 'ppm', 'cmolc/dm3', '%'
  category       ENUM('macro','micro') NOT NULL
) ENGINE=InnoDB;

-- optimal/range por cultura+nutriente (cropDatabase[crop].nutrients)
CREATE TABLE crop_nutrient_requirements (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  crop_key       VARCHAR(30) NOT NULL,
  nutrient_key   VARCHAR(30) NOT NULL,
  optimal_value  DECIMAL(10,3) NOT NULL,
  range_min      DECIMAL(10,3) NOT NULL,
  range_max      DECIMAL(10,3) NOT NULL,
  UNIQUE KEY uq_crop_nutrient (crop_key, nutrient_key),
  CONSTRAINT fk_cnr_crop FOREIGN KEY (crop_key)
    REFERENCES crops(crop_key) ON DELETE CASCADE,
  CONSTRAINT fk_cnr_nutrient FOREIGN KEY (nutrient_key)
    REFERENCES nutrients(nutrient_key) ON DELETE CASCADE
) ENGINE=InnoDB;

-- pricePerKg (recommendations.html, buildCropCorrectionReport)
CREATE TABLE nutrient_prices (
  nutrient_key   VARCHAR(30) PRIMARY KEY,
  price_per_kg   DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_price_nutrient FOREIGN KEY (nutrient_key)
    REFERENCES nutrients(nutrient_key) ON DELETE CASCADE
) ENGINE=InnoDB;

-- limeFactor (calculatePHCorrection em recommendations.html)
CREATE TABLE soil_type_lime_factors (
  soil_type   VARCHAR(20) PRIMARY KEY,   -- 'clay','loam','sandy','peaty'
  name_pt     VARCHAR(60) NOT NULL,
  factor      DECIMAL(6,2) NOT NULL      -- t/ha de calcário por unidade de pH
) ENGINE=InnoDB;

-- =================================================================
-- 3. SOIL ANALYSIS REPORTS  (index.html -> "Salvar/Gerar Relatório",
--    consumido por relatorio.html, recommendations.html e profile.html)
-- =================================================================

CREATE TABLE soil_reports (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            INT UNSIGNED NOT NULL,
  title              VARCHAR(150) NULL,
  region             VARCHAR(120) NULL,
  state              VARCHAR(2)   NULL,
  soil_type          VARCHAR(120) NULL,
  ph                 DECIMAL(3,1) NULL,
  ph_cacl2           DECIMAL(3,1) NULL,
  organic_matter     DECIMAL(4,1) NULL,
  aluminum           DECIMAL(5,2) NULL,
  potential_acidity  DECIMAL(5,2) NULL,
  sand_content       SMALLINT UNSIGNED NULL,
  silt_content       SMALLINT UNSIGNED NULL,
  clay_content       SMALLINT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reports_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- Substitui os 12 campos soltos de soilData.nutrients por linhas —
-- mais fácil de adicionar um 13º nutriente no futuro sem migração.
CREATE TABLE soil_report_nutrients (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  soil_report_id BIGINT UNSIGNED NOT NULL,
  nutrient_key   VARCHAR(30) NOT NULL,
  value          DECIMAL(10,3) NOT NULL,
  UNIQUE KEY uq_report_nutrient (soil_report_id, nutrient_key),
  CONSTRAINT fk_srn_report FOREIGN KEY (soil_report_id)
    REFERENCES soil_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_srn_nutrient FOREIGN KEY (nutrient_key)
    REFERENCES nutrients(nutrient_key)
) ENGINE=InnoDB;

-- Guarda o resultado de computeCropCompatibility() por cultura,
-- assim relatorio.html/recommendations.html não precisam recalcular
-- a cada carregamento de página (mas o front pode recalcular também
-- se preferir manter o "tempo real" client-side).
CREATE TABLE soil_report_crop_compatibility (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  soil_report_id      BIGINT UNSIGNED NOT NULL,
  crop_key            VARCHAR(30) NOT NULL,
  overall_score       TINYINT UNSIGNED NOT NULL,
  ph_score            TINYINT UNSIGNED NOT NULL,
  nutrient_avg_score  TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_report_crop (soil_report_id, crop_key),
  CONSTRAINT fk_srcc_report FOREIGN KEY (soil_report_id)
    REFERENCES soil_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_srcc_crop FOREIGN KEY (crop_key)
    REFERENCES crops(crop_key)
) ENGINE=InnoDB;

-- =================================================================
-- 4. CROP CORRECTION REPORTS  (recommendations.html ->
--    "Gerar relatório de correção", localStorage.cropCorrectionReports)
-- =================================================================

CREATE TABLE crop_correction_reports (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                INT UNSIGNED NOT NULL,
  soil_report_id         BIGINT UNSIGNED NULL,
  crop_key               VARCHAR(30) NOT NULL,
  title                  VARCHAR(150) NULL,
  soil_ph                DECIMAL(3,1) NULL,
  ph_advice              VARCHAR(255) NULL,
  lime_requirement_t_ha  DECIMAL(6,2) NULL,
  lime_cost              DECIMAL(10,2) NULL,
  total_fertilizer_kg_ha DECIMAL(8,2) NULL,
  total_cost             DECIMAL(10,2) NULL,
  generated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ccr_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ccr_soil_report FOREIGN KEY (soil_report_id)
    REFERENCES soil_reports(id) ON DELETE SET NULL,
  CONSTRAINT fk_ccr_crop FOREIGN KEY (crop_key)
    REFERENCES crops(crop_key),
  INDEX idx_ccr_user (user_id)
) ENGINE=InnoDB;

-- Cada linha de "corrections[]" dentro de buildCropCorrectionReport()
CREATE TABLE crop_correction_report_items (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  correction_report_id  BIGINT UNSIGNED NOT NULL,
  nutrient_key          VARCHAR(30) NOT NULL,
  amount_kg_ha          DECIMAL(8,2) NULL,   -- NULL quando "Não informado"
  priority              ENUM('high','medium') NOT NULL,
  note                  VARCHAR(255) NULL,
  cost                  DECIMAL(10,2) NULL,
  unit_price            DECIMAL(10,2) NULL,
  CONSTRAINT fk_ccri_report FOREIGN KEY (correction_report_id)
    REFERENCES crop_correction_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_ccri_nutrient FOREIGN KEY (nutrient_key)
    REFERENCES nutrients(nutrient_key)
) ENGINE=InnoDB;

-- =================================================================
-- 5. PLANTING CALENDAR  (calendar.html: plantingCalendar)
-- =================================================================

CREATE TABLE planting_calendar_months (
  id        TINYINT UNSIGNED PRIMARY KEY,   -- 1 = Janeiro ... 12 = Dezembro
  name_pt   VARCHAR(20) NOT NULL,
  season    ENUM('spring','summer','autumn','winter') NOT NULL,
  tips      VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE planting_calendar_crops (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  month_id    TINYINT UNSIGNED NOT NULL,
  crop_key    VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_month_crop (month_id, crop_key),
  CONSTRAINT fk_pcc_month FOREIGN KEY (month_id)
    REFERENCES planting_calendar_months(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcc_crop FOREIGN KEY (crop_key)
    REFERENCES crops(crop_key)
) ENGINE=InnoDB;

CREATE TABLE planting_calendar_activities (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  month_id    TINYINT UNSIGNED NOT NULL,
  activity    VARCHAR(150) NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_pca_month FOREIGN KEY (month_id)
    REFERENCES planting_calendar_months(id) ON DELETE CASCADE,
  INDEX idx_pca_month_order (month_id, sort_order)
) ENGINE=InnoDB;

-- =================================================================
-- 6. INPUT CATALOG  (catalogo.html)
-- =================================================================

CREATE TABLE products (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(60) NOT NULL,    -- chave usada no JS (productDetails['calcario-dolomitico'])
  category          VARCHAR(60) NOT NULL,    -- 'Corretivo','Mineral','Fertilizante',...
  name              VARCHAR(150) NOT NULL,
  description       TEXT NULL,
  price             DECIMAL(10,2) NOT NULL,
  unit_description  VARCHAR(30) NOT NULL,    -- '/ 50kg', '/ Litro', ...
  region            ENUM('norte','nordeste','centro-oeste','sudeste','sul') NOT NULL,
  rating            DECIMAL(2,1) NOT NULL DEFAULT 0,
  review_count      INT UNSIGNED NOT NULL DEFAULT 0,  -- redundante com COUNT(product_reviews) — mantido para exibir sem JOIN
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_slug (slug),
  INDEX idx_products_category (category),
  INDEX idx_products_region (region)
) ENGINE=InnoDB;

-- Avaliações de clientes exibidas no modal do produto (catalogo.html:
-- productDetails[x].reviews). "Empresa Fictícia" vendedora é fixa no
-- front-end, por isso não existe uma FK para uma tabela de empresas aqui.
CREATE TABLE product_reviews (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  author_name   VARCHAR(150) NOT NULL,
  stars         TINYINT UNSIGNED NOT NULL,   -- 1 a 5
  reviewed_at   DATE NULL,                    -- data real; front hoje mostra texto relativo ('há 2 semanas')
  comment       TEXT NULL,
  CONSTRAINT fk_product_reviews_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_reviews_product (product_id)
) ENGINE=InnoDB;

-- =================================================================
-- 7. PRODUCTIVITY TRACKING  (produtividade.html)
-- =================================================================

-- Uma linha por safra registrada (ano + cultura + área + colheita).
-- crop_key usa a mesma string de cropDatabase ('milho','soja',...) quando a
-- cultura é uma das conhecidas; para 'outra', crop_key fica NULL e o nome
-- digitado pelo usuário vai em custom_crop_label.
CREATE TABLE productivity_records (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            INT UNSIGNED NOT NULL,
  harvest_year       SMALLINT UNSIGNED NOT NULL,
  crop_key           VARCHAR(30) NULL,        -- NULL quando custom_crop_label é usado
  custom_crop_label  VARCHAR(60) NULL,
  planting_date      DATE NULL,                -- opcional, alimenta o ciclo (dias) do relatório
  harvest_date       DATE NULL,                -- opcional
  area_ha            DECIMAL(10,2) NOT NULL,
  quantity           DECIMAL(12,2) NOT NULL,  -- valor bruto informado, na unidade abaixo
  quantity_unit      ENUM('sacas','toneladas','kg') NOT NULL,
  yield_kg_ha        DECIMAL(10,2) NOT NULL,  -- calculado: quantidade convertida p/ kg / area_ha
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_productivity_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_productivity_crop FOREIGN KEY (crop_key)
    REFERENCES crops(crop_key),
  INDEX idx_productivity_user_year (user_id, harvest_year)
) ENGINE=InnoDB;

-- =================================================================
-- 8. VENDER PRODUÇÃO — diretório de empresas compradoras
--    (empresas/index.html: hoje é um array fixo `companies` no JS;
--    estas tabelas são o "drop-in" para o dia em que isso virar dado
--    dinâmico via API, igual ao que já foi feito para `products`.)
-- =================================================================

CREATE TABLE buying_companies (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  region        ENUM('norte','nordeste','centro-oeste','sudeste','sul') NOT NULL,
  city          VARCHAR(120) NOT NULL,   -- 'Sorriso, MT' etc. (cidade + UF)
  address       VARCHAR(255) NULL,
  founded_year  SMALLINT UNSIGNED NULL,
  rating        DECIMAL(2,1) NOT NULL DEFAULT 0,
  review_count  INT UNSIGNED NOT NULL DEFAULT 0,
  phone         VARCHAR(30) NULL,
  email         VARCHAR(190) NULL,
  history       TEXT NULL,               -- texto "Sobre a empresa" do modal
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_buying_companies_region (region),
  INDEX idx_buying_companies_city (city)
) ENGINE=InnoDB;

-- Culturas que a empresa compra (tags do card/modal). Texto livre em vez
-- de FK para crops.crop_key porque a lista aqui inclui culturas ('Café',
-- 'Arroz', 'Algodão', 'Trigo') que não fazem parte do cropDatabase de
-- análise de solo em main.js.
CREATE TABLE buying_company_crops (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id   INT UNSIGNED NOT NULL,
  crop_label   VARCHAR(60) NOT NULL,
  CONSTRAINT fk_bcc_company FOREIGN KEY (company_id)
    REFERENCES buying_companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_company_crop (company_id, crop_label),
  INDEX idx_bcc_company (company_id)
) ENGINE=InnoDB;

-- Vendedores/contatos listados no modal ("Comprador de Grãos" etc.)
CREATE TABLE buying_company_sellers (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id   INT UNSIGNED NOT NULL,
  name         VARCHAR(150) NOT NULL,
  role         VARCHAR(100) NOT NULL,
  sort_order   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_bcs_company FOREIGN KEY (company_id)
    REFERENCES buying_companies(id) ON DELETE CASCADE,
  INDEX idx_bcs_company (company_id)
) ENGINE=InnoDB;

-- =================================================================
-- 9. MAPA DE FERTILIDADE — talhões (parcelas/glebas) desenhados pelo
--    agricultor sobre a imagem de satélite, com dados de solo e cultura
--    plantada de cada um. `coordenadas` guarda o polígono como array
--    JSON de pares [lat, lng]. `fertilidade_score` (0-100) é calculado
--    no backend a partir de pH/MO/P/K/V% a cada criação/edição.
-- =================================================================

CREATE TABLE talhoes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  nome              VARCHAR(100) NOT NULL,
  coordenadas       JSON NOT NULL,
  area_ha           DECIMAL(10,2) DEFAULT NULL,
  cultura_nome      VARCHAR(100) DEFAULT NULL,
  cultura_estagio   VARCHAR(100) DEFAULT NULL,
  solo_ph           DECIMAL(3,1) DEFAULT NULL,
  solo_mo           DECIMAL(4,2) DEFAULT NULL,
  solo_p            DECIMAL(6,1) DEFAULT NULL,
  solo_k            DECIMAL(6,1) DEFAULT NULL,
  solo_ca           DECIMAL(5,2) DEFAULT NULL,
  solo_mg           DECIMAL(5,2) DEFAULT NULL,
  solo_v            DECIMAL(5,2) DEFAULT NULL,
  solo_ctc          DECIMAL(5,2) DEFAULT NULL,
  solo_al           DECIMAL(5,2) DEFAULT NULL,
  solo_m            DECIMAL(5,2) DEFAULT NULL,
  solo_smp          DECIMAL(3,1) DEFAULT NULL,
  fertilidade_score INT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_talhoes_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_talhoes_user (user_id)
) ENGINE=InnoDB;

-- =================================================================
-- NOTAS / DECISÕES QUE PRECISAM DE CONFIRMAÇÃO — ver mensagem de
-- acompanhamento com a lista de pontos em aberto antes de aplicar.
-- =================================================================
