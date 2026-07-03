import 'dotenv/config';
import { getPool } from '../db/client.js';

const db = getPool();

const result = await db.query(`
  SELECT role, model, input_tokens, output_tokens, duration_ms, timestamp
  FROM agent_logs
  ORDER BY timestamp DESC
  LIMIT 10
`);

if (result.rows.length === 0) {
  console.log('No rows found in agent_logs.');
} else {
  console.log(`\nLast ${result.rows.length} agent_logs rows:\n`);
  console.table(result.rows);
}

await db.end();
