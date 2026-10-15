import { callAgent } from './lib/callAgent.js';
import type {
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
} from './types/agents.js';

interface PRContext {
  title: string;
  description: string;
  author: string;
  files_changed: number;
  additions: number;
  deletions: number;
  base_branch: string;
}

export async function runPRReview(
  prDiff: string,
  prContext: PRContext
): Promise<string> {

  // Step 1: Planner decomposes the diff
  const plan = await callAgent<PlannerOutput>(
    'planner',
    { diff: prDiff, context: prContext },
    'planner'
  );

  if (plan.error) {
    return `## PR Orchestrator Error\nCould not parse diff: ${plan.error}`;
  }

  // Helper to run batch calls with bounded concurrency
  async function mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    async function worker(): Promise<void> {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        results[index] = await fn(items[index]!);
      }
    }

    const workerCount = Math.min(limit, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
  }

  const BATCH_CONCURRENCY = 3;

  // Step 2: Specialist agents run across their batches with bounded concurrency
  const [securityResults, logicResults, styleResults] = await Promise.all([
    mapConcurrent(
      plan.security_batches,
      BATCH_CONCURRENCY,
      batch =>
        callAgent<SecurityAgentOutput>(
          'security',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
    ),
    mapConcurrent(
      plan.logic_batches,
      BATCH_CONCURRENCY,
      batch =>
        callAgent<LogicAgentOutput>(
          'logic',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
    ),
    mapConcurrent(
      plan.style_batches,
      BATCH_CONCURRENCY,
      batch =>
        callAgent<StyleAgentOutput>(
          'style',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
    ),
  ]);

  // Step 3: Synthesiser composes the final GitHub comment
  const review = await callAgent<string>(
    'synthesiser',
    {
      pr_context: prContext,
      planner_summary: plan,
      security_results: securityResults,
      logic_results: logicResults,
      style_results: styleResults,
    },
    'synthesiser'
  );

  return review;
}
