import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, resetConfigForTesting } from '../../src/config/env.js';

describe('Config Unit Tests', () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it('loads valid default configuration', () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.MAX_REVIEW_BUDGET_USD).toBeGreaterThan(0);
    expect(config.MAX_INVESTIGATION_ITERATIONS).toBeGreaterThanOrEqual(1);
    expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
  });

  it('defaults AI_PROVIDER to mock when GEMINI_API_KEY is unset', () => {
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;
    resetConfigForTesting();

    const config = getConfig();
    expect(config.AI_PROVIDER).toBe('mock');

    if (origKey) process.env.GEMINI_API_KEY = origKey;
  });
});
