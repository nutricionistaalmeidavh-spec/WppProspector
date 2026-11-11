-- Integridade canônica P0. Somente alterações aditivas; preserva snapshots legados.
ALTER TABLE leads ADD COLUMN company_id TEXT REFERENCES crm_companies(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_company_id ON leads(company_id);
-- Migração conservadora: correlaciona nomes apenas quando há exatamente 1 empresa.
UPDATE leads SET company_id=(
 SELECT c.id FROM crm_companies c
 WHERE lower(trim(c.name))=lower(trim(leads.company)) LIMIT 1
) WHERE company_id IS NULL AND trim(coalesce(company,''))<>'' AND (
 SELECT count(*) FROM crm_companies c WHERE lower(trim(c.name))=lower(trim(leads.company))
)=1;
-- Clientes legados já associados por ID, fonte relacional mais forte que texto.
UPDATE leads SET company_id=(
 SELECT customer.company_id FROM crm_customers customer
 WHERE customer.lead_phone=leads.phone LIMIT 1
) WHERE company_id IS NULL AND EXISTS(
 SELECT 1 FROM crm_customers customer
 WHERE customer.lead_phone=leads.phone AND customer.company_id IS NOT NULL
);
-- Uma única empresa em oportunidades históricas permite recuperação sem suposições.
UPDATE leads SET company_id=(
 SELECT min(o.company_id) FROM crm_opportunities o WHERE o.lead_phone=leads.phone
) WHERE company_id IS NULL AND (
 SELECT count(distinct o.company_id) FROM crm_opportunities o WHERE o.lead_phone=leads.phone
)=1;

ALTER TABLE crm_opportunities ADD COLUMN owner_user_id TEXT REFERENCES crm_team_users(id) ON DELETE SET NULL;
ALTER TABLE crm_activities ADD COLUMN owner_user_id TEXT REFERENCES crm_team_users(id) ON DELETE SET NULL;
ALTER TABLE crm_activities ADD COLUMN followup_id TEXT REFERENCES automation_followups(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_crm_activities_followup ON crm_activities(followup_id) WHERE followup_id IS NOT NULL;
CREATE INDEX idx_crm_opps_owner_id ON crm_opportunities(owner_user_id);
CREATE INDEX idx_crm_activities_owner_id ON crm_activities(owner_user_id);
-- Vincula campos livres anteriores ao usuário somente quando nome exato é identificável.
UPDATE crm_opportunities SET owner_user_id=(
 SELECT t.id FROM crm_team_users t WHERE t.username=crm_opportunities.owner COLLATE NOCASE LIMIT 1
) WHERE owner_user_id IS NULL AND trim(owner)<>'';
UPDATE crm_activities SET owner_user_id=(
 SELECT t.id FROM crm_team_users t WHERE t.username=crm_activities.owner COLLATE NOCASE LIMIT 1
) WHERE owner_user_id IS NULL AND trim(owner)<>'';

-- Evidência de campanha, não inferência a partir do status global do lead.
CREATE TABLE crm_campaign_deliveries(
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
 lead_phone TEXT NOT NULL REFERENCES leads(phone) ON DELETE RESTRICT,
 wamid TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('sent','replied','failed')),
 sent_at TEXT,
 replied_at TEXT,
 failed_at TEXT,
 CHECK((status='failed' AND failed_at IS NOT NULL) OR (status IN ('sent','replied') AND wamid IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE INDEX idx_crm_delivery_campaign_status ON crm_campaign_deliveries(campaign_id,status,lead_phone);
CREATE INDEX idx_crm_delivery_lead_status ON crm_campaign_deliveries(lead_phone,status,sent_at);

-- Uma tarefa vinculada ao agendamento passa a concluída quando o envio é registrado.
CREATE TRIGGER crm_activity_followup_sent
AFTER UPDATE OF state ON automation_followups
WHEN NEW.state='sent' AND OLD.state<>'sent'
BEGIN
 UPDATE crm_activities SET status='DONE',completed_at=coalesce(completed_at,NEW.sent_at,NEW.updated_at)
 WHERE followup_id=NEW.id AND status='OPEN';
END;
