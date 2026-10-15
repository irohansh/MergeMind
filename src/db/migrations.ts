import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabasePool } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  const pool = getDatabasePool();
  if (!pool) {
    return { success: false, message: 'DATABASE_URL not set; skipping migrations.' };
  }

  const schemaPath = join(__dirname, 'schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    return { success: true, message: 'Migrations applied successfully.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Migration failed: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

// Standalone execution if invoked directly via `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(res => {
      console.log(`[migration] ${res.message}`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`[migration-error]`, err);
      process.exit(1);
    });
}
