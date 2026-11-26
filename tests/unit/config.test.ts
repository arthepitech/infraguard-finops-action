import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, parseInfraGuardConfig } from '../../src/config/infraguard-config';

describe('parseInfraGuardConfig', () => {
  it('returns defaults when file is absent or empty', () => {
    expect(parseInfraGuardConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(parseInfraGuardConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('parses valid .infraguard.yml', () => {
    const content = readFileSync(
      join(__dirname, '../fixtures/config/valid.infraguard.yml'),
      'utf8',
    );
    const warn = vi.fn();
    const config = parseInfraGuardConfig(content, warn);

    expect(warn).not.toHaveBeenCalled();
    expect(config).toEqual({
      version: 1,
      ignore_rules: ['IG-DKR-003', 'IG-TF-006'],
      ignore_paths: ['examples/**', '**/*.test.tf'],
      severity_overrides: { 'IG-CMP-004': 'error' },
      thresholds: {
        max_volume_gb: 300,
        ec2_min_size: '2xlarge',
        rds_min_size: '8xlarge',
        max_monthly_cost_usd: 1500,
      },
      fail_on_severity: 'warning',
    });
  });

  it('warns on unknown keys/thresholds/invalid values without throwing', () => {
    const content = readFileSync(
      join(__dirname, '../fixtures/config/invalid.infraguard.yml'),
      'utf8',
    );
    const warn = vi.fn();
    const config = parseInfraGuardConfig(content, warn);

    expect(warn).toHaveBeenCalledTimes(3);
    expect(config.thresholds.max_volume_gb).toBe(250);
    expect(config.fail_on_severity).toBe('error');
  });

  it('warns and falls back to defaults on broken YAML syntax', () => {
    const warn = vi.fn();
    const config = parseInfraGuardConfig('version: [unclosed', warn);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
