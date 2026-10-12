CREATE TABLE crm_companies(
 id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
 city TEXT NOT NULL DEFAULT '', segment TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE crm_campaigns(
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','paused','completed')),
 started_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE crm_campaign_members(
 campaign_id TEXT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
 lead_phone TEXT NOT NULL REFERENCES leads(phone) ON DELETE RESTRICT,
 added_at TEXT NOT NULL, PRIMARY KEY(campaign_id,lead_phone)
);
CREATE INDEX idx_crm_campaign_members_lead ON crm_campaign_members(lead_phone);
CREATE TABLE crm_opportunities(
 id TEXT PRIMARY KEY, title TEXT NOT NULL,
 company_id TEXT NOT NULL REFERENCES crm_companies(id) ON DELETE RESTRICT,
 lead_phone TEXT NOT NULL REFERENCES leads(phone) ON DELETE RESTRICT,
 stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','replied','qualified','meeting','proposal','negotiation','won','lost')),
 estimated_cents INTEGER NOT NULL DEFAULT 0 CHECK(estimated_cents>=0),
 owner TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '',
 next_action_at TEXT NOT NULL DEFAULT '', campaign_id TEXT REFERENCES crm_campaigns(id) ON DELETE SET NULL,
 source TEXT NOT NULL DEFAULT '', qualification TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, won_at TEXT
);
CREATE INDEX idx_crm_opps_company ON crm_opportunities(company_id);
CREATE INDEX idx_crm_opps_stage ON crm_opportunities(stage);
CREATE INDEX idx_crm_opps_campaign ON crm_opportunities(campaign_id);
CREATE TABLE crm_stage_events(
 id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
 from_stage TEXT, to_stage TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE INDEX idx_crm_stage_events_opp ON crm_stage_events(opportunity_id,occurred_at);
