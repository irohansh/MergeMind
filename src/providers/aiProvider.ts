import { z } from 'zod';

export interface CompletionRequest {
  systemInstruction?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  role?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResponse<T = string> {
  raw: string;
  parsed: T;
  usage: TokenUsage;
  model: string;
  costUsd: number;
  durationMs: number;
}

export interface AIProvider {
  getName(): string;
  generateText(request: CompletionRequest): Promise<CompletionResponse<string>>;
  generateStructured<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>
  ): Promise<CompletionResponse<T>>;
}
