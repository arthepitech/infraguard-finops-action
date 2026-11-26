import * as core from '@actions/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPrFiles,
  GitHubFilesClient,
  MAX_FILE_SIZE_BYTES,
  PullFileItem,
} from '../../src/github/files';

vi.mock('@actions/core', () => ({
  notice: vi.fn(),
  warning: vi.fn(),
}));

describe('fetchPrFiles', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('skips removed, oversized (> 1 MiB), and binary files and decodes base64 content', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, '../fixtures/github/pulls-listFiles.json'), 'utf8'),
    ) as PullFileItem[];

    const octokit: GitHubFilesClient = {
      rest: {
        pulls: {
          listFiles: vi.fn(async () => ({ data: fixture })),
        },
        repos: {
          getContent: vi.fn(async ({ path }) => {
            if (path === 'Dockerfile') {
              return {
                data: {
                  type: 'file',
                  size: 16,
                  encoding: 'base64',
                  content: Buffer.from('FROM node:latest\n').toString('base64'),
                },
              };
            }
            if (path === 'huge.tf') {
              return {
                data: {
                  type: 'file',
                  size: MAX_FILE_SIZE_BYTES + 1,
                  encoding: 'base64',
                  content: '',
                },
              };
            }
            if (path === 'logo.bin') {
              return {
                data: {
                  type: 'file',
                  size: 4,
                  encoding: 'base64',
                  content: Buffer.from([0x89, 0x50, 0x00, 0x47]).toString('base64'),
                },
              };
            }
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }),
        },
      },
    };

    const files = await fetchPrFiles({
      octokit,
      owner: 'org',
      repo: 'app',
      pullNumber: 42,
      headSha: 'abc123',
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      filename: 'Dockerfile',
      status: 'modified',
      content: 'FROM node:latest\n',
      patch: '@@ -1,2 +1,2 @@\n-FROM node:20-alpine\n+FROM node:latest',
    });
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('huge.tf'));
  });

  it('paginates up to 300 files and emits a truncation notice when hitting the limit', async () => {
    const makePage = (page: number): PullFileItem[] =>
      Array.from({ length: 100 }, (_, i) => ({
        filename: `f-${page}-${i}.txt`,
        status: 'added',
      }));

    const listFiles = vi.fn(async ({ page }: { page: number }) => ({ data: makePage(page) }));
    const getContent = vi.fn(async () => ({
      data: {
        type: 'file',
        size: 2,
        encoding: 'base64',
        content: Buffer.from('ok').toString('base64'),
      },
    }));

    const octokit: GitHubFilesClient = {
      rest: { pulls: { listFiles }, repos: { getContent } },
    };

    const files = await fetchPrFiles({
      octokit,
      owner: 'org',
      repo: 'app',
      pullNumber: 1,
      headSha: 'sha',
    });

    expect(listFiles).toHaveBeenCalledTimes(3);
    expect(files).toHaveLength(300);
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('300'));
  });

  it('skips directories, handles utf8 encoding, and warns on non-404 getContent errors', async () => {
    const octokit: GitHubFilesClient = {
      rest: {
        pulls: {
          listFiles: vi.fn(async () => ({
            data: [
              { filename: 'dir', status: 'added' },
              { filename: 'plain.txt', status: 'added' },
              { filename: 'err.txt', status: 'added' },
            ],
          })),
        },
        repos: {
          getContent: vi.fn(async ({ path }) => {
            if (path === 'dir') {
              return { data: [] };
            }
            if (path === 'plain.txt') {
              return { data: { type: 'file', size: 5, encoding: 'utf8', content: 'hello' } };
            }
            throw Object.assign(new Error('Internal Server Error'), { status: 500 });
          }),
        },
      },
    };

    const files = await fetchPrFiles({
      octokit,
      owner: 'org',
      repo: 'app',
      pullNumber: 2,
      headSha: 'sha',
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe('hello');
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('err.txt'));
  });
});
