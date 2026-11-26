import * as core from '@actions/core';
import { ChangedFile } from '../types';

export const MAX_PR_FILES = 300;
export const MAX_FILE_SIZE_BYTES = 1_048_576; // 1 MiB

export interface PullFileItem {
  filename: string;
  status: string;
  patch?: string;
}

export interface RepoContentResponse {
  data:
    | {
        type?: string;
        size?: number;
        content?: string;
        encoding?: string;
      }
    | unknown[];
}

export interface GitHubFilesClient {
  rest: {
    pulls: {
      listFiles: (params: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
        page: number;
      }) => Promise<{ data: PullFileItem[] }>;
    };
    repos: {
      getContent: (params: {
        owner: string;
        repo: string;
        path: string;
        ref: string;
      }) => Promise<RepoContentResponse>;
    };
  };
}

export interface FetchPrFilesParams {
  octokit: GitHubFilesClient;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const checkLen = Math.min(buf.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Fetches a single text file from a repository at a specific git ref.
 * Returns `null` if the file does not exist, is a directory/binary, or exceeds 1 MiB.
 */
export async function fetchRepoFileContent(
  octokit: GitHubFilesClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const resp = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(resp.data) || resp.data.type !== 'file') {
      return null;
    }
    if (typeof resp.data.size === 'number' && resp.data.size > MAX_FILE_SIZE_BYTES) {
      core.notice(`Fichier ignoré (> 1 Mo) : ${path}`);
      return null;
    }
    if (typeof resp.data.content !== 'string') {
      return null;
    }
    const encoding = resp.data.encoding === 'base64' ? 'base64' : 'utf8';
    const buf = Buffer.from(resp.data.content.replace(/\n/g, ''), encoding);
    if (buf.length > MAX_FILE_SIZE_BYTES) {
      core.notice(`Fichier ignoré (> 1 Mo) : ${path}`);
      return null;
    }
    if (isBinaryBuffer(buf)) {
      return null;
    }
    return buf.toString('utf8');
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return null;
    }
    core.warning(
      `Impossible de lire le fichier ${path} : ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Lists modified/added files in a Pull Request (paginated, max 300) and fetches
 * their HEAD contents, excluding removed, > 1 MiB, and binary files.
 */
export async function fetchPrFiles(params: FetchPrFilesParams): Promise<ChangedFile[]> {
  const { octokit, owner, repo, pullNumber, headSha } = params;
  const allItems: PullFileItem[] = [];
  const perPage = 100;
  const maxPages = Math.ceil(MAX_PR_FILES / perPage);

  for (let page = 1; page <= maxPages; page++) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: perPage,
      page,
    });
    allItems.push(...data);

    if (data.length < perPage) {
      break;
    }
    if (page === maxPages && data.length === perPage) {
      core.notice(`Analyse tronquée : la PR dépasse la limite de ${MAX_PR_FILES} fichiers.`);
    }
  }

  const changedFiles: ChangedFile[] = [];

  for (const item of allItems.slice(0, MAX_PR_FILES)) {
    if (item.status === 'removed') {
      continue;
    }
    const content = await fetchRepoFileContent(octokit, owner, repo, item.filename, headSha);
    if (content === null) {
      continue;
    }
    changedFiles.push({
      filename: item.filename,
      status: item.status,
      content,
      patch: item.patch,
    });
  }

  return changedFiles;
}
