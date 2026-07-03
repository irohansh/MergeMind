import 'dotenv/config';
import { runPRReview } from './orchestrator.js';
import { getSessionMetrics } from './lib/callAgent.js';

const prDiff = `
diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..abcdefg 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -30,6 +30,15 @@ router.get('/users', requireAuth, async (req, res) => {
   res.json(users);
 });

+router.get('/admin/export', async (req, res) => {
+  const search = req.query.search as string;
+  const result = await db.query(\`SELECT * FROM users WHERE name = '\${search}'\`);
+  res.json(result.rows);
+});
+
+router.post('/users/bulk-delete', requireAuth, async (req, res) => {
+  const ids = req.body.ids as string[];
+  await Promise.all(ids.forEach(async (id) => db.query('DELETE FROM users WHERE id = $1', [id])));
+  res.json({ deleted: ids.length });
+});
`;

const prContext = {
  title: 'Add admin export and bulk-delete endpoints',
  description: 'Adds a new endpoint to export user data for admins, and a bulk-delete endpoint for user management.',
  author: 'dev-user',
  files_changed: 1,
  additions: 14,
  deletions: 0,
  base_branch: 'main',
};

console.log('Running PR review pipeline...\n');
const pipelineStart = Date.now();

runPRReview(prDiff, prContext)
  .then(review => {
    const totalWall = Date.now() - pipelineStart;
    console.log('\n--- PR Review ---\n');
    console.log(review);

    const { logs, totals } = getSessionMetrics();

    console.log('\n--- Token Metrics ---\n');
    console.log(
      ['Agent', 'Model', 'Batch', 'Input', 'Output', 'Duration(ms)', 'Cost($)']
        .map(h => h.padEnd(16)).join('')
    );
    console.log('-'.repeat(112));

    for (const log of logs) {
      const pricing = log.model.includes('sonnet')
        ? { input: 3.00, output: 15.00 }
        : { input: 0.80, output: 4.00 };
      const cost = (log.input_tokens / 1_000_000) * pricing.input
                 + (log.output_tokens / 1_000_000) * pricing.output;
      console.log(
        [log.role, log.model, log.batch_id,
         log.input_tokens.toString(), log.output_tokens.toString(),
         log.duration_ms.toString(), `$${cost.toFixed(5)}`]
          .map(v => v.padEnd(16)).join('')
      );
    }

    console.log('-'.repeat(112));
    console.log(
      ['TOTAL', '', '',
       totals.input_tokens.toString(), totals.output_tokens.toString(),
       `${totalWall}ms wall`, `$${totals.cost_usd.toFixed(5)}`]
        .map(v => v.padEnd(16)).join('')
    );

    const haiku = logs.filter(l => l.model.includes('haiku'));
    const sonnet = logs.filter(l => l.model.includes('sonnet'));
    const haikuIn = haiku.reduce((s, l) => s + l.input_tokens, 0);
    const haikuOut = haiku.reduce((s, l) => s + l.output_tokens, 0);
    const sonnetIn = sonnet.reduce((s, l) => s + l.input_tokens, 0);
    const sonnetOut = sonnet.reduce((s, l) => s + l.output_tokens, 0);
    const haikuCost = (haikuIn / 1e6) * 0.80 + (haikuOut / 1e6) * 4.00;
    const sonnetCost = (sonnetIn / 1e6) * 3.00 + (sonnetOut / 1e6) * 15.00;

    console.log('\n--- Cost Breakdown by Model ---\n');
    console.log(`Haiku  (planner + logic + style): ${haikuIn} in + ${haikuOut} out tokens → $${haikuCost.toFixed(5)}`);
    console.log(`Sonnet (security + synthesiser):  ${sonnetIn} in + ${sonnetOut} out tokens → $${sonnetCost.toFixed(5)}`);
    console.log(`\nTotal tokens : ${totals.input_tokens} input + ${totals.output_tokens} output = ${totals.input_tokens + totals.output_tokens} combined`);
    console.log(`Total cost   : $${totals.cost_usd.toFixed(5)}`);
    console.log(`Wall time    : ${(totalWall / 1000).toFixed(1)}s`);
  })
  .catch(err => {
    console.error('Pipeline error:', err);
    process.exit(1);
  });
