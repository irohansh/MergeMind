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

  // Step 2: Specialist agents run in parallel across their batches
  const [securityResults, logicResults, styleResults] = await Promise.all([
    Promise.all(
      plan.security_batches.map(batch =>
        callAgent<SecurityAgentOutput>(
          'security',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
      )
    ),
    Promise.all(
      plan.logic_batches.map(batch =>
        callAgent<LogicAgentOutput>(
          'logic',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
      )
    ),
    Promise.all(
      plan.style_batches.map(batch =>
        callAgent<StyleAgentOutput>(
          'style',
          { batch_id: batch.batch_id, files: batch.files, focus_areas: batch.focus_areas, pr_context: prContext },
          batch.batch_id
        )
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
