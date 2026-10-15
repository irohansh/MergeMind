import type { AIProvider } from '../providers/aiProvider.js';
import { StyleAgentOutputSchema, type StyleAgentOutput, type Batch } from './schemas.js';
import { wrapUntrustedContent } from '../security/promptInjection.js';
import { STYLE_SYSTEM_PROMPT } from '../prompts/style.js';

export class StyleAgent {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async reviewBatch(
    batch: Batch,
    fileDiffs: Array<{ filename: string; diff: string }>,
    prTitle: string
  ): Promise<StyleAgentOutput> {
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

    const prompt = `Review the assigned diffs for TypeScript strictness, naming, architectural readability, and include specific praise.
Input Payload:
${JSON.stringify(payload, null, 2)}

Respond with valid JSON matching the StyleAgentOutput schema only.`;

    const response = await this.provider.generateStructured(
      {
        systemInstruction: STYLE_SYSTEM_PROMPT,
        prompt,
        role: 'style',
      },
      StyleAgentOutputSchema
    );

    return response.parsed;
  }
}
