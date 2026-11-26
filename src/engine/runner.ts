import { analyzeCompose } from '../analyzers/compose';
import { analyzeDockerfile } from '../analyzers/dockerfile';
import { analyzeSecrets } from '../analyzers/secrets';
import { analyzeTerraform } from '../analyzers/terraform';
import { parseTerraform, TfResource } from '../analyzers/terraform-parser';
import { DEFAULT_CONFIG } from '../config/infraguard-config';
import { PRO_RULES } from '../rules/pro';
import { ChangedFile, Config, Finding, Tier } from '../types';
import { isComposeFile, isDockerfile, isSecretScanEligible, isTerraformFile } from './detect';
import {
  applyConfigFilters,
  applyInlineIgnores,
  computeTotalMonthlyCost,
  isPathIgnored,
  sortFindings,
} from './filter';

export interface RunOptions {
  tier: Tier;
  config?: Config;
}

/**
 * Dispatches modified files to the appropriate analyzers based on the active tier
 * and applies inline + config filters and budget threshold checks.
 */
export function runAnalysis(files: ChangedFile[], options: RunOptions): Finding[] {
  const isPro = options.tier === 'pro';
  const config = isPro && options.config ? options.config : DEFAULT_CONFIG;

  const activeFiles = files.filter((file) => {
    if (file.status === 'removed') {
      return false;
    }
    if (isPro && isPathIgnored(file.filename, config.ignore_paths)) {
      return false;
    }
    return true;
  });

  const allTfResources: TfResource[] = [];
  if (isPro) {
    for (const file of activeFiles) {
      if (isTerraformFile(file.filename)) {
        allTfResources.push(...parseTerraform(file.content).resources);
      }
    }
  }

  const rawFindings: Finding[] = [];

  for (const file of activeFiles) {
    if (isDockerfile(file.filename)) {
      rawFindings.push(...analyzeDockerfile(file.filename, file.content));
    } else if (isComposeFile(file.filename)) {
      rawFindings.push(...analyzeCompose(file.filename, file.content));
    } else if (isPro && isTerraformFile(file.filename)) {
      rawFindings.push(
        ...analyzeTerraform(file.filename, file.content, {
          thresholds: config.thresholds,
          allResources: allTfResources,
        }),
      );
    }

    if (isPro && isSecretScanEligible(file.filename)) {
      rawFindings.push(...analyzeSecrets(file.filename, file.content, file.patch));
    }
  }

  let findings = applyInlineIgnores(rawFindings, activeFiles);

  if (isPro) {
    findings = applyConfigFilters(findings, config);

    const maxCost = config.thresholds.max_monthly_cost_usd;
    const finRule = PRO_RULES['IG-FIN-001']!;
    const finIgnored = config.ignore_rules.some((r) => r.toUpperCase() === finRule.id);
    if (maxCost !== undefined && !finIgnored) {
      const totalCost = computeTotalMonthlyCost(findings);
      if (totalCost > maxCost) {
        findings.push({
          ruleId: finRule.id,
          severity: config.severity_overrides[finRule.id] ?? finRule.severity,
          file: '.infraguard.yml',
          line: 1,
          message: `Surcoût mensuel estimé (~$${totalCost}/mois) supérieur au seuil ($${maxCost}/mois).`,
          remediation: finRule.remediation,
          tier: finRule.tier,
        });
      }
    }
  }

  return sortFindings(findings);
}
