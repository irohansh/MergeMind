import { getConfig } from '../config/env.js';
import type { AIProvider } from './aiProvider.js';
import { GoogleGeminiProvider } from './geminiProvider.js';
import { MockAIProvider } from './mockProvider.js';

let defaultProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (defaultProvider) {
    return defaultProvider;
  }

  const config = getConfig();
  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    defaultProvider = new GoogleGeminiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  } else {
    defaultProvider = new MockAIProvider();
  }
  return defaultProvider;
}

export function setAIProvider(provider: AIProvider): void {
  defaultProvider = provider;
}

export function resetAIProvider(): void {
  defaultProvider = null;
}
