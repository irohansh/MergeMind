import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { AIProvider, CompletionRequest, CompletionResponse, TokenUsage } from './aiProvider.js';

const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
};

function calculateCost(model: string, usage: TokenUsage): number {
  const rates = GEMINI_PRICING[model] ?? { input: 0.10, output: 0.40 };
  const inputCost = (usage.promptTokens / 1_000_000) * rates.input;
  const outputCost = (usage.completionTokens / 1_000_000) * rates.output;
  return Number((inputCost + outputCost).toFixed(6));
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  // Remove markdown code fences if present
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines[0]?.startsWith('```')) {
      lines.shift();
    }
    if (lines[lines.length - 1]?.startsWith('```')) {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export class GoogleGeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'gemini-2.5-flash') {
    if (!apiKey) {
      throw new Error('GoogleGeminiProvider requires a valid GEMINI_API_KEY');
    }
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  getName(): string {
    return 'GoogleGeminiProvider';
  }

  private async callWithRetry(fn: () => Promise<any>, maxRetries: number = 3): Promise<any> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: unknown) {
        attempt++;
        const status = (err as { status?: number })?.status;
        const message = (err as Error)?.message ?? '';
        const isRateLimit = status === 429 || status === 503 || message.includes('RESOURCE_EXHAUSTED');

        if (isRateLimit && attempt <= maxRetries) {
          const jitter = Math.random() * 500;
          const delayMs = Math.min(1000 * Math.pow(2, attempt) + jitter, 10000);
          console.warn(
            `[gemini-rate-limit] Status ${status ?? 'RATE_LIMITED'}. Retrying in ${Math.round(delayMs)}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise(res => setTimeout(res, delayMs));
          continue;
        }
        throw err;
      }
    }
  }

  async generateText(request: CompletionRequest): Promise<CompletionResponse<string>> {
    const model = request.model || this.defaultModel;
    const start = Date.now();

    const genConfig: Record<string, any> = {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens ?? 4096,
    };
    if (request.systemInstruction) {
      genConfig.systemInstruction = request.systemInstruction;
    }

    const response = await this.callWithRetry(async () => {
      return await this.client.models.generateContent({
        model,
        contents: request.prompt,
        config: genConfig,
      });
    });

    const raw = response.text ?? '';
    const durationMs = Date.now() - start;

    const usage: TokenUsage = {
      promptTokens: response.usageMetadata?.promptTokenCount ?? Math.ceil(request.prompt.length / 4),
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? Math.ceil(raw.length / 4),
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    };
    if (usage.totalTokens === 0) {
      usage.totalTokens = usage.promptTokens + usage.completionTokens;
    }

    const costUsd = calculateCost(model, usage);

    return {
      raw,
      parsed: raw,
      usage,
      model,
      costUsd,
      durationMs,
    };
  }

  async generateStructured<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>
  ): Promise<CompletionResponse<T>> {
    const textResponse = await this.generateText(request);
    const cleaned = cleanJsonString(textResponse.raw);

    try {
      const jsonParsed = JSON.parse(cleaned);
      const validated = schema.parse(jsonParsed);
      return {
        ...textResponse,
        parsed: validated,
      };
    } catch (parseError) {
      // Retry once with error guidance
      const correctivePrompt = `${request.prompt}

---
CRITICAL ERROR: Your previous response failed schema validation.
Error: ${(parseError as Error).message}
Provide ONLY a valid JSON object matching the required schema. No commentary.`;

      const retryResponse = await this.generateText({
        ...request,
        prompt: correctivePrompt,
      });

      const retryCleaned = cleanJsonString(retryResponse.raw);
      const retryJson = JSON.parse(retryCleaned);
      const validated = schema.parse(retryJson);

      const combinedUsage: TokenUsage = {
        promptTokens: textResponse.usage.promptTokens + retryResponse.usage.promptTokens,
        completionTokens: textResponse.usage.completionTokens + retryResponse.usage.completionTokens,
        totalTokens: textResponse.usage.totalTokens + retryResponse.usage.totalTokens,
      };

      return {
        raw: retryResponse.raw,
        parsed: validated,
        usage: combinedUsage,
        model: retryResponse.model,
        costUsd: calculateCost(retryResponse.model, combinedUsage),
        durationMs: textResponse.durationMs + retryResponse.durationMs,
      };
    }
  }
}
