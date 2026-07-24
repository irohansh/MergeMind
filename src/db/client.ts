import pg from 'pg';
import type { PoolConfig } from 'pg';

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

// Resolve the TLS configuration for the Postgres connection.
//   - DATABASE_CA_CERT (PEM contents) → verify the server against that CA.
//   - DATABASE_SSL_INSECURE=true       → explicit opt-out of verification.
//   - neither                          → default TLS with full verification.
function resolveSsl(): PoolConfig['ssl'] {
  const caCert = process.env.DATABASE_CA_CERT;
  if (caCert) {
    return { ca: caCert, rejectUnauthorized: true };
  }
  if (process.env.DATABASE_SSL_INSECURE === 'true') {
    console.warn(
      '[db-warn] DATABASE_SSL_INSECURE=true — TLS certificate verification is DISABLED. ' +
        'Do not use this outside local development; set DATABASE_CA_CERT instead.'
    );
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const ssl = resolveSsl();
    pool = new Pool(ssl ? { connectionString: url, ssl } : { connectionString: url });
  }
  return pool;
}

export async function insertAgentLog(log: {
  run_id: string;
  role: string;
  model: string;
  batch_id: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  timestamp: string;
}): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO agent_logs (run_id, role, model, batch_id, input_tokens, output_tokens, duration_ms, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [log.run_id, log.role, log.model, log.batch_id, log.input_tokens, log.output_tokens, log.duration_ms, log.timestamp]
  );
}
