import 'dotenv/config';
import { getAIProvider } from './providers/index.js';
import { ReviewOrchestrator } from './orchestrator/reviewOrchestrator.js';
import { ReviewRepository } from './db/repositories/reviewRepository.js';
import { FindingsRepository } from './db/repositories/findingsRepository.js';
import { getConfig } from './config/env.js';

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
  filesChanged: 1,
  additions: 14,
  deletions: 0,
  baseBranch: 'main',
};

async function main() {
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const config = getConfig();

  console.log('='.repeat(70));
  console.log(`MergeMind Agentic PR Reviewer (Provider: ${isDryRun ? 'MockAIProvider [dry-run]' : config.AI_PROVIDER})`);
  console.log('='.repeat(70) + '\n');

  const provider = getAIProvider();
  const orchestrator = new ReviewOrchestrator(provider);

  const startWall = Date.now();
  const result = await orchestrator.runReview({
    diffText: prDiff,
    metadata: prContext,
  });
  const totalWall = Date.now() - startWall;

  console.log('\n--- State Machine Transitions ---');
  for (const t of result.stateHistory) {
    console.log(`[state] ${t.from} -> ${t.to} (${t.timestamp.slice(11, 19)})`);
  }

  console.log('\n--- Evidence Verification Results ---');
  console.log(`Verified Security Findings: ${result.verifiedSecurityFindings.length}`);
  for (const sf of result.verifiedSecurityFindings) {
    console.log(`  - [${sf.severity}] ${sf.title} (line ${sf.line}) [${sf.verification_notes}]`);
  }
  console.log(`Verified Logic Findings   : ${result.verifiedLogicFindings.length}`);
  for (const lf of result.verifiedLogicFindings) {
    console.log(`  - [${lf.severity}] ${lf.title} (line ${lf.line}) [${lf.verification_notes}]`);
  }
  console.log(`Verified Style Findings   : ${result.verifiedStyleFindings.length}`);

  console.log('\n--- Synthesised PR Review Comment ---\n');
  console.log(result.markdownReview);

  console.log('\n--- Operational & Budget Metrics ---');
  console.log(`Prompt Tokens     : ${result.metrics.totalUsage.promptTokens}`);
  console.log(`Completion Tokens : ${result.metrics.totalUsage.completionTokens}`);
  console.log(`Total Tokens      : ${result.metrics.totalUsage.totalTokens}`);
  console.log(`Cost (USD)        : $${result.metrics.costUsd.toFixed(6)} (Max: $${result.metrics.maxBudgetUsd})`);
  console.log(`Wall Latency      : ${(totalWall / 1000).toFixed(2)}s`);

  // Optional DB persistence
  const reviewRepo = new ReviewRepository();
  const findingsRepo = new FindingsRepository();
  const reviewId = await reviewRepo.saveReview({
    prNumber: 42,
    repoOwner: 'demo-org',
    repoName: 'sample-repo',
    headSha: 'abc1234',
    baseSha: 'main',
    overallRisk: result.plannerPlan.overall_risk,
    status: 'COMPLETED',
    summary: result.plannerPlan.pr_summary,
    costUsd: result.metrics.costUsd,
    totalTokens: result.metrics.totalUsage.totalTokens,
  });

  if (reviewId) {
    await findingsRepo.saveFindings(reviewId, 'security', result.verifiedSecurityFindings);
    await findingsRepo.saveFindings(reviewId, 'logic', result.verifiedLogicFindings);
    await findingsRepo.saveFindings(reviewId, 'style', result.verifiedStyleFindings);
    console.log(`\nPersisted review record #${reviewId} to PostgreSQL.`);
  }
}

main().catch(err => {
  console.error('\n[orchestrator-fatal]', err);
  process.exit(1);
});
