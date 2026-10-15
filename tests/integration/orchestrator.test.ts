import { describe, it, expect } from 'vitest';
import { ReviewOrchestrator } from '../../src/orchestrator/reviewOrchestrator.js';
import { MockAIProvider } from '../../src/providers/mockProvider.js';
import { ReviewStateMachine } from '../../src/orchestrator/stateMachine.js';
import { BudgetManager } from '../../src/orchestrator/budgetManager.js';

describe('Orchestrator Integration Tests', () => {
  const sampleDiff = `diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..abcdefg 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,6 +10,14 @@ router.get('/users', async (req, res) => {
   res.json(users);
 });
+router.get('/admin/export', async (req, res) => {
+  const search = req.query.search as string;
+  const result = await db.query(\`SELECT * FROM users WHERE name = '\${search}'\`);
+  res.json(result.rows);
+});
+router.post('/users/bulk-delete', async (req, res) => {
+  await Promise.all(ids.forEach(async id => db.query(...)));
+});
`;

  const prContext = {
    title: 'Add admin endpoints',
    description: 'Admin export and bulk delete',
    author: 'developer',
    baseBranch: 'main',
    filesChanged: 1,
    additions: 12,
    deletions: 0,
  };

  it('completes the full state transition lifecycle', async () => {
    const mockProvider = new MockAIProvider();
    const orchestrator = new ReviewOrchestrator(mockProvider);

    const result = await orchestrator.runReview({
      diffText: sampleDiff,
      metadata: prContext,
    });

    expect(result).toBeDefined();
    expect(result.markdownReview).toContain('CRITICAL');
    expect(result.verifiedSecurityFindings.length).toBeGreaterThan(0);
    expect(result.stateHistory.map(h => h.to)).toContain('COMPLETED');
  });

  it('strictly validates state machine transitions and prevents invalid jumps', () => {
    const sm = new ReviewStateMachine();
    expect(sm.getState()).toBe('INITIALIZING');

    sm.transitionTo('PLANNING');
    expect(sm.getState()).toBe('PLANNING');

    sm.transitionTo('PARALLEL_ANALYSIS');
    expect(sm.getState()).toBe('PARALLEL_ANALYSIS');

    // Invalid transition: jumping directly from PARALLEL_ANALYSIS to PUBLISHING
    expect(() => sm.transitionTo('PUBLISHING')).toThrow(/Invalid state transition/);
  });

  it('stops investigation when budget cap is reached', () => {
    const budget = new BudgetManager(0.005, 2);
    expect(budget.canInvestigateFurther()).toBe(true);

    budget.recordUsage({ promptTokens: 10000, completionTokens: 5000, totalTokens: 15000 }, 0.006);
    expect(budget.isBudgetExceeded()).toBe(true);
    expect(budget.canInvestigateFurther()).toBe(false);
  });
});
