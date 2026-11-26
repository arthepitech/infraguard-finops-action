import * as core from '@actions/core';
import * as yaml from 'yaml';
import { Config, Severity } from '../types';

export const DEFAULT_CONFIG: Config = {
  version: 1,
  ignore_rules: [],
  ignore_paths: [],
  severity_overrides: {},
  thresholds: {
    max_volume_gb: 500,
    ec2_min_size: '4xlarge',
    rds_min_size: '4xlarge',
  },
  fail_on_severity: 'error',
};

const ALLOWED_TOP_KEYS = new Set([
  'version',
  'ignore_rules',
  'ignore_paths',
  'severity_overrides',
  'thresholds',
  'fail_on_severity',
]);

const ALLOWED_THRESHOLD_KEYS = new Set([
  'max_volume_gb',
  'ec2_min_size',
  'rds_min_size',
  'max_monthly_cost_usd',
]);

const VALID_SEVERITIES = new Set<Severity>(['info', 'warning', 'error']);

function cloneDefaultConfig(): Config {
  return {
    version: DEFAULT_CONFIG.version,
    ignore_rules: [],
    ignore_paths: [],
    severity_overrides: {},
    thresholds: { ...DEFAULT_CONFIG.thresholds },
    fail_on_severity: DEFAULT_CONFIG.fail_on_severity,
  };
}

/**
 * Parses and validates `.infraguard.yml` content. Unknown keys or invalid YAML
 * emit a non-blocking warning and fall back to defaults.
 */
export function parseInfraGuardConfig(
  rawContent?: string | null,
  warn: (message: string) => void = core.warning,
): Config {
  const config = cloneDefaultConfig();
  if (!rawContent || !rawContent.trim()) {
    return config;
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(rawContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Invalid .infraguard.yml YAML (${msg}); using defaults.`);
    return config;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn('Invalid .infraguard.yml root structure (expected mapping); using defaults.');
    return config;
  }

  const obj = parsed as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      warn(`Unknown key "${key}" in .infraguard.yml (ignored).`);
    }
  }

  if (typeof obj.version === 'number') {
    config.version = obj.version;
  }

  if (Array.isArray(obj.ignore_rules)) {
    config.ignore_rules = obj.ignore_rules
      .map((r) => String(r).trim().toUpperCase())
      .filter(Boolean);
  }

  if (Array.isArray(obj.ignore_paths)) {
    config.ignore_paths = obj.ignore_paths.map((p) => String(p).trim()).filter(Boolean);
  }

  if (
    obj.severity_overrides &&
    typeof obj.severity_overrides === 'object' &&
    !Array.isArray(obj.severity_overrides)
  ) {
    for (const [ruleId, sev] of Object.entries(obj.severity_overrides as Record<string, unknown>)) {
      const sevStr = String(sev).toLowerCase() as Severity;
      if (VALID_SEVERITIES.has(sevStr)) {
        config.severity_overrides[ruleId.trim().toUpperCase()] = sevStr;
      } else {
        warn(`Invalid severity override "${String(sev)}" for rule "${ruleId}" (ignored).`);
      }
    }
  }

  if (obj.thresholds && typeof obj.thresholds === 'object' && !Array.isArray(obj.thresholds)) {
    const t = obj.thresholds as Record<string, unknown>;
    for (const key of Object.keys(t)) {
      if (!ALLOWED_THRESHOLD_KEYS.has(key)) {
        warn(`Unknown threshold "${key}" in .infraguard.yml (ignored).`);
      }
    }
    if (typeof t.max_volume_gb === 'number' && t.max_volume_gb > 0) {
      config.thresholds.max_volume_gb = t.max_volume_gb;
    }
    if (typeof t.ec2_min_size === 'string' && t.ec2_min_size.trim()) {
      config.thresholds.ec2_min_size = t.ec2_min_size.trim();
    }
    if (typeof t.rds_min_size === 'string' && t.rds_min_size.trim()) {
      config.thresholds.rds_min_size = t.rds_min_size.trim();
    }
    if (typeof t.max_monthly_cost_usd === 'number' && t.max_monthly_cost_usd >= 0) {
      config.thresholds.max_monthly_cost_usd = t.max_monthly_cost_usd;
    }
  }

  if (obj.fail_on_severity === 'error' || obj.fail_on_severity === 'warning') {
    config.fail_on_severity = obj.fail_on_severity;
  } else if (obj.fail_on_severity !== undefined) {
    warn(`Invalid fail_on_severity "${String(obj.fail_on_severity)}" (expected error|warning).`);
  }

  return config;
}
