-- P0/P1: aditivo, mantém todos os dados e regras antigos.
ALTER TABLE automation_rules ADD COLUMN event_type TEXT NOT NULL DEFAULT 'message.received';
ALTER TABLE automation_rules ADD COLUMN conditions_json TEXT NOT NULL DEFAULT 'null';

-- A identidade de menu passa a ser (instalação, canal, telefone).
CREATE TABLE IF NOT EXISTS automation_menu_sessions_scoped (
  scope_key TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
INSERT OR IGNORE INTO automation_menu_sessions_scoped(scope_key,rule_id,created_at,expires_at)
SELECT '["default","default","' || replace(phone,'"','') || '"]',rule_id,created_at,expires_at
FROM automation_menu_sessions;

-- Execuções são auditadas sem armazenar texto recebido nem respostas completas.
CREATE TABLE IF NOT EXISTS automation_rule_executions (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES automation_rules(id) ON DELETE SET NULL,
  scope_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('policy','menu','rule')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rule_executions_recent ON automation_rule_executions(occurred_at DESC,id);

-- P2: índice local sem dependência externa, mantido pela tabela canônica.
CREATE VIRTUAL TABLE IF NOT EXISTS business_commerce_fts
  USING fts5(name,sku,content='business_commerce_products',content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS commerce_fts_insert AFTER INSERT ON business_commerce_products BEGIN
  INSERT INTO business_commerce_fts(rowid,name,sku) VALUES(new.rowid,new.name,new.sku);
END;
CREATE TRIGGER IF NOT EXISTS commerce_fts_delete AFTER DELETE ON business_commerce_products BEGIN
  INSERT INTO business_commerce_fts(business_commerce_fts,rowid,name,sku) VALUES('delete',old.rowid,old.name,old.sku);
END;
CREATE TRIGGER IF NOT EXISTS commerce_fts_update AFTER UPDATE ON business_commerce_products BEGIN
  INSERT INTO business_commerce_fts(business_commerce_fts,rowid,name,sku) VALUES('delete',old.rowid,old.name,old.sku);
  INSERT INTO business_commerce_fts(rowid,name,sku) VALUES(new.rowid,new.name,new.sku);
END;
INSERT INTO business_commerce_fts(business_commerce_fts) VALUES('rebuild');
