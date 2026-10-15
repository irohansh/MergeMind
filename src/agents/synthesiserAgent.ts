import type { AIProvider } from '../providers/aiProvider.js';
import type {
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
} from './schemas.js';
import { SYNTHESISER_SYSTEM_PROMPT } from '../prompts/synthesiser.js';
import type { PRMetadata } from './plannerAgent.js';

export class SynthesiserAgent {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async synthesise(
    metadata: PRMetadata,
    plannerPlan: PlannerOutput,
    securityResults: SecurityAgentOutput[],
    logicResults: LogicAgentOutput[],
    styleResults: StyleAgentOutput[]
  ): Promise<string> {
    const payload = {
      pr_context: {
        title: metadata.title,
        description: metadata.description,
        author: metadata.author,
        files_changed: metadata.filesChanged,
        additions: metadata.additions,
        deletions: metadata.deletions,
        base_branch: metadata.baseBranch,
      },
      planner_summary: {
        pr_summary: plannerPlan.pr_summary,
        overall_risk: plannerPlan.overall_risk,
        total_files_changed: plannerPlan.total_files_changed,
      },
      security_results: securityResults,
      logic_results: logicResults,
      style_results: styleResults,
    };

    const prompt = `Synthesise all verified agent findings into a single GitHub Pull Request review comment.
Payload:
${JSON.stringify(payload, null, 2)}

Produce ONLY the final Markdown review comment adhering strictly to the template.`;

    const response = await this.provider.generateText({
      systemInstruction: SYNTHESISER_SYSTEM_PROMPT,
      prompt,
      role: 'synthesiser',
    });

    return response.raw;
  }
}
