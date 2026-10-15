import type { GitHubClient } from './client.js';
import { SecurityGuardrails } from '../security/guardrails.js';
import type { SecurityFinding, LogicFinding, StyleFinding } from '../agents/schemas.js';

export interface PublishReviewParams {
  owner: string;
  repo: string;
  pullNumber: number;
  expectedHeadSha: string;
  summaryMarkdown: string;
  verifiedFindings: Array<SecurityFinding | LogicFinding | StyleFinding>;
}

export interface PublishResult {
  published: boolean;
  reviewId?: number;
  inlineCommentsCount: number;
  staleAborted: boolean;
  reason?: string;
}

export class CommentPublisher {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  async publish(params: PublishReviewParams): Promise<PublishResult> {
    // 1. Guardrail assertion: only comments allowed
    SecurityGuardrails.assertSafeReviewAction('COMMENT');

    // 2. Stale review check: ensure head commit has not changed while review was computing
    try {
      const currentHead = await this.client.getLatestHeadSha(params.owner, params.repo, params.pullNumber);
      if (currentHead !== params.expectedHeadSha) {
        return {
          published: false,
          inlineCommentsCount: 0,
          staleAborted: true,
          reason: `Stale review aborted: PR head moved from ${params.expectedHeadSha.slice(0, 7)} to ${currentHead.slice(0, 7)}.`,
        };
      }
    } catch (err) {
      console.warn(`[publisher-warn] Could not verify head SHA: ${(err as Error).message}`);
    }

    // 3. Prepare inline comments for high-priority findings with valid lines
    const existingComments = await this.client.listExistingReviewComments(params.owner, params.repo, params.pullNumber);

    const inlineComments: Array<{ path: string; line: number; side?: 'RIGHT'; body: string }> = [];

    for (const finding of params.verifiedFindings) {
      if (finding.line > 0 && (finding.severity === 'CRITICAL' || finding.severity === 'HIGH')) {
        const commentBody = `### ⚠️ ${finding.severity}: ${finding.title}
${finding.description}

${'recommendation' in finding ? `**Recommendation**:\n\`\`\`typescript\n${finding.recommendation}\n\`\`\`` : ''}
${'fix' in finding ? `**Suggested Fix**:\n\`\`\`typescript\n${finding.fix}\n\`\`\`` : ''}

*Reported by MergeMind Verification Engine*`;

        // Check if identical comment already exists
        const isDuplicate = existingComments.some(ec => ec.includes(finding.title));
        if (!isDuplicate) {
          inlineComments.push({
            path: finding.file,
            line: finding.line,
            side: 'RIGHT',
            body: commentBody,
          });
        }
      }
    }

    // 4. Publish via GitHub Review API
    try {
      const reviewId = await this.client.postInlineReview(
        params.owner,
        params.repo,
        params.pullNumber,
        params.expectedHeadSha,
        params.summaryMarkdown,
        inlineComments
      );

      return {
        published: true,
        reviewId,
        inlineCommentsCount: inlineComments.length,
        staleAborted: false,
      };
    } catch (err) {
      // Fallback: post as general issue comment if inline review fails
      console.warn(`[publisher-warn] Inline review submission failed (${(err as Error).message}); falling back to general comment.`);
      const commentId = await this.client.postGeneralComment(
        params.owner,
        params.repo,
        params.pullNumber,
        params.summaryMarkdown
      );

      return {
        published: true,
        reviewId: commentId,
        inlineCommentsCount: 0,
        staleAborted: false,
        reason: 'Posted as issue comment due to inline review API failure.',
      };
    }
  }
}
