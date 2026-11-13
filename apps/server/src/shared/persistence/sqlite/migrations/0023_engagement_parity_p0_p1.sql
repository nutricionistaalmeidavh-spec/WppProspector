-- P0/P1: atendimento e configuração comercial por instalação. Migração aditiva.
-- Os telefones referenciam leads/conversation_index sem FK porque o índice de chat é reconstruído.
CREATE TABLE crm_conversation_assignments (
 phone TEXT PRIMARY KEY,
 owner_user_id TEXT REFERENCES crm_team_users(id) ON DELETE SET NULL,
 department TEXT NOT NULL DEFAULT 'Geral',
 assigned_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_crm_assignments_owner ON crm_conversation_assignments(owner_user_id);
CREATE INDEX idx_crm_assignments_department ON crm_conversation_assignments(department);
CREATE TABLE crm_assignment_events (
 id TEXT PRIMARY KEY,
 phone TEXT NOT NULL,
 from_user_id TEXT,
 to_user_id TEXT,
 actor_user_id TEXT,
 actor_role TEXT NOT NULL,
 department TEXT NOT NULL,
 occurred_at TEXT NOT NULL
);
CREATE INDEX idx_crm_assignment_history ON crm_assignment_events(phone,occurred_at);
CREATE TABLE crm_labels (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL
);
CREATE TABLE crm_contact_labels (
 phone TEXT NOT NULL,
 label_id TEXT NOT NULL REFERENCES crm_labels(id) ON DELETE CASCADE,
 PRIMARY KEY(phone,label_id)
);
CREATE INDEX idx_crm_labels_phone ON crm_contact_labels(label_id,phone);
CREATE TABLE crm_custom_fields (
 id TEXT PRIMARY KEY,
 entity TEXT NOT NULL CHECK(entity IN ('lead','opportunity')),
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('text','number','date')),
 created_at TEXT NOT NULL,
 UNIQUE(entity,name)
);
CREATE TABLE crm_custom_values (
 entity TEXT NOT NULL CHECK(entity IN ('lead','opportunity')),
 entity_id TEXT NOT NULL,
 field_id TEXT NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(entity,entity_id,field_id)
);
CREATE TABLE crm_pipelines (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE TABLE crm_pipeline_stages (
 id TEXT PRIMARY KEY,
 pipeline_id TEXT NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 base_stage TEXT NOT NULL CHECK(base_stage IN ('new','contacted','replied','qualified','meeting','proposal','negotiation','won','lost')),
 position INTEGER NOT NULL,
 UNIQUE(pipeline_id,name)
);
CREATE INDEX idx_crm_pipeline_stages ON crm_pipeline_stages(pipeline_id,position);
INSERT INTO crm_pipelines(id,name,is_default,created_at)
 VALUES('default','Funil principal',1,'2026-11-13T00:00:00.000Z');
INSERT INTO crm_pipeline_stages(id,pipeline_id,name,base_stage,position) VALUES
 ('default-new','default','Novo','new',0),
 ('default-contacted','default','Contatado','contacted',1),
 ('default-replied','default','Respondeu','replied',2),
 ('default-qualified','default','Qualificado','qualified',3),
 ('default-meeting','default','Reunião / demo','meeting',4),
 ('default-proposal','default','Proposta','proposal',5),
 ('default-negotiation','default','Negociação','negotiation',6),
 ('default-won','default','Ganho','won',7),
 ('default-lost','default','Perdido','lost',8);
ALTER TABLE crm_opportunities ADD COLUMN pipeline_id TEXT REFERENCES crm_pipelines(id);
-- SQLite não aceita REFERENCES com DEFAULT não nulo no ALTER TABLE quando há dados.
-- Instaladores legados ganham o funil padrão pelo backfill, sem reconstrução de tabela.
UPDATE crm_opportunities SET pipeline_id='default' WHERE pipeline_id IS NULL;
ALTER TABLE crm_opportunities ADD COLUMN pipeline_stage_id TEXT REFERENCES crm_pipeline_stages(id);
UPDATE crm_opportunities SET pipeline_stage_id='default-'||stage WHERE pipeline_stage_id IS NULL;
-- Compatibilidade com inserções antigas que omitem o novo par de campos.
CREATE TRIGGER crm_pipeline_legacy_insert AFTER INSERT ON crm_opportunities
WHEN NEW.pipeline_id IS NULL BEGIN
 UPDATE crm_opportunities SET pipeline_id='default',pipeline_stage_id='default-'||NEW.stage WHERE id=NEW.id;
END;
CREATE INDEX idx_crm_opp_pipeline ON crm_opportunities(pipeline_id,pipeline_stage_id);
CREATE TABLE crm_pipeline_events (
 id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
 from_pipeline_id TEXT, from_stage_id TEXT, to_pipeline_id TEXT NOT NULL,
 to_stage_id TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE INDEX idx_crm_pipeline_events ON crm_pipeline_events(opportunity_id,occurred_at);
