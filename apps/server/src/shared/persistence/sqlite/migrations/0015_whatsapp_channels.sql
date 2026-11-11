-- Canais Meta são opcionais, independentes do core local e das conversas canônicas.
-- Tokens ficam cifrados; nunca migrar segredos para o painel ou arquivos de build.
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id TEXT PRIMARY KEY,
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  token_cipher TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_one_active_meta ON whatsapp_channels(active) WHERE active=1;
