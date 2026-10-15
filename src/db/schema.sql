-- MergeMind Database Schema

-- PR Review Records
CREATE TABLE IF NOT EXISTS pr_reviews (
  id              BIGSERIAL PRIMARY KEY,
  pr_number       INTEGER NOT NULL,
  repo_owner      TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  head_sha        TEXT NOT NULL,
  base_sha        TEXT NOT NULL,
  overall_risk    TEXT NOT NULL,
  status          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pr_reviews_repo_pr_idx ON pr_reviews (repo_owner, repo_name, pr_number);
CREATE INDEX IF NOT EXISTS pr_reviews_head_sha_idx ON pr_reviews (head_sha);

-- Individual Findings per Review
CREATE TABLE IF NOT EXISTS review_findings (
  id                BIGSERIAL PRIMARY KEY,
  review_id         BIGINT REFERENCES pr_reviews(id) ON DELETE CASCADE,
  finding_id        TEXT NOT NULL,
  agent             TEXT NOT NULL,
  file              TEXT NOT NULL,
  line              INTEGER NOT NULL,
  severity          TEXT NOT NULL,
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  vulnerable_code   TEXT,
  recommendation    TEXT,
  verified          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_findings_review_id_idx ON review_findings (review_id);
CREATE INDEX IF NOT EXISTS review_findings_severity_idx ON review_findings (severity);

-- Granular Agent Execution Logs
CREATE TABLE IF NOT EXISTS agent_logs (
  id              BIGSERIAL PRIMARY KEY,
  review_id       BIGINT,
  role            TEXT NOT NULL,
  model           TEXT NOT NULL,
  batch_id        TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  duration_ms     INTEGER NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_logs_role_idx ON agent_logs (role);
CREATE INDEX IF NOT EXISTS agent_logs_timestamp_idx ON agent_logs (timestamp DESC);

-- Durable Job Queue for Webhook Processing
CREATE TABLE IF NOT EXISTS review_jobs (
  id              BIGSERIAL PRIMARY KEY,
  delivery_id     TEXT UNIQUE NOT NULL,
  repo_owner      TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  pr_number       INTEGER NOT NULL,
  head_sha        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_jobs_status_idx ON review_jobs (status, created_at);
