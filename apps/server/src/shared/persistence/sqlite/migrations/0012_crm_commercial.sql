-- CRM comercial local: migração exclusivamente aditiva; preserva leads, conversas e oportunidades.
-- Não executa mensagens, cobrança, emissão fiscal nem usa serviços externos.
CREATE TABLE crm_customers(
  id TEXT PRIMARY KEY,
  lead_phone TEXT NOT NULL UNIQUE REFERENCES leads(phone) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  company_id TEXT REFERENCES crm_companies(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_crm_customers_company ON crm_customers(company_id);

ALTER TABLE crm_opportunities ADD COLUMN probability_percent REAL NOT NULL DEFAULT 0
  CHECK(probability_percent >= 0 AND probability_percent <= 100);
ALTER TABLE crm_opportunities ADD COLUMN loss_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE crm_quotes(
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL UNIQUE REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES crm_customers(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACCEPTED','REJECTED')),
  created_at TEXT NOT NULL
);
CREATE TABLE crm_quote_items(
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  unit_cents INTEGER NOT NULL CHECK(unit_cents >= 0),
  line_cents INTEGER NOT NULL CHECK(line_cents >= 0)
);
CREATE INDEX idx_crm_quote_items_quote ON crm_quote_items(quote_id);

CREATE TABLE crm_activities(
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('CALL','EMAIL','WHATSAPP','MEETING','TASK')),
  subject TEXT NOT NULL,
  due_at TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DONE')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_crm_activities_due ON crm_activities(status,due_at);
CREATE INDEX idx_crm_activities_opp ON crm_activities(opportunity_id);
