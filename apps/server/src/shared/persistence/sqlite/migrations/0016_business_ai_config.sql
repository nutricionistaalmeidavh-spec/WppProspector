-- Configuração comercial canônica da instalação, sem conteúdo de demonstração.
CREATE TABLE IF NOT EXISTS business_profile (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Chaves cifradas individualmente; somente o backend pode lê-las.
CREATE TABLE IF NOT EXISTS business_ai_settings (
  provider TEXT PRIMARY KEY CHECK(provider IN ('anthropic', 'openai')),
  model TEXT NOT NULL,
  key_cipher TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_ai_selection (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  provider TEXT NOT NULL CHECK(provider IN ('rules', 'anthropic', 'openai')),
  updated_at TEXT NOT NULL
);
