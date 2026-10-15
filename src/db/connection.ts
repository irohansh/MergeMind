import pg from 'pg';
import { getConfig } from '../config/env.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;
let isConnected = false;

export function getDatabasePool(): InstanceType<typeof Pool> | null {
  const config = getConfig();
  if (!config.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn(`[postgres-warn] Unexpected error on idle client: ${err.message}`);
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const p = getDatabasePool();
  if (!p) return false;

  try {
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    isConnected = true;
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`[postgres-warn] Could not reach database: ${(err as Error).message}`);
    return false;
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
  }
}
