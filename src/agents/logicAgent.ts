import type { AIProvider } from '../providers/aiProvider.js';
import { LogicAgentOutputSchema, type LogicAgentOutput, type Batch } from './schemas.js';
import { wrapUntrustedContent } from '../security/promptInjection.js';
import { LOGIC_SYSTEM_PROMPT } from '../prompts/logic.js';

export class LogicAgent {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async reviewBatch(
    batch: Batch,
    fileDiffs: Array<{ filename: string; diff: string }>,
    prTitle: string
  ): Promise<LogicAgentOutput> {
    const untrustedDiffs = fileDiffs.map(f => ({
      filename: f.filename,
      diff: wrapUntrustedContent(f.diff, `diff_${f.filename}`),
    }));

    const payload = {
      batch_id: batch.batch_id,
      files: untrustedDiffs,
      focus_areas: batch.focus_areas,
      pr_context: { title: prTitle },
    };

    const prompt = `Review the assigned diffs for logic bugs, unhandled promise rejections, null pointers, race conditions, and edge cases.
Input Payload:
${JSON.stringify(payload, null, 2)}

Respond with valid JSON matching the LogicAgentOutput schema only.`;

    const response = await this.provider.generateStructured(
      {
        systemInstruction: LOGIC_SYSTEM_PROMPT,
        prompt,
        role: 'logic',
      },
      LogicAgentOutputSchema
    );

    return response.parsed;
  }
}
