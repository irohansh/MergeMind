import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // AI Provider Settings
  AI_PROVIDER: z.enum(['gemini', 'mock']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_REASONING_MODEL: z.string().default('gemini-2.5-pro'),

  // GitHub Settings
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  // PostgreSQL Settings
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.coerce.boolean().default(false),

  // Operational & Budget Limits
  MAX_REVIEW_BUDGET_USD: z.coerce.number().default(0.25),
  MAX_INVESTIGATION_ITERATIONS: z.coerce.number().default(2),
  BATCH_CONCURRENCY: z.coerce.number().default(3),
  MAX_FILES_PER_BATCH: z.coerce.number().default(8),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues
        .map(issue => `[${issue.path.join('.')}]: ${issue.message}`)
        .join(', ');
      throw new Error(`Configuration validation failed: ${errorMsg}`);
    }

    const cfg = parsed.data;
    // Auto-select provider if not explicitly defined
    if (process.env.AI_PROVIDER === undefined && cfg.GEMINI_API_KEY) {
      cfg.AI_PROVIDER = 'gemini';
    }

    cachedConfig = cfg;
  }
  return cachedConfig;
}

export function resetConfigForTesting(): void {
  cachedConfig = null;
}
