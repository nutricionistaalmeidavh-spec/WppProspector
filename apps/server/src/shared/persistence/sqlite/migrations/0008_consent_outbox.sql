-- P0: autorização explícita de prospecção, supressão e outbox durável.
CREATE TABLE contact_consent (
  phone TEXT PRIMARY KEY,
  granted_at TEXT,
  consent_source TEXT,
  opted_out_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE outbound_jobs (
  operation_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('text','template')),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX outbound_jobs_ready ON outbound_jobs(state, next_attempt_at, created_at);
