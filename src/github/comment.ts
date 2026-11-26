import * as core from '@actions/core';
import { REPORT_MARKER } from '../report/markdown';

export interface IssueComment {
  id: number;
  body?: string | null;
  user?: {
    type?: string;
    login?: string;
  } | null;
}

export interface GitHubCommentClient {
  rest: {
    issues: {
      listComments: (params: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page: number;
        page: number;
      }) => Promise<{ data: IssueComment[] }>;
      createComment: (params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }) => Promise<{ data: { id: number } }>;
      updateComment: (params: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }) => Promise<{ data: { id: number } }>;
    };
  };
}

export interface UpsertCommentParams {
  octokit: GitHubCommentClient;
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
}

export interface UpsertCommentResult {
  action: 'created' | 'updated' | 'skipped_forbidden';
  commentId?: number;
}

async function writeSummaryFallback(body: string): Promise<void> {
  try {
    await core.summary.addRaw(body).write();
  } catch {
    // GITHUB_STEP_SUMMARY may be unavailable in local/test runs
  }
}

/**
 * Posts or updates a single idempotent PR comment identified by `<!-- infraguard-report -->`
 * authored by a Bot account. Falls back gracefully to Job Summary on HTTP 403 (fork PRs).
 */
export async function upsertPrComment(params: UpsertCommentParams): Promise<UpsertCommentResult> {
  const { octokit, owner, repo, pullNumber, body } = params;
  const perPage = 100;

  try {
    let existingComment: IssueComment | undefined;
    let page = 1;

    while (true) {
      const { data } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: pullNumber,
        per_page: perPage,
        page,
      });

      existingComment = data.find(
        (c) =>
          c.user?.type === 'Bot' && typeof c.body === 'string' && c.body.includes(REPORT_MARKER),
      );
      if (existingComment || data.length < perPage) {
        break;
      }
      page++;
    }

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
      return { action: 'updated', commentId: existingComment.id };
    }

    const created = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    return { action: 'created', commentId: created.data.id };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 403) {
      core.warning(
        'Droits insuffisants (HTTP 403) pour commenter la PR (ex. PR de fork). Le rapport a été écrit dans GITHUB_STEP_SUMMARY.',
      );
      await writeSummaryFallback(body);
      return { action: 'skipped_forbidden' };
    }
    throw err;
  }
}
