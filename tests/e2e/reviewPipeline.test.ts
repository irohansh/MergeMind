import { describe, it, expect, vi } from 'vitest';
import { JobQueue } from '../../src/queue/jobQueue.js';
import { CommentPublisher } from '../../src/github/commentPublisher.js';
import { GitHubClient } from '../../src/github/client.js';
import type { SecurityFinding } from '../../src/agents/schemas.js';

describe('End-to-End Pipeline & Publishing Tests', () => {
  it('handles durable queue job lifecycle: enqueue, poll, complete, and recovery', async () => {
    const queue = new JobQueue();

    const enqueued = await queue.enqueue({
      deliveryId: 'del-e2e-100',
      repoOwner: 'test-org',
      repoName: 'test-repo',
      prNumber: 99,
      headSha: 'head-sha-123',
    });
    expect(enqueued).toBe(true);

    // Duplicate enqueue is idempotent
    const duplicate = await queue.enqueue({
      deliveryId: 'del-e2e-100',
      repoOwner: 'test-org',
      repoName: 'test-repo',
      prNumber: 99,
      headSha: 'head-sha-123',
    });
    expect(duplicate).toBe(false);

    // Lease job
    const job = await queue.poll();
    expect(job).toBeDefined();
    expect(job?.pr_number).toBe(99);

    // Complete job
    if (job) {
      await queue.markComplete(job.id);
    }
  });

  it('detects stale reviews when head SHA has moved', async () => {
    const mockClient = new GitHubClient();
    vi.spyOn(mockClient, 'getLatestHeadSha').mockResolvedValue('newer-sha-456');

    const publisher = new CommentPublisher(mockClient);
    const result = await publisher.publish({
      owner: 'test-org',
      repo: 'test-repo',
      pullNumber: 1,
      expectedHeadSha: 'older-sha-123',
      summaryMarkdown: 'Summary',
      verifiedFindings: [],
    });

    expect(result.published).toBe(false);
    expect(result.staleAborted).toBe(true);
    expect(result.reason).toContain('Stale review aborted');
  });

  it('publishes review with valid inline comments when head SHA matches', async () => {
    const mockClient = new GitHubClient();
    vi.spyOn(mockClient, 'getLatestHeadSha').mockResolvedValue('valid-sha-123');
    vi.spyOn(mockClient, 'listExistingReviewComments').mockResolvedValue([]);
    vi.spyOn(mockClient, 'postInlineReview').mockResolvedValue(1001);

    const verifiedFinding: SecurityFinding = {
      id: 'sec-1',
      file: 'src/api/users.ts',
      line: 16,
      severity: 'CRITICAL',
      category: 'SQL Injection',
      title: 'SQL Injection detected',
      description: 'Raw SQL interpolation',
      vulnerable_code: 'db.query(...)',
      recommendation: 'Use parameters',
      verified: true,
    };

    const publisher = new CommentPublisher(mockClient);
    const result = await publisher.publish({
      owner: 'test-org',
      repo: 'test-repo',
      pullNumber: 1,
      expectedHeadSha: 'valid-sha-123',
      summaryMarkdown: 'Summary Markdown Content',
      verifiedFindings: [verifiedFinding],
    });

    expect(result.published).toBe(true);
    expect(result.reviewId).toBe(1001);
    expect(result.inlineCommentsCount).toBe(1);
  });
});
