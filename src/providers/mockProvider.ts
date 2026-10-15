import { z } from 'zod';
import type { AIProvider, CompletionRequest, CompletionResponse, TokenUsage } from './aiProvider.js';

export class MockAIProvider implements AIProvider {
  private customHandlers: Map<string, (req: CompletionRequest) => any> = new Map();

  getName(): string {
    return 'MockAIProvider';
  }

  setMockHandler(roleOrPattern: string, handler: (req: CompletionRequest) => any): void {
    this.customHandlers.set(roleOrPattern, handler);
  }

  clearMockHandlers(): void {
    this.customHandlers.clear();
  }

  async generateText(request: CompletionRequest): Promise<CompletionResponse<string>> {
    const role = request.role ?? 'default';
    const handler = this.customHandlers.get(role);

    let raw: string;
    if (handler) {
      const res = handler(request);
      raw = typeof res === 'string' ? res : JSON.stringify(res);
    } else if (role === 'synthesiser') {
      raw = `## Pull Request Review Summary

🔴 **CRITICAL — Action Required Prior to Merge**

### Critical Findings
- **SQL Injection in \`src/api/users.ts:16\`**: Untrusted input interpolated into raw SQL. Use parameterized queries.
- **Missing Auth in \`src/api/users.ts:14\`**: \`/admin/export\` endpoint lacks \`requireAuth\` middleware.

### Logic & Robustness
- **Unhandled Async Execution in \`src/api/users.ts:22\`**: \`forEach\` does not await async database deletions.

### Style & Maintainability
- **Type Safety**: Avoid unchecked type assertions on \`req.query\`.

### Positive Observations
- Clean modular structure and consistent route separation.

### Pre-Merge Checklist
- [ ] Parameterize database queries
- [ ] Attach authentication middleware to admin routes
- [ ] Replace \`forEach\` with \`map\` in \`Promise.all\``;
    } else {
      raw = 'Mock text response';
    }

    const usage: TokenUsage = {
      promptTokens: 450,
      completionTokens: 250,
      totalTokens: 700,
    };

    return {
      raw,
      parsed: raw,
      usage,
      model: request.model ?? 'mock-gemini-2.5-flash',
      costUsd: 0.0001,
      durationMs: 25,
    };
  }

  async generateStructured<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>
  ): Promise<CompletionResponse<T>> {
    const role = request.role ?? 'default';
    const handler = this.customHandlers.get(role);

    let obj: any;
    if (handler) {
      obj = handler(request);
    } else {
      // Default realistic mocks based on role
      switch (role) {
        case 'planner':
          obj = {
            pr_summary: 'Add admin export and bulk-delete endpoints with user management queries',
            total_files_changed: 1,
            overall_risk: 'CRITICAL',
            security_batches: [
              {
                batch_id: 'sec-1',
                files: ['src/api/users.ts'],
                focus_areas: [
                  'Missing auth middleware on /admin/export',
                  'Raw SQL string interpolation in search parameter',
                ],
                risk_level: 'CRITICAL',
              },
            ],
            logic_batches: [
              {
                batch_id: 'logic-1',
                files: ['src/api/users.ts'],
                focus_areas: [
                  'Promise.all with forEach does not await async callback',
                ],
                risk_level: 'HIGH',
              },
            ],
            style_batches: [
              {
                batch_id: 'style-1',
                files: ['src/api/users.ts'],
                focus_areas: [
                  'Unchecked type assertions on req.query.search',
                ],
                risk_level: 'LOW',
              },
            ],
            skip_files: ['package-lock.json'],
            skip_reason: 'Lock files excluded from specialist review',
          };
          break;

        case 'security':
          obj = {
            batch_id: 'sec-1',
            agent: 'security',
            findings: [
              {
                id: 'sec-1-0',
                file: 'src/api/users.ts',
                line: 16,
                severity: 'CRITICAL',
                category: 'SQL Injection',
                title: 'Raw user input interpolated into database query',
                description: 'The search query parameter is directly interpolated into raw SQL, allowing SQL injection.',
                vulnerable_code: "const result = await db.query(`SELECT * FROM users WHERE name = '${search}'`);",
                recommendation: "Use parameterised queries: const result = await db.query('SELECT * FROM users WHERE name = $1', [search]);",
                cwe_id: 'CWE-89',
                owasp: 'A03:2021 Injection',
              },
              {
                id: 'sec-1-1',
                file: 'src/api/users.ts',
                line: 14,
                severity: 'CRITICAL',
                category: 'Broken Access Control',
                title: 'Admin export route missing authentication middleware',
                description: 'Route /admin/export lacks requireAuth middleware, exposing user data to unauthenticated callers.',
                vulnerable_code: "router.get('/admin/export', async (req, res) => {",
                recommendation: "Add requireAuth middleware: router.get('/admin/export', requireAuth, async (req, res) => {",
                cwe_id: 'CWE-862',
                owasp: 'A01:2021 Broken Access Control',
              },
            ],
            planner_focus_validation: [
              {
                focus_area: 'Missing auth middleware on /admin/export',
                confirmed: true,
                finding_id: 'sec-1-1',
              },
            ],
            files_with_no_issues: [],
            review_notes: 'Critical vulnerabilities must be resolved before merge.',
          };
          break;

        case 'logic':
          obj = {
            batch_id: 'logic-1',
            agent: 'logic',
            findings: [
              {
                id: 'logic-1-0',
                file: 'src/api/users.ts',
                line: 22,
                severity: 'HIGH',
                category: 'Unhandled Promise',
                title: 'forEach does not await async callbacks',
                description: 'Array.forEach does not await async callbacks. Promise.all receives undefined values and resolves immediately.',
                buggy_code: 'await Promise.all(ids.forEach(async (id) => db.query(...)));',
                fix: 'await Promise.all(ids.map(id => db.query(\'DELETE FROM users WHERE id = $1\', [id])));',
                test_case: 'Send bulk-delete request with multiple IDs and verify query completion.',
              },
            ],
            planner_focus_validation: [
              {
                focus_area: 'Promise.all with forEach does not await async callback',
                confirmed: true,
                finding_id: 'logic-1-0',
              },
            ],
            files_with_no_issues: [],
          };
          break;

        case 'style':
          obj = {
            batch_id: 'style-1',
            agent: 'style',
            findings: [
              {
                id: 'style-1-0',
                file: 'src/api/users.ts',
                line: 15,
                severity: 'MODERATE',
                category: 'TypeScript Strictness',
                title: 'Unchecked type assertion on req.query.search',
                current_code: 'const search = req.query.search as string;',
                suggestion: 'const search = typeof req.query.search === \'string\' ? req.query.search : \'\';',
                rationale: 'Prevent runtime errors if query string is undefined or an array.',
              },
            ],
            praise: [
              {
                file: 'src/api/users.ts',
                note: 'Clean route separation and standard error status codes.',
              },
            ],
            files_with_no_issues: [],
          };
          break;

        default:
          obj = { message: 'Mock structured output' };
      }
    }

    const validated = schema.parse(obj);
    const raw = JSON.stringify(validated);

    return {
      raw,
      parsed: validated,
      usage: {
        promptTokens: 500,
        completionTokens: 300,
        totalTokens: 800,
      },
      model: request.model ?? 'mock-gemini-2.5-flash',
      costUsd: 0.0001,
      durationMs: 30,
    };
  }
}
