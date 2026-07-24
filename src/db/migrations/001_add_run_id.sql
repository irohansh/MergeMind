-- Migration 001: add run_id to agent_logs for per-run segmentation.
-- Safe to run against an existing database. Existing rows predate run
-- segmentation, so they are backfilled with a sentinel value before the
-- NOT NULL constraint is applied.

ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS run_id TEXT;

UPDATE agent_logs SET run_id = 'legacy-unknown' WHERE run_id IS NULL;

ALTER TABLE agent_logs ALTER COLUMN run_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS agent_logs_run_id_idx ON agent_logs (run_id);
