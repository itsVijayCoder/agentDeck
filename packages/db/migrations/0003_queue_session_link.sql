-- Link browser-created task sessions to durable queue items for Phase 13 local E2E.

PRAGMA foreign_keys = ON;

ALTER TABLE queue_items ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_queue_session ON queue_items(session_id);
