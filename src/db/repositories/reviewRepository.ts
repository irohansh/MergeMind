import { getDatabasePool } from '../connection.js';

export interface SaveReviewParams {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  headSha: string;
  baseSha: string;
  overallRisk: string;
  status: string;
  summary: string;
  costUsd: number;
  totalTokens: number;
}

export class ReviewRepository {
  async saveReview(params: SaveReviewParams): Promise<number | null> {
    const pool = getDatabasePool();
    if (!pool) return null;

    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO pr_reviews 
         (pr_number, repo_owner, repo_name, head_sha, base_sha, overall_risk, status, summary, cost_usd, total_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          params.prNumber,
          params.repoOwner,
          params.repoName,
          params.headSha,
          params.baseSha,
          params.overallRisk,
          params.status,
          params.summary,
          params.costUsd,
          params.totalTokens,
        ]
      );
      return Number(result.rows[0]?.id);
    } catch (err) {
      console.warn(`[db-warn] Failed to insert pr_review: ${(err as Error).message}`);
      return null;
    }
  }

  async getLatestReview(repoOwner: string, repoName: string, prNumber: number) {
    const pool = getDatabasePool();
    if (!pool) return null;

    try {
      const result = await pool.query(
        `SELECT * FROM pr_reviews 
         WHERE repo_owner = $1 AND repo_name = $2 AND pr_number = $3 
         ORDER BY created_at DESC LIMIT 1`,
        [repoOwner, repoName, prNumber]
      );
      return result.rows[0] ?? null;
    } catch (err) {
      console.warn(`[db-warn] Failed to query latest pr_review: ${(err as Error).message}`);
      return null;
    }
  }
}
