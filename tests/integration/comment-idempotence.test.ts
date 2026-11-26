import * as core from '@actions/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubCommentClient, IssueComment, upsertPrComment } from '../../src/github/comment';
import { REPORT_MARKER } from '../../src/report/markdown';

const mockWrite = vi.fn(async () => undefined);
const mockAddRaw = vi.fn(() => ({ write: mockWrite }));

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
  summary: {
    addRaw: (...args: unknown[]) => mockAddRaw(...(args as [])),
  },
}));

describe('upsertPrComment (idempotence & fork 403)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new comment when none exists and ignores human comments containing the marker', async () => {
    const humanOnly: IssueComment[] = [
      {
        id: 101,
        body: `${REPORT_MARKER}\nHuman comment`,
        user: { type: 'User', login: 'dev' },
      },
    ];

    const listComments = vi.fn(async () => ({ data: humanOnly }));
    const createComment = vi.fn(async () => ({ data: { id: 999 } }));
    const updateComment = vi.fn(async () => ({ data: { id: 999 } }));
    const octokit: GitHubCommentClient = {
      rest: { issues: { listComments, createComment, updateComment } },
    };

    const res = await upsertPrComment({
      octokit,
      owner: 'org',
      repo: 'repo',
      pullNumber: 7,
      body: `${REPORT_MARKER}\nNew body`,
    });

    expect(res).toEqual({ action: 'created', commentId: 999 });
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
  });

  it('updates the existing bot comment without creating a duplicate across multiple runs', async () => {
    const existing = JSON.parse(
      readFileSync(join(__dirname, '../fixtures/github/comments-existing.json'), 'utf8'),
    ) as IssueComment[];

    const listComments = vi.fn(async () => ({ data: existing }));
    const createComment = vi.fn(async () => ({ data: { id: 303 } }));
    const updateComment = vi.fn(async () => ({ data: { id: 202 } }));
    const octokit: GitHubCommentClient = {
      rest: { issues: { listComments, createComment, updateComment } },
    };

    const res1 = await upsertPrComment({
      octokit,
      owner: 'org',
      repo: 'repo',
      pullNumber: 7,
      body: `${REPORT_MARKER}\nRun 1`,
    });
    const res2 = await upsertPrComment({
      octokit,
      owner: 'org',
      repo: 'repo',
      pullNumber: 7,
      body: `${REPORT_MARKER}\nRun 2`,
    });

    expect(res1).toEqual({ action: 'updated', commentId: 202 });
    expect(res2).toEqual({ action: 'updated', commentId: 202 });
    expect(updateComment).toHaveBeenCalledTimes(2);
    expect(createComment).not.toHaveBeenCalled();
  });

  it('paginates through comments to find an existing bot comment on page 2', async () => {
    const page1: IssueComment[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: 'unrelated',
      user: { type: 'User' },
    }));
    const page2: IssueComment[] = [
      { id: 555, body: `${REPORT_MARKER}\nFound on page 2`, user: { type: 'Bot' } },
    ];

    const listComments = vi.fn(async ({ page }: { page: number }) => ({
      data: page === 1 ? page1 : page2,
    }));
    const createComment = vi.fn(async () => ({ data: { id: 1 } }));
    const updateComment = vi.fn(async () => ({ data: { id: 555 } }));
    const octokit: GitHubCommentClient = {
      rest: { issues: { listComments, createComment, updateComment } },
    };

    const res = await upsertPrComment({
      octokit,
      owner: 'org',
      repo: 'repo',
      pullNumber: 10,
      body: `${REPORT_MARKER}\nUpdated`,
    });

    expect(listComments).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ action: 'updated', commentId: 555 });
    expect(createComment).not.toHaveBeenCalled();
  });

  it('handles HTTP 403 (fork PR) gracefully with a warning and writes to step summary', async () => {
    const forbiddenErr = Object.assign(new Error('Resource not accessible by integration'), {
      status: 403,
    });
    const octokit: GitHubCommentClient = {
      rest: {
        issues: {
          listComments: vi.fn(async () => ({ data: [] })),
          createComment: vi.fn(async () => {
            throw forbiddenErr;
          }),
          updateComment: vi.fn(async () => ({ data: { id: 1 } })),
        },
      },
    };

    const body = `${REPORT_MARKER}\nFork report`;
    const res = await upsertPrComment({
      octokit,
      owner: 'org',
      repo: 'repo',
      pullNumber: 12,
      body,
    });

    expect(res).toEqual({ action: 'skipped_forbidden' });
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('403'));
    expect(mockAddRaw).toHaveBeenCalledWith(body);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
