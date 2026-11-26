import * as core from '@actions/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchLike } from '../../src/license/polar';
import { ActionContextLike, FullGitHubClient, run } from '../../src/main';

const mockSummaryWrite = vi.fn(async () => undefined);
const mockSummaryAddRaw = vi.fn(() => ({ write: mockSummaryWrite }));

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  notice: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  summary: {
    addRaw: (...args: unknown[]) => mockSummaryAddRaw(...(args as [])),
  },
}));

function makePrContext(eventName = 'pull_request'): ActionContextLike {
  return {
    eventName,
    repo: { owner: 'acme', repo: 'infra' },
    payload: {
      pull_request: {
        number: 42,
        head: { sha: 'deadbeef' },
      },
    },
  };
}

function makeOctokit(files: Record<string, string>): {
  client: FullGitHubClient;
  createComment: ReturnType<typeof vi.fn>;
  updateComment: ReturnType<typeof vi.fn>;
} {
  const createComment = vi.fn(async () => ({ data: { id: 100 } }));
  const updateComment = vi.fn(async () => ({ data: { id: 100 } }));

  const client: FullGitHubClient = {
    rest: {
      pulls: {
        listFiles: vi.fn(async () => ({
          data: Object.keys(files)
            .filter((k) => !k.startsWith('.infraguard'))
            .map((filename) => ({ filename, status: 'added' })),
        })),
      },
      repos: {
        getContent: vi.fn(async ({ path }) => {
          const content = files[path];
          if (content === undefined) {
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }
          return {
            data: {
              type: 'file',
              size: content.length,
              encoding: 'base64',
              content: Buffer.from(content).toString('base64'),
            },
          };
        }),
      },
      issues: {
        listComments: vi.fn(async () => ({ data: [] })),
        createComment,
        updateComment,
      },
    },
  };

  return { client, createComment, updateComment };
}

describe('main flow (integration)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exits cleanly with a notice on non-PR events', async () => {
    await run({
      context: { eventName: 'push', repo: { owner: 'acme', repo: 'infra' }, payload: {} },
    });
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('push'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('runs Free mode without license key, posts comment, sets outputs, and never fails build', async () => {
    const inputs: Record<string, string> = {
      github_token: 'tok',
      license_key: '',
      fail_on_error: 'true',
      config_path: '.infraguard.yml',
      comment: 'true',
    };
    vi.mocked(core.getInput).mockImplementation((name) => inputs[name] ?? '');

    const { client, createComment } = makeOctokit({
      Dockerfile: 'FROM node:latest\n',
      'main.tf': 'resource "aws_instance" "gpu" { instance_type = "p3.2xlarge" }',
      '.infraguard.yml': 'version: 1\nignore_rules: [IG-DKR-001]\n',
    });

    await run({ octokit: client, context: makePrContext() });

    expect(core.setOutput).toHaveBeenCalledWith('tier', 'free');
    expect(core.setOutput).toHaveBeenCalledWith('estimated_monthly_cost_usd', '0');
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('runs Pro mode with valid license and calls core.setFailed when fail_on_error is true', async () => {
    const inputs: Record<string, string> = {
      github_token: 'tok',
      license_key: 'valid-pro-key',
      fail_on_error: 'true',
      config_path: '.infraguard.yml',
      comment: 'true',
    };
    vi.mocked(core.getInput).mockImplementation((name) => inputs[name] ?? '');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'lk_123',
        organization_id: '5e25eb4f-321a-4e5f-b909-1ec156b374bd',
        status: 'granted',
        expires_at: null,
      }),
    })) as unknown as FetchLike;

    const { client, createComment } = makeOctokit({
      'main.tf': 'resource "aws_instance" "gpu" { instance_type = "p3.2xlarge" }',
      '.infraguard.yml': 'version: 1\nfail_on_severity: error\n',
    });

    await run({ octokit: client, context: makePrContext(), fetchImpl: fetchMock });

    expect(core.setOutput).toHaveBeenCalledWith('tier', 'pro');
    expect(core.setOutput).toHaveBeenCalledWith('errors_count', '1');
    expect(core.setOutput).toHaveBeenCalledWith('estimated_monthly_cost_usd', '2234');
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('1 finding'));
  });

  it('fails open to Pro (unverified) when Polar.sh is unreachable and reports warning', async () => {
    const inputs: Record<string, string> = {
      github_token: 'tok',
      license_key: 'pro-key',
      fail_on_error: 'false',
      comment: 'true',
    };
    vi.mocked(core.getInput).mockImplementation((name) => inputs[name] ?? '');

    const failingFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as FetchLike;

    const { client, createComment } = makeOctokit({
      'main.tf': 'resource "aws_instance" "gpu" { instance_type = "p3.2xlarge" }',
    });

    await run({ octokit: client, context: makePrContext(), fetchImpl: failingFetch });

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('fail-open'));
    expect(core.setOutput).toHaveBeenCalledWith('tier', 'pro');
    const commentBody = (createComment.mock.calls[0]?.[0] as { body: string }).body;
    expect(commentBody).toContain('Pro (licence non vérifiée)');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('catches unexpected internal exceptions with core.warning and never calls setFailed', async () => {
    vi.mocked(core.getInput).mockImplementation(() => {
      throw new Error('Unexpected boom');
    });

    await run({ context: makePrContext() });

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Unexpected boom'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
