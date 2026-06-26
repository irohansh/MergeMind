import Anthropic from '@anthropic-ai/sdk';
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner.js';
import { SECURITY_SYSTEM_PROMPT } from '../prompts/security.js';
import { LOGIC_SYSTEM_PROMPT } from '../prompts/logic.js';
import { STYLE_SYSTEM_PROMPT } from '../prompts/style.js';
import { SYNTHESISER_SYSTEM_PROMPT } from '../prompts/synthesiser.js';
import type { AgentLog } from '../types/agents.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type AgentRole = 'planner' | 'security' | 'logic' | 'style' | 'synthesiser';

const PROMPTS: Record<AgentRole, string> = {
  planner: PLANNER_SYSTEM_PROMPT,
  security: SECURITY_SYSTEM_PROMPT,
  logic: LOGIC_SYSTEM_PROMPT,
  style: STYLE_SYSTEM_PROMPT,
  synthesiser: SYNTHESISER_SYSTEM_PROMPT,
};

// Sonnet for deep reasoning roles, Haiku for volume roles
const MODEL_MAP: Record<AgentRole, string> = {
  planner: 'claude-haiku-4-5',
  security: 'claude-sonnet-4-6',
  logic: 'claude-haiku-4-5',
  style: 'claude-haiku-4-5',
  synthesiser: 'claude-sonnet-4-6',
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

  let raw: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await anthropic.messages.create({
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

  const log: AgentLog = {
    role,
    model,
    batch_id: batchId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    duration_ms: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
  console.log('[agent-log]', JSON.stringify(log));
  // TODO: insert log into Postgres agent_logs table

  if (isSynthesiser) {
    return raw as unknown as T;
  }

  // Strip any accidental prose before the JSON object
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`[${role}] Response contained no JSON object. Raw: ${raw.slice(0, 200)}`);
  }
  const cleaned = raw.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Retry once with an explicit correction prompt
    const retry = await anthropic.messages.create({
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
    const retryBlock = retry.content[0];
    const retryRaw = retryBlock?.type === 'text' ? retryBlock.text : '';
    const retryStart = retryRaw.indexOf('{');
    const retryEnd = retryRaw.lastIndexOf('}');
    if (retryStart === -1) {
      throw new Error(`[${role}] Retry also failed to produce JSON. Raw: ${retryRaw.slice(0, 200)}`);
    }
    return JSON.parse(retryRaw.slice(retryStart, retryEnd + 1)) as T;
  }
}
