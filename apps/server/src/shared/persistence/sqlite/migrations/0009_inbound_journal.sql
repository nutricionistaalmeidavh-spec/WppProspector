-- Ingress durável antes do HTTP 200: message.id é único.
CREATE TABLE inbound_journal (
  message_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','stored')),
  received_at TEXT NOT NULL,
  stored_at TEXT
);
CREATE INDEX inbound_journal_unstored ON inbound_journal(state,received_at);
