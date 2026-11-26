import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/infraguard-config';
import { computeTotalMonthlyCost, shouldFailBuild } from '../../src/engine/filter';
import { runAnalysis } from '../../src/engine/runner';
import { ChangedFile, Config } from '../../src/types';

describe('runAnalysis (Pro & Free isolation)', () => {
  const sampleFiles: ChangedFile[] = [
    {
      filename: 'Dockerfile',
      status: 'modified',
      content: 'FROM node:20-alpine\nUSER app\n',
    },
    {
      filename: 'infra/main.tf',
      status: 'added',
      content: 'resource "aws_instance" "gpu" { instance_type = "p3.2xlarge" }',
    },
    {
      filename: 'examples/demo.tf',
      status: 'added',
      content: 'resource "aws_instance" "demo" { instance_type = "p3.2xlarge" }',
    },
    {
      filename: '.env',
      status: 'added',
      content: 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
    },
  ];

  it('never runs Terraform or Secrets in Free tier even if config is passed', () => {
    const findings = runAnalysis(sampleFiles, { tier: 'free', config: DEFAULT_CONFIG });
    expect(findings.every((f) => f.tier === 'free')).toBe(true);
    expect(findings.some((f) => f.ruleId.startsWith('IG-TF-'))).toBe(false);
    expect(findings.some((f) => f.ruleId.startsWith('IG-SEC-'))).toBe(false);
  });

  it('runs Terraform & Secrets in Pro, respects ignore_paths/ignore_rules/overrides and triggers IG-FIN-001', () => {
    const config: Config = {
      version: 1,
      ignore_rules: ['IG-DKR-003'],
      ignore_paths: ['examples/**'],
      severity_overrides: {},
      thresholds: {
        max_volume_gb: 500,
        ec2_min_size: '4xlarge',
        rds_min_size: '4xlarge',
        max_monthly_cost_usd: 1000,
      },
      fail_on_severity: 'error',
    };

    const findings = runAnalysis(sampleFiles, { tier: 'pro', config });

    // IG-DKR-003 ignored
    expect(findings.some((f) => f.ruleId === 'IG-DKR-003')).toBe(false);
    // examples/demo.tf ignored
    expect(findings.some((f) => f.file === 'examples/demo.tf')).toBe(false);
    // infra/main.tf flagged + .env flagged + IG-FIN-001 triggered (2234 > 1000)
    expect(findings.some((f) => f.ruleId === 'IG-TF-001')).toBe(true);
    expect(findings.some((f) => f.ruleId === 'IG-SEC-005')).toBe(true);
    expect(findings.some((f) => f.ruleId === 'IG-FIN-001')).toBe(true);
    expect(computeTotalMonthlyCost(findings)).toBe(2234);

    expect(shouldFailBuild(findings, true, 'pro', 'error')).toBe(true);
    expect(shouldFailBuild(findings, true, 'free', 'error')).toBe(false);
    expect(shouldFailBuild(findings, false, 'pro', 'error')).toBe(false);
  });
});
