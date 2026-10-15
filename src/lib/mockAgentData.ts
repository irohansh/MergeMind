import type {
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
} from '../types/agents.js';

export function getMockAgentResponse<T>(role: string, batchId: string = 'none'): T {
  switch (role) {
    case 'planner': {
      const mockPlanner: PlannerOutput = {
        pr_summary: 'Add admin export and bulk-delete endpoints with user management queries',
        total_files_changed: 1,
        overall_risk: 'CRITICAL',
        security_batches: [
          {
            batch_id: 'sec-1',
            files: ['src/api/users.ts'],
            focus_areas: [
              'Missing auth middleware on the new /admin/export route',
              'Raw SQL string interpolation with user input in search query',
            ],
            risk_level: 'CRITICAL',
          },
        ],
        logic_batches: [
          {
            batch_id: 'logic-1',
            files: ['src/api/users.ts'],
            focus_areas: [
              'Promise.all with forEach in bulk-delete does not await async callback',
            ],
            risk_level: 'HIGH',
          },
        ],
        style_batches: [
          {
            batch_id: 'style-1',
            files: ['src/api/users.ts'],
            focus_areas: [
              'Type assertions without schema validation on req.query and req.body',
            ],
            risk_level: 'LOW',
          },
        ],
        skip_files: ['package-lock.json'],
        skip_reason: 'Dependency lock files excluded from review',
      };
      return mockPlanner as unknown as T;
    }

    case 'security': {
      const mockSecurity: SecurityAgentOutput = {
        batch_id: batchId,
        agent: 'security',
        findings: [
          {
            id: 'sec-1-0',
            file: 'src/api/users.ts',
            line: 16,
            severity: 'CRITICAL',
            category: 'SQL Injection',
            title: 'Raw user input concatenated into SQL query',
            description:
              "The search parameter is interpolated directly into raw SQL. An attacker can supply `' OR '1'='1` or UNION SELECT queries to exfiltrate database records.",
            vulnerable_code: "const result = await db.query(`SELECT * FROM users WHERE name = '${search}'`);",
            recommendation:
              "Use parameterised queries: const result = await db.query('SELECT * FROM users WHERE name = $1', [search]);",
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
            description:
              'The /admin/export route lacks requireAuth middleware, allowing unauthenticated public access to sensitive user data.',
            vulnerable_code: "router.get('/admin/export', async (req, res) => {",
            recommendation:
              "Add requireAuth middleware: router.get('/admin/export', requireAuth, async (req, res) => {",
            cwe_id: 'CWE-862',
            owasp: 'A01:2021 Broken Access Control',
          },
        ],
        planner_focus_validation: [
          {
            focus_area: 'Missing auth middleware on the new /admin/export route',
            confirmed: true,
            finding_id: 'sec-1-1',
          },
          {
            focus_area: 'Raw SQL string interpolation with user input in search query',
            confirmed: true,
            finding_id: 'sec-1-0',
          },
        ],
        files_with_no_issues: [],
        review_notes: 'Two critical security vulnerabilities found requiring immediate fix before merge.',
      };
      return mockSecurity as unknown as T;
    }

    case 'logic': {
      const mockLogic: LogicAgentOutput = {
        batch_id: batchId,
        agent: 'logic',
        findings: [
          {
            id: 'logic-1-0',
            file: 'src/api/users.ts',
            line: 22,
            severity: 'HIGH',
            category: 'Unhandled Promise',
            title: 'forEach does not await async callbacks',
            description:
              'ids.forEach(async ...) returns undefined and does not return promises. Promise.all receives an array of undefined, resolving immediately before database deletions finish.',
            buggy_code: 'await Promise.all(ids.forEach(async (id) => db.query(...)));',
            fix: 'await Promise.all(ids.map(id => db.query(\'DELETE FROM users WHERE id = $1\', [id])));',
            test_case:
              'Execute bulk-delete with 5 ids and verify all database delete queries resolve before response is returned.',
          },
        ],
        planner_focus_validation: [
          {
            focus_area: 'Promise.all with forEach in bulk-delete does not await async callback',
            confirmed: true,
            finding_id: 'logic-1-0',
          },
        ],
        files_with_no_issues: [],
      };
      return mockLogic as unknown as T;
    }

    case 'style': {
      const mockStyle: StyleAgentOutput = {
        batch_id: batchId,
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
            suggestion:
              'const search = typeof req.query.search === \'string\' ? req.query.search : \'\';',
            rationale:
              'req.query values can be undefined, string[], or ParsedQs. Runtime type validation prevents subtle type errors.',
          },
        ],
        praise: [
          {
            file: 'src/api/users.ts',
            note: 'The existing /users endpoint clean structure and auth middleware pattern is clear and easy to follow.',
          },
        ],
        files_with_no_issues: [],
      };
      return mockStyle as unknown as T;
    }

    case 'synthesiser': {
      const mockReview = `🔴 **CRITICAL — Do not merge until blocking issues are resolved**

---

### Summary
Adds admin export and bulk-delete endpoints to user management. Review found 2 critical security issues (SQL injection, unauthenticated admin endpoint) and 1 high logic bug (unawaited promises). Do not merge until the SQL injection and missing auth middleware are resolved.

---

### 🔴 Critical and high severity issues

**🔴 CRITICAL [SQL Injection] — \`src/api/users.ts\` line 16**
The search parameter is interpolated directly into raw SQL. An attacker can supply arbitrary SQL queries to extract all database records.

\`\`\`typescript
// Vulnerable / buggy code
const result = await db.query(\`SELECT * FROM users WHERE name = '\${search}'\`);

// Fix
const result = await db.query('SELECT * FROM users WHERE name = $1', [search]);
\`\`\`

**🔴 CRITICAL [Broken Access Control] — \`src/api/users.ts\` line 14**
The \`/admin/export\` route is registered without \`requireAuth\` middleware, exposing user data to unauthenticated users.

\`\`\`typescript
// Vulnerable / buggy code
router.get('/admin/export', async (req, res) => {

// Fix
router.get('/admin/export', requireAuth, async (req, res) => {
\`\`\`

**🟠 HIGH [Unhandled Promise] — \`src/api/users.ts\` line 22**
\`ids.forEach(async ...)\` does not return promises to \`Promise.all\`, causing the endpoint to send a success response before deletions complete.

\`\`\`typescript
// Vulnerable / buggy code
await Promise.all(ids.forEach(async (id) => db.query('DELETE FROM users WHERE id = $1', [id])));

// Fix
await Promise.all(ids.map(id => db.query('DELETE FROM users WHERE id = $1', [id])));
\`\`\`

---

### 🎨 Style suggestions
- \`src/api/users.ts:15\` — Validate \`req.query.search\` type before use instead of unchecked type assertion.

---

### ✅ What's working well
- Existing authentication middleware integration pattern on \`/users\` is clean and well-structured.

---

### 📋 Before merging
- [ ] Replace SQL string interpolation with parameterised query in \`src/api/users.ts:16\`
- [ ] Add \`requireAuth\` middleware to \`/admin/export\` in \`src/api/users.ts:14\`
- [ ] Replace \`forEach\` with \`map\` inside \`Promise.all\` in \`src/api/users.ts:22\`

---
*Reviewed by PR Orchestrator · Security Agent · Logic Agent · Style Agent · [DRY-RUN]*`;
      return mockReview as unknown as T;
    }

    default:
      throw new Error(`Unknown agent role for mock response: ${role}`);
  }
}
