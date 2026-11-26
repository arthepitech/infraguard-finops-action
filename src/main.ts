import * as core from '@actions/core';
import * as github from '@actions/github';
import { DEFAULT_CONFIG, parseInfraGuardConfig } from './config/infraguard-config';
import { getInputs } from './config/inputs';
import { computeTotalMonthlyCost, shouldFailBuild } from './engine/filter';
import { runAnalysis } from './engine/runner';
import { GitHubCommentClient, upsertPrComment } from './github/comment';
import { fetchPrFiles, fetchRepoFileContent, GitHubFilesClient } from './github/files';
import { FetchLike, validateLicense } from './license/polar';
import { emitAnnotations } from './report/annotations';
import { renderMarkdownReport } from './report/markdown';
import { Config, Severity } from './types';

const ACTION_VERSION = '1.0.0';
const SUPPORTED_EVENTS = new Set(['pull_request', 'pull_request_target']);

export type FullGitHubClient = GitHubFilesClient & GitHubCommentClient;

export interface ActionContextLike {
  eventName: string;
  repo: { owner: string; repo: string };
  payload: {
    pull_request?: {
      number: number;
      head?: { sha?: string };
    };
  };
}

export interface RunDependencies {
  octokit?: FullGitHubClient;
  context?: ActionContextLike;
  fetchImpl?: FetchLike;
}

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

async function writeStepSummarySafe(markdown: string): Promise<void> {
  try {
    await core.summary.addRaw(markdown).write();
  } catch {
    // Ignore when GITHUB_STEP_SUMMARY is not configured
  }
}

/**
 * Main entrypoint for the InfraGuard FinOps & Security GitHub Action.
 */
export async function run(deps: RunDependencies = {}): Promise<void> {
  try {
    const ctx: ActionContextLike = deps.context ?? (github.context as unknown as ActionContextLike);
    const pr = ctx.payload.pull_request;

    if (!SUPPORTED_EVENTS.has(ctx.eventName) || !pr) {
      core.notice(
        `Événement "${ctx.eventName}" non supporté : InfraGuard s'exécute uniquement sur pull_request / pull_request_target.`,
      );
      return;
    }

    const inputs = getInputs();
    const license = await validateLicense(inputs.licenseKey, {
      fetchImpl: deps.fetchImpl,
    });

    if (!inputs.licenseKey) {
      core.notice('Mode Free actif.');
    } else if (license.tier === 'pro' && license.verified) {
      core.notice('Licence Pro valide.');
    } else if (license.tier === 'pro' && !license.verified) {
      core.warning('API Polar.sh injoignable — licence présumée valide (fail-open).');
    } else {
      core.warning(`Licence invalide (${license.reason}), repli en mode Free.`);
    }

    if (inputs.failOnError && license.tier === 'free') {
      core.notice('fail_on_error est une fonctionnalité Pro (ignoré en mode Free).');
    }

    const octokit: FullGitHubClient =
      deps.octokit ?? (github.getOctokit(inputs.githubToken) as unknown as FullGitHubClient);
    const { owner, repo } = ctx.repo;
    const pullNumber = pr.number;
    const headSha = pr.head?.sha ?? 'HEAD';

    const files = await fetchPrFiles({
      octokit,
      owner,
      repo,
      pullNumber,
      headSha,
    });

    let config: Config = DEFAULT_CONFIG;
    const rawConfig = await fetchRepoFileContent(octokit, owner, repo, inputs.configPath, headSha);
    if (rawConfig !== null) {
      if (license.tier === 'pro') {
        config = parseInfraGuardConfig(rawConfig);
      } else {
        core.notice(`${inputs.configPath} détecté : fonctionnalité Pro (ignoré en mode Free).`);
      }
    }

    const findings = runAnalysis(files, {
      tier: license.tier,
      config,
    });

    const markdown = renderMarkdownReport({
      tier: license.tier,
      licenseVerified: license.verified,
      filesAnalyzed: files.length,
      findings,
      ignoredRules: license.tier === 'pro' ? config.ignore_rules : [],
      version: ACTION_VERSION,
    });

    emitAnnotations(findings);

    let summaryAlreadyWritten = false;
    if (inputs.comment) {
      const commentRes = await upsertPrComment({
        octokit,
        owner,
        repo,
        pullNumber,
        body: markdown,
      });
      summaryAlreadyWritten = commentRes.action === 'skipped_forbidden';
    }

    if (!summaryAlreadyWritten) {
      await writeStepSummarySafe(markdown);
    }

    const errorsCount = findings.filter((f) => f.severity === 'error').length;
    const totalCost = license.tier === 'pro' ? computeTotalMonthlyCost(findings) : 0;

    core.setOutput('tier', license.tier);
    core.setOutput('findings_count', String(findings.length));
    core.setOutput('errors_count', String(errorsCount));
    core.setOutput('estimated_monthly_cost_usd', String(totalCost));

    if (shouldFailBuild(findings, inputs.failOnError, license.tier, config.fail_on_severity)) {
      const thresholdRank = SEVERITY_RANK[config.fail_on_severity];
      const blockingCount = findings.filter(
        (f) => SEVERITY_RANK[f.severity] <= thresholdRank,
      ).length;
      core.setFailed(`InfraGuard : ${blockingCount} finding(s) ≥ ${config.fail_on_severity}`);
    }
  } catch (err) {
    // Constraint C5: never fail a customer's CI because of an internal InfraGuard error.
    const msg = err instanceof Error ? err.message : String(err);
    core.warning(`InfraGuard internal error (non-blocking): ${msg}`);
  }
}

/* c8 ignore next 3 */
if (require.main === module) {
  void run();
}
