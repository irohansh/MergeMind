import { JobQueue } from './jobQueue.js';
import { getAIProvider } from '../providers/index.js';
import { ReviewOrchestrator } from '../orchestrator/reviewOrchestrator.js';
import { GitHubClient } from '../github/client.js';
import { CommentPublisher } from '../github/commentPublisher.js';
import { ReviewRepository } from '../db/repositories/reviewRepository.js';
import { FindingsRepository } from '../db/repositories/findingsRepository.js';
import { getConfig } from '../config/env.js';

export class ReviewWorker {
  private queue: JobQueue;
  private orchestrator: ReviewOrchestrator;
  private githubClient: GitHubClient;
  private publisher: CommentPublisher;
  private reviewRepo: ReviewRepository;
  private findingsRepo: FindingsRepository;
  private isRunning: boolean = false;

  constructor() {
    const config = getConfig();
    const provider = getAIProvider();

    this.queue = new JobQueue();
    this.orchestrator = new ReviewOrchestrator(provider);
    this.githubClient = new GitHubClient(config.GITHUB_TOKEN);
    this.publisher = new CommentPublisher(this.githubClient);
    this.reviewRepo = new ReviewRepository();
    this.findingsRepo = new FindingsRepository();
  }

  async processSingleJob(): Promise<boolean> {
    const job = await this.queue.poll();
    if (!job) return false;

    console.log(`[worker] Picked up job ${job.id} for PR #${job.pr_number} (${job.repo_owner}/${job.repo_name})`);

    try {
      // 1. Fetch PR details from GitHub API
      const prDetails = await this.githubClient.getPullRequestDetails(
        job.repo_owner,
        job.repo_name,
        job.pr_number
      );

      // 2. Execute bounded multi-agent review
      const result = await this.orchestrator.runReview({
        diffText: prDetails.rawDiff,
        metadata: {
          title: prDetails.title,
          description: prDetails.description,
          author: prDetails.author,
          baseBranch: prDetails.baseBranch,
          filesChanged: prDetails.filesChanged,
          additions: prDetails.additions,
          deletions: prDetails.deletions,
        },
      });

      // 3. Persist review & findings to database
      const reviewId = await this.reviewRepo.saveReview({
        prNumber: job.pr_number,
        repoOwner: job.repo_owner,
        repoName: job.repo_name,
        headSha: job.head_sha,
        baseSha: prDetails.baseSha,
        overallRisk: result.plannerPlan.overall_risk,
        status: 'COMPLETED',
        summary: result.plannerPlan.pr_summary,
        costUsd: result.metrics.costUsd,
        totalTokens: result.metrics.totalUsage.totalTokens,
      });

      if (reviewId) {
        await this.findingsRepo.saveFindings(reviewId, 'security', result.verifiedSecurityFindings);
        await this.findingsRepo.saveFindings(reviewId, 'logic', result.verifiedLogicFindings);
        await this.findingsRepo.saveFindings(reviewId, 'style', result.verifiedStyleFindings);
      }

      // 4. Publish comments to GitHub
      const allFindings = [
        ...result.verifiedSecurityFindings,
        ...result.verifiedLogicFindings,
        ...result.verifiedStyleFindings,
      ];

      const pubResult = await this.publisher.publish({
        owner: job.repo_owner,
        repo: job.repo_name,
        pullNumber: job.pr_number,
        expectedHeadSha: job.head_sha,
        summaryMarkdown: result.markdownReview,
        verifiedFindings: allFindings,
      });

      console.log(`[worker] Job ${job.id} published: ${pubResult.published} (inline: ${pubResult.inlineCommentsCount})`);

      // 5. Mark job complete
      await this.queue.markComplete(job.id);
      return true;
    } catch (err) {
      console.error(`[worker-error] Failed processing job ${job.id}:`, err);
      await this.queue.markFailed(job.id, (err as Error).message);
      return false;
    }
  }

  async start(intervalMs: number = 5000): Promise<void> {
    this.isRunning = true;
    console.log('[worker] Background worker started.');

    while (this.isRunning) {
      // Periodically recover stale jobs
      await this.queue.recoverStale(10);

      const processed = await this.processSingleJob();
      if (!processed) {
        await new Promise(res => setTimeout(res, intervalMs));
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('[worker] Stopping background worker...');
  }
}

// Standalone execution if run directly via `npm run worker`
if (process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js')) {
  const worker = new ReviewWorker();
  worker.start().catch(err => {
    console.error('[worker-fatal]', err);
    process.exit(1);
  });
}
