import { Octokit } from '@octokit/rest';

export interface GitHubPRDetails {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headSha: string;
  baseSha: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  rawDiff: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'MergeMind-PR-Reviewer/2.0',
    });
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<GitHubPRDetails> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Fetch the unified diff directly
    const diffResponse = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: 'application/vnd.github.v3.diff',
      },
    });

    const rawDiff = typeof diffResponse.data === 'string' ? diffResponse.data : '';

    return {
      owner,
      repo,
      pullNumber,
      title: pr.title,
      description: pr.body ?? '',
      author: pr.user?.login ?? 'unknown',
      baseBranch: pr.base.ref,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      filesChanged: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      rawDiff,
    };
  }

  async getLatestHeadSha(owner: string, repo: string, pullNumber: number): Promise<string> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return pr.head.sha;
  }

  async postGeneralComment(owner: string, repo: string, pullNumber: number, body: string): Promise<number> {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    return comment.id;
  }

  async postInlineReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    body: string,
    comments: Array<{ path: string; line: number; side?: 'RIGHT' | 'LEFT'; body: string }>
  ): Promise<number> {
    const { data: review } = await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      body,
      event: 'COMMENT', // Non-negotiable: COMMENT only, NEVER APPROVE
      comments: comments.map(c => ({
        path: c.path,
        line: c.line,
        side: c.side ?? 'RIGHT',
        body: c.body,
      })),
    });
    return review.id;
  }

  async listExistingReviewComments(owner: string, repo: string, pullNumber: number): Promise<string[]> {
    try {
      const { data: comments } = await this.octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return comments.map(c => c.body);
    } catch {
      return [];
    }
  }
}
