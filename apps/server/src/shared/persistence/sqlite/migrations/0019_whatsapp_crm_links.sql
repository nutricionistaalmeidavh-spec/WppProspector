-- Vinculação explícita: uma oportunidade mantém seu lead principal e pode ter outras conversas.
-- Conversas são armazenadas fora do SQL; a existência é validada pela aplicação.
CREATE TABLE IF NOT EXISTS crm_opportunity_conversations (
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  lead_phone TEXT NOT NULL REFERENCES leads(phone) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK(source IN ('manual','suggested')),
  linked_at TEXT NOT NULL,
  PRIMARY KEY (opportunity_id, lead_phone)
);
CREATE INDEX IF NOT EXISTS idx_crm_conversation_links_phone ON crm_opportunity_conversations(lead_phone);

-- Catálogo de contatos sincronizados, distinto dos leads do CRM:
-- importar uma agenda jamais autoriza disparos ou inicia prospecção.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  phone TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK(source IN ('baileys','file')),
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_display_name ON whatsapp_contacts(display_name COLLATE NOCASE);
