-- Editor de configuração com publicação explícita e histórico auditável.
CREATE TABLE IF NOT EXISTS business_profile_draft (
  id INTEGER PRIMARY KEY CHECK(id=1),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_profile_revisions (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  data_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_ai_pending (
  id INTEGER PRIMARY KEY CHECK(id=1),
  provider TEXT NOT NULL CHECK(provider IN ('rules','anthropic','openai','compatible')),
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_local_llm (
  id INTEGER PRIMARY KEY CHECK(id=1),
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL
);
-- Expande apenas a seleção; a tabela de segredos comerciais mantém o CHECK antigo.
CREATE TABLE business_ai_selection_v17 (
  id INTEGER PRIMARY KEY CHECK(id=1),
  provider TEXT NOT NULL CHECK(provider IN ('rules','anthropic','openai','compatible')),
  updated_at TEXT NOT NULL
);
INSERT INTO business_ai_selection_v17 SELECT id,provider,updated_at FROM business_ai_selection;
DROP TABLE business_ai_selection;
ALTER TABLE business_ai_selection_v17 RENAME TO business_ai_selection;
-- A chave Shopify é cifrada; apenas o servidor pode recuperá-la.
CREATE TABLE IF NOT EXISTS business_shopify (
  id INTEGER PRIMARY KEY CHECK(id=1),
  domain TEXT NOT NULL,
  key_cipher TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_commerce_products (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('manual','shopify')),
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  stock INTEGER,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_business_commerce_products_source
  ON business_commerce_products(source,name);
CREATE TABLE IF NOT EXISTS business_commerce_orders (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  order_number TEXT NOT NULL,
  financial_status TEXT NOT NULL,
  fulfillment_status TEXT NOT NULL,
  total TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_commerce_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
INSERT OR IGNORE INTO business_commerce_state(id,enabled) VALUES(1,0);
