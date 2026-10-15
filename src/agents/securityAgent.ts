import type { AIProvider } from '../providers/aiProvider.js';
import { SecurityAgentOutputSchema, type SecurityAgentOutput, type Batch } from './schemas.js';
import { wrapUntrustedContent } from '../security/promptInjection.js';
import { SECURITY_SYSTEM_PROMPT } from '../prompts/security.js';

export class SecurityAgent {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async reviewBatch(
    batch: Batch,
    fileDiffs: Array<{ filename: string; diff: string }>,
    prTitle: string
  ): Promise<SecurityAgentOutput> {
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

    const prompt = `Perform an OWASP and Node.js security audit on the assigned files and focus areas.
Input Payload:
${JSON.stringify(payload, null, 2)}

Respond with valid JSON matching the SecurityAgentOutput schema only.`;

    const response = await this.provider.generateStructured(
      {
        systemInstruction: SECURITY_SYSTEM_PROMPT,
        prompt,
        role: 'security',
      },
      SecurityAgentOutputSchema
    );

    return response.parsed;
  }
}
