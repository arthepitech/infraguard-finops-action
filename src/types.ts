export type Severity = 'info' | 'warning' | 'error';

export type Tier = 'free' | 'pro';

export interface Finding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  endLine?: number;
  message: string;
  remediation: string;
  tier: Tier;
  monthlyCostUsd?: number;
  resource?: string;
}

export interface ThresholdsConfig {
  max_volume_gb: number;
  ec2_min_size: string;
  rds_min_size: string;
  max_monthly_cost_usd?: number;
}

export interface Config {
  version: number;
  ignore_rules: string[];
  ignore_paths: string[];
  severity_overrides: Record<string, Severity>;
  thresholds: ThresholdsConfig;
  fail_on_severity: 'error' | 'warning';
}

export interface ChangedFile {
  filename: string;
  status: string;
  content: string;
  patch?: string;
}
