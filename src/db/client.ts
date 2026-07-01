import pg from 'pg';

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

export function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export async function insertAgentLog(log: {
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
    `INSERT INTO agent_logs (role, model, batch_id, input_tokens, output_tokens, duration_ms, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [log.role, log.model, log.batch_id, log.input_tokens, log.output_tokens, log.duration_ms, log.timestamp]
  );
}
