import 'dotenv/config';
import { runPRReview } from './orchestrator.js';

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
`;

const prContext = {
  title: 'Add admin export endpoint',
  description: 'Adds a new endpoint to export user data for admins.',
  author: 'dev-user',
  files_changed: 1,
  additions: 9,
  deletions: 0,
  base_branch: 'main',
};

console.log('Running PR review pipeline...\n');

runPRReview(prDiff, prContext)
  .then(review => {
    console.log('\n--- PR Review ---\n');
    console.log(review);
  })
  .catch(err => {
    console.error('Pipeline error:', err);
    process.exit(1);
  });
