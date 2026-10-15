import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../src/github/diffParser.js';
import { EvidenceVerificationEngine } from '../../src/security/evidenceVerification.js';
import type { SecurityFinding } from '../../src/agents/schemas.js';

describe('Evidence Verification Engine Unit Tests', () => {
  const sampleDiff = `diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..abcdefg 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,6 +10,10 @@ router.get('/users', async (req, res) => {
   res.json(users);
 });
+router.get('/admin/export', async (req, res) => {
+  const search = req.query.search as string;
+  const result = await db.query(\`SELECT * FROM users WHERE name = '\${search}'\`);
+  res.json(result.rows);
+});
`;

  const parsedDiff = parseUnifiedDiff(sampleDiff);
  const verifier = new EvidenceVerificationEngine(parsedDiff);

  it('verifies findings with exact line and snippet match', () => {
    const validFinding: SecurityFinding = {
      id: 'sec-1',
      file: 'src/api/users.ts',
      line: 14,
      severity: 'CRITICAL',
      category: 'SQL Injection',
      title: 'SQL Injection in search query',
      description: 'Raw SQL interpolation',
      vulnerable_code: "const result = await db.query(`SELECT * FROM users WHERE name = '${search}'`);",
      recommendation: 'Use parameters',
      verified: false,
    };

    const result = verifier.verifyFinding(validFinding);
    expect(result.status).toBe('VERIFIED');
    expect(result.match_confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('realigns line numbers when snippet matches nearby line in diff', () => {
    const shiftedFinding: SecurityFinding = {
      id: 'sec-2',
      file: 'src/api/users.ts',
      line: 12, // Reported line 12, actual line is 14
      severity: 'CRITICAL',
      category: 'SQL Injection',
      title: 'SQL Injection in search query',
      description: 'Raw SQL interpolation',
      vulnerable_code: "const result = await db.query(`SELECT * FROM users WHERE name = '${search}'`);",
      recommendation: 'Use parameters',
      verified: false,
    };

    const result = verifier.verifyFinding(shiftedFinding);
    expect(result.status).toBe('VERIFIED');
    expect(result.exact_line_matched).toBe(14);
  });

  it('rejects hallucinated findings where code snippet does not exist', () => {
    const fakeFinding: SecurityFinding = {
      id: 'sec-fake',
      file: 'src/api/users.ts',
      line: 14,
      severity: 'CRITICAL',
      category: 'Remote Code Execution',
      title: 'Fake RCE',
      description: 'Non-existent eval call',
      vulnerable_code: 'eval(req.query.dangerousInput);',
      recommendation: 'Do not use eval',
      verified: false,
    };

    const result = verifier.verifyFinding(fakeFinding);
    expect(result.status).toBe('DISPROVED');
  });

  it('rejects findings for files that are not part of the pull request', () => {
    const wrongFileFinding: SecurityFinding = {
      id: 'sec-wrong-file',
      file: 'src/services/payment.ts',
      line: 42,
      severity: 'HIGH',
      category: 'Logic',
      title: 'Ghost finding',
      description: 'File not in PR',
      vulnerable_code: 'pay()',
      recommendation: 'none',
      verified: false,
    };

    const result = verifier.verifyFinding(wrongFileFinding);
    expect(result.status).toBe('UNVERIFIABLE');
  });
});
