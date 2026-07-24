import { randomUUID } from 'crypto';
import pLimit from 'p-limit';
import { callAgent } from './lib/callAgent.js';
import type {
  Batch,
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
} from './types/agents.js';

// Partition settled results into successful outputs and the batch_ids that
// failed, so one erroring batch no longer aborts the whole specialist stage.
function collectResults<T>(
  settled: PromiseSettledResult<T>[],
  batches: Batch[],
  failedBatchIds: string[]
): T[] {
  const successes: T[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      const batchId = batches[index]?.batch_id ?? 'unknown';
      failedBatchIds.push(batchId);
      console.warn(`[batch-fail] ${batchId}: ${(result.reason as Error)?.message ?? result.reason}`);
    }
  });
  return successes;
}

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

  // One run_id per pipeline invocation so agent_logs rows can be grouped by run.
  const runId = randomUUID();

  // Step 1: Planner decomposes the diff
  const plan = await callAgent<PlannerOutput>(
    'planner',
    { diff: prDiff, context: prContext },
    'planner',
    runId
  );

  if (plan.error) {
    return `## PR Orchestrator Error\nCould not parse diff: ${plan.error}`;
  }

  // The Planner may return valid JSON that omits one or more batch arrays.
  // Default each to an empty array so we never call .map on undefined.
  const securityBatches = plan.security_batches ?? [];
  const logicBatches = plan.logic_batches ?? [];
  const styleBatches = plan.style_batches ?? [];

  // Step 2: Specialist agents run across their batches under a shared
  // concurrency cap of 2, so a large PR cannot fan out unbounded calls and
  // breach the Anthropic TPM limit. The cap is aggregate across all three roles.
  const limit = pLimit(2);

  // Fan out with allSettled so a single failed batch degrades gracefully rather
  // than rejecting the entire specialist stage. Failed batch_ids are surfaced in
  // the final review instead of destroying it.
  const [securitySettled, logicSettled, styleSettled] = await Promise.all([
    Promise.allSettled(
      securityBatches.map(batch =>
        limit(() =>
          callAgent<SecurityAgentOutput>(
            'security',
            { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
            batch.batch_id,
            runId
          )
        )
      )
    ),
    Promise.allSettled(
      logicBatches.map(batch =>
        limit(() =>
          callAgent<LogicAgentOutput>(
            'logic',
            { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
            batch.batch_id,
            runId
          )
        )
      )
    ),
    Promise.allSettled(
      styleBatches.map(batch =>
        limit(() =>
          callAgent<StyleAgentOutput>(
            'style',
            { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
            batch.batch_id,
            runId
          )
        )
      )
    ),
  ]);

  const failedBatchIds: string[] = [];
  const securityResults = collectResults(securitySettled, securityBatches, failedBatchIds);
  const logicResults = collectResults(logicSettled, logicBatches, failedBatchIds);
  const styleResults = collectResults(styleSettled, styleBatches, failedBatchIds);

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
    'synthesiser',
    runId
  );

  if (failedBatchIds.length === 0) {
    return review;
  }

  // Append a note about batches that could not be analysed so the reviewer
  // knows the review is partial rather than silently dropping coverage.
  const failedList = failedBatchIds.map(id => `- \`${id}\``).join('\n');
  return `${review}\n\n## Batches that failed analysis\n\nThe following batches errored during analysis and are not reflected in the review above:\n\n${failedList}`;
}
