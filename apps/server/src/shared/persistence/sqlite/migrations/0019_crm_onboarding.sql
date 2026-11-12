-- Onboarding por instalação e apresentação individual de usuários, sem serviços externos.
CREATE TABLE onboarding_setup_steps (
  step TEXT PRIMARY KEY CHECK(step IN ('business','crm','whatsapp','rules','review')),
  status TEXT NOT NULL CHECK(status IN ('pending','completed','skipped')),
  updated_at TEXT NOT NULL
);
CREATE TABLE onboarding_tours (
  actor_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','skipped','completed')),
  step_index INTEGER NOT NULL DEFAULT 0 CHECK(step_index BETWEEN 0 AND 6),
  updated_at TEXT NOT NULL
);
CREATE TABLE onboarding_operation_drafts (
  actor_id TEXT PRIMARY KEY,
  lead_phone TEXT REFERENCES leads(phone),
  company_id TEXT REFERENCES crm_companies(id),
  opportunity_id TEXT REFERENCES crm_opportunities(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE onboarding_first_operations (
  id INTEGER PRIMARY KEY CHECK(id=1),
  lead_phone TEXT NOT NULL REFERENCES leads(phone),
  opportunity_id TEXT NOT NULL UNIQUE REFERENCES crm_opportunities(id),
  completed_at TEXT NOT NULL
);

-- Métricas locais de tentativas de operação recusadas por validação (sem PII nem payload).
CREATE TABLE onboarding_validation_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('setup','tour','first_operation')),
  created_at TEXT NOT NULL
);
