-- Histórico de versões dos módulos de regras e IA sem armazenar segredos em claro.
CREATE TABLE IF NOT EXISTS business_settings_revisions (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('rules','engine')),
  snapshot_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_business_settings_revisions_kind
  ON business_settings_revisions(kind,revision DESC);
