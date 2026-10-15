import { getDatabasePool } from '../connection.js';

export interface EnqueueJobParams {
  deliveryId: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  headSha: string;
}

export interface ReviewJob {
  id: number;
  delivery_id: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  head_sha: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  max_attempts: number;
}

export class QueueRepository {
  private inMemoryQueue: ReviewJob[] = []; // Fallback if no DB configured

  async enqueueJob(params: EnqueueJobParams): Promise<boolean> {
    const pool = getDatabasePool();
    if (!pool) {
      if (this.inMemoryQueue.some(j => j.delivery_id === params.deliveryId)) {
        return false; // Idempotent deduplication
      }
      this.inMemoryQueue.push({
        id: this.inMemoryQueue.length + 1,
        delivery_id: params.deliveryId,
        repo_owner: params.repoOwner,
        repo_name: params.repoName,
        pr_number: params.prNumber,
        head_sha: params.headSha,
        status: 'PENDING',
        attempts: 0,
        max_attempts: 3,
      });
      return true;
    }

    try {
      const res = await pool.query(
        `INSERT INTO review_jobs (delivery_id, repo_owner, repo_name, pr_number, head_sha, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         ON CONFLICT (delivery_id) DO NOTHING
         RETURNING id`,
        [params.deliveryId, params.repoOwner, params.repoName, params.prNumber, params.headSha]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.warn(`[queue-warn] Failed to enqueue job: ${(err as Error).message}`);
      return false;
    }
  }

  async acquireNextJob(): Promise<ReviewJob | null> {
    const pool = getDatabasePool();
    if (!pool) {
      const job = this.inMemoryQueue.find(j => j.status === 'PENDING');
      if (job) {
        job.status = 'PROCESSING';
        job.attempts++;
        return { ...job };
      }
      return null;
    }

    try {
      // Lease next job atomically
      const res = await pool.query<ReviewJob>(
        `UPDATE review_jobs
         SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
         WHERE id = (
           SELECT id FROM review_jobs
           WHERE status = 'PENDING' AND attempts < max_attempts
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING id, delivery_id, repo_owner, repo_name, pr_number, head_sha, status, attempts, max_attempts`
      );
      return res.rows[0] ?? null;
    } catch (err) {
      console.warn(`[queue-warn] Failed to lease job: ${(err as Error).message}`);
      return null;
    }
  }

  async completeJob(jobId: number): Promise<void> {
    const pool = getDatabasePool();
    if (!pool) {
      const job = this.inMemoryQueue.find(j => j.id === jobId);
      if (job) job.status = 'COMPLETED';
      return;
    }

    try {
      await pool.query(
        `UPDATE review_jobs SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [jobId]
      );
    } catch (err) {
      console.warn(`[queue-warn] Failed to complete job ${jobId}: ${(err as Error).message}`);
    }
  }

  async failJob(jobId: number, errorMessage: string): Promise<void> {
    const pool = getDatabasePool();
    if (!pool) {
      const job = this.inMemoryQueue.find(j => j.id === jobId);
      if (job) {
        job.status = job.attempts >= job.max_attempts ? 'FAILED' : 'PENDING';
      }
      return;
    }

    try {
      await pool.query(
        `UPDATE review_jobs
         SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
             error_message = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [jobId, errorMessage]
      );
    } catch (err) {
      console.warn(`[queue-warn] Failed to update failed job ${jobId}: ${(err as Error).message}`);
    }
  }

  async recoverStaleJobs(staleMinutes: number = 10): Promise<number> {
    const pool = getDatabasePool();
    if (!pool) return 0;

    try {
      const res = await pool.query(
        `UPDATE review_jobs
         SET status = 'PENDING', updated_at = NOW()
         WHERE status = 'PROCESSING' AND updated_at < NOW() - ($1 || ' minutes')::INTERVAL`,
        [staleMinutes]
      );
      return res.rowCount ?? 0;
    } catch (err) {
      console.warn(`[queue-warn] Failed to recover stale jobs: ${(err as Error).message}`);
      return 0;
    }
  }
}
