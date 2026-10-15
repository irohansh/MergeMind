import { getDatabasePool } from '../connection.js';
import type { SecurityFinding, LogicFinding, StyleFinding } from '../../agents/schemas.js';

type GenericFinding = SecurityFinding | LogicFinding | StyleFinding;

export class FindingsRepository {
  async saveFindings(reviewId: number, agent: string, findings: GenericFinding[]): Promise<void> {
    const pool = getDatabasePool();
    if (!pool || findings.length === 0) return;

    for (const finding of findings) {
      try {
        const vulnerableCode =
          'vulnerable_code' in finding
            ? finding.vulnerable_code
            : 'buggy_code' in finding
            ? finding.buggy_code
            : 'current_code' in finding
            ? finding.current_code
            : null;

        const description =
          'description' in finding
            ? finding.description
            : 'rationale' in finding
            ? finding.rationale
            : '';

        const recommendation =
          'recommendation' in finding
            ? finding.recommendation
            : 'fix' in finding
            ? finding.fix
            : 'suggestion' in finding
            ? finding.suggestion
            : null;

        await pool.query(
          `INSERT INTO review_findings
           (review_id, finding_id, agent, file, line, severity, category, title, description, vulnerable_code, recommendation, verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            reviewId,
            finding.id,
            agent,
            finding.file,
            finding.line,
            finding.severity,
            finding.category,
            finding.title,
            description,
            vulnerableCode,
            recommendation,
            finding.verified ?? false,
          ]
        );
      } catch (err) {
        console.warn(`[db-warn] Failed to insert review_finding ${finding.id}: ${(err as Error).message}`);
      }
    }
  }
}
