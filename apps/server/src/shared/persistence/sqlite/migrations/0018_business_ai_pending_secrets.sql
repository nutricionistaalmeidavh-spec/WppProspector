-- Segredos de IA em rascunho: alterações de chave nunca afetam produção antes de publicar.
CREATE TABLE IF NOT EXISTS business_ai_pending_secrets (
  id INTEGER PRIMARY KEY CHECK(id=1),
  provider TEXT NOT NULL CHECK(provider IN ('anthropic','openai')),
  key_cipher TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL
);
