CREATE TABLE IF NOT EXISTS agent_logs (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  model       TEXT        NOT NULL,
  batch_id    TEXT        NOT NULL,
  input_tokens  INTEGER   NOT NULL,
  output_tokens INTEGER   NOT NULL,
  duration_ms   INTEGER   NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_logs_run_id_idx     ON agent_logs (run_id);
CREATE INDEX IF NOT EXISTS agent_logs_role_idx      ON agent_logs (role);
CREATE INDEX IF NOT EXISTS agent_logs_timestamp_idx ON agent_logs (timestamp DESC);
