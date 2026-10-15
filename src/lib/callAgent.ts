import Anthropic from '@anthropic-ai/sdk';
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner.js';
import { SECURITY_SYSTEM_PROMPT } from '../prompts/security.js';
import { LOGIC_SYSTEM_PROMPT } from '../prompts/logic.js';
import { STYLE_SYSTEM_PROMPT } from '../prompts/style.js';
import { SYNTHESISER_SYSTEM_PROMPT } from '../prompts/synthesiser.js';
import type { AgentLog } from '../types/agents.js';
import { insertAgentLog } from '../db/client.js';
import { getMockAgentResponse } from './mockAgentData.js';

export function isDryRun(): boolean {
  return process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
}

// Pricing per million tokens (MTok) as of 2026-07
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-7-sonnet-20250219': { input: 3.00, output: 15.00 },
};

function getPricing(model: string): { input: number; output: number } {
  if (PRICE_PER_MTOK[model]) {
    return PRICE_PER_MTOK[model];
  }
  if (model.toLowerCase().includes('haiku')) {
    return { input: 0.80, output: 4.00 };
  }
  return { input: 3.00, output: 15.00 };
}

const sessionLogs: AgentLog[] = [];

export function getSessionMetrics(): {
  logs: AgentLog[];
  totals: { input_tokens: number; output_tokens: number; duration_ms: number; cost_usd: number };
} {
  let totalInput = 0, totalOutput = 0, totalDuration = 0, totalCost = 0;
  for (const log of sessionLogs) {
    totalInput += log.input_tokens;
    totalOutput += log.output_tokens;
    totalDuration += log.duration_ms;
    const pricing = getPricing(log.model);
    totalCost += (log.input_tokens / 1_000_000) * pricing.input
              + (log.output_tokens / 1_000_000) * pricing.output;
  }
  return {
    logs: sessionLogs,
    totals: { input_tokens: totalInput, output_tokens: totalOutput, duration_ms: totalDuration, cost_usd: totalCost },
  };
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Set it in .env or run with DRY_RUN=true / --dry-run for offline testing.'
      );
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

type AgentRole = 'planner' | 'security' | 'logic' | 'style' | 'synthesiser';

const PROMPTS: Record<AgentRole, string> = {
  planner: PLANNER_SYSTEM_PROMPT,
  security: SECURITY_SYSTEM_PROMPT,
  logic: LOGIC_SYSTEM_PROMPT,
  style: STYLE_SYSTEM_PROMPT,
  synthesiser: SYNTHESISER_SYSTEM_PROMPT,
};

const haikuModel = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-3-5-haiku-20241022';
const sonnetModel = process.env.ANTHROPIC_SONNET_MODEL || 'claude-3-5-sonnet-20241022';

// Sonnet for deep reasoning roles, Haiku for volume roles
const MODEL_MAP: Record<AgentRole, string> = {
  planner: haikuModel,
  security: sonnetModel,
  logic: haikuModel,
  style: haikuModel,
  synthesiser: sonnetModel,
};

export async function callAgent<T>(
  role: AgentRole,
  payload: object,
  batchId: string = 'none'
): Promise<T> {
  const model = MODEL_MAP[role];
  const systemPrompt = PROMPTS[role];
  const start = Date.now();

  // Synthesiser returns Markdown, all others return JSON
  const isSynthesiser = role === 'synthesiser';

  // Handle DRY_RUN mode for offline verification and zero API cost
  if (isDryRun()) {
    const mockResult = getMockAgentResponse<T>(role, batchId);
    const simulatedLatency = Math.floor(Math.random() * 30) + 20; // 20-50ms
    const mockInputTokens = isSynthesiser ? 1200 : 650;
    const mockOutputTokens = isSynthesiser ? 720 : 360;

    const log: AgentLog = {
      role,
      model,
      batch_id: batchId,
      input_tokens: mockInputTokens,
      output_tokens: mockOutputTokens,
      duration_ms: simulatedLatency,
      timestamp: new Date().toISOString(),
    };
    sessionLogs.push(log);
    console.log('[agent-log] [dry-run]', JSON.stringify(log));
    await insertAgentLog(log).catch(err =>
      console.warn(`[db-warn] Failed to insert log for ${role}: ${(err as Error).message}`)
    );

    return mockResult;
  }

async function createMessageWithBackoff(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  maxRetries: number = 3
): Promise<Anthropic.Message> {
  let attempt = 0;
  while (true) {
    try {
      return await client.messages.create(params);
    } catch (err: unknown) {
      attempt++;
      const status = (err as { status?: number })?.status;
      const isRateOrTransient = status === 429 || status === 529 || (status !== undefined && status >= 500);
      if (isRateOrTransient && attempt <= maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
        console.warn(
          `[rate-limit] Received status ${status}. Retrying in ${Math.round(delayMs)}ms (attempt ${attempt}/${maxRetries})...`
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

let raw: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const client = getAnthropicClient();
    const response = await createMessageWithBackoff(client, {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });

    const block = response.content[0];
    raw = block?.type === 'text' ? block.text : '';
    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
  } catch (err) {
    throw new Error(`[${role}] Anthropic API call failed: ${(err as Error).message}`);
  }

  let parsedResult: T;

  if (isSynthesiser) {
    parsedResult = raw as unknown as T;
  } else {
    // Strip any accidental prose before the JSON object
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`[${role}] Response contained no JSON object. Raw: ${raw.slice(0, 200)}`);
    }
    const cleaned = raw.slice(jsonStart, jsonEnd + 1);

    try {
      parsedResult = JSON.parse(cleaned) as T;
    } catch {
      // Retry once with an explicit correction prompt
      const client = getAnthropicClient();
      const retry = await createMessageWithBackoff(client, {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: JSON.stringify(payload) },
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: 'Your response was not valid JSON. Return only the JSON object, no other text.',
          },
        ],
      });
      inputTokens += retry.usage.input_tokens;
      outputTokens += retry.usage.output_tokens;
      const retryBlock = retry.content[0];
      const retryRaw = retryBlock?.type === 'text' ? retryBlock.text : '';
      const retryStart = retryRaw.indexOf('{');
      const retryEnd = retryRaw.lastIndexOf('}');
      if (retryStart === -1) {
        throw new Error(`[${role}] Retry also failed to produce JSON. Raw: ${retryRaw.slice(0, 200)}`);
      }
      parsedResult = JSON.parse(retryRaw.slice(retryStart, retryEnd + 1)) as T;
    }
  }

  const log: AgentLog = {
    role,
    model,
    batch_id: batchId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    duration_ms: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
  sessionLogs.push(log);
  console.log('[agent-log]', JSON.stringify(log));
  await insertAgentLog(log).catch(err =>
    console.warn(`[db-warn] Failed to insert log for ${role}: ${(err as Error).message}`)
  );

  return parsedResult;
}
