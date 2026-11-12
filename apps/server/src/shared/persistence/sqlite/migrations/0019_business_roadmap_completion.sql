-- Versão 19: validação persistente, rascunho de regras e integração neutra de estoque/pedidos.
CREATE TABLE IF NOT EXISTS business_studio_validation (
 scope TEXT PRIMARY KEY CHECK(scope IN ('profile','engine','rules')),
 digest TEXT NOT NULL,
 checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_rule_draft (
 id INTEGER PRIMARY KEY CHECK(id=1),
 rules_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_commerce_integrations (
 id INTEGER PRIMARY KEY CHECK(id=1),
 token_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_sync_at TEXT
);
-- Amplia o enum de origem sem perder SKUs, preços e contagens existentes.
CREATE TABLE business_commerce_products_v19 (
 id TEXT PRIMARY KEY,
 source TEXT NOT NULL CHECK(source IN ('manual','shopify','integration')),
 name TEXT NOT NULL,
 sku TEXT NOT NULL DEFAULT '',
 price TEXT NOT NULL DEFAULT '',
 stock INTEGER,
 synced_at TEXT NOT NULL
);
INSERT INTO business_commerce_products_v19(id,source,name,sku,price,stock,synced_at)
 SELECT id,source,name,sku,price,stock,synced_at FROM business_commerce_products;
DROP TABLE business_commerce_products;
ALTER TABLE business_commerce_products_v19 RENAME TO business_commerce_products;
CREATE INDEX IF NOT EXISTS idx_business_commerce_products_source ON business_commerce_products(source,name);
