import type { AIProvider } from '../providers/aiProvider.js';
import { PlannerOutputSchema, type PlannerOutput } from './schemas.js';
import { wrapUntrustedContent } from '../security/promptInjection.js';
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner.js';

export interface PRMetadata {
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export class PlannerAgent {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async plan(diffText: string, metadata: PRMetadata): Promise<PlannerOutput> {
    const untrustedDiff = wrapUntrustedContent(diffText, 'unified_diff');
    const untrustedMeta = wrapUntrustedContent(
      JSON.stringify({
        title: metadata.title,
        description: metadata.description,
        author: metadata.author,
        base_branch: metadata.baseBranch,
      }),
      'pr_metadata'
    );

    const prompt = `You are decomposing the following Pull Request for specialized review agents.

PR Metadata:
${untrustedMeta}

PR Diff:
${untrustedDiff}

Output ONLY valid JSON matching the specified Planner schema.`;

    const response = await this.provider.generateStructured(
      {
        systemInstruction: PLANNER_SYSTEM_PROMPT,
        prompt,
        role: 'planner',
      },
      PlannerOutputSchema
    );

    return response.parsed;
  }
}
