import { describe, expect, it } from 'vitest';
import { applyInlineIgnores, sortFindings } from '../../src/engine/filter';
import { ChangedFile, Finding } from '../../src/types';

describe('filter & sort', () => {
  it('filters findings with inline # infraguard:ignore comments', () => {
    const files: ChangedFile[] = [
      {
        filename: 'Dockerfile',
        status: 'modified',
        content: [
          'FROM node:latest # infraguard:ignore IG-DKR-001',
          'USER root # infraguard:ignore IG-DKR-002',
          'RUN echo ok',
        ].join('\n'),
      },
      {
        filename: 'docker-compose.yml',
        status: 'modified',
        content: 'services:\n  web: # infraguard:ignore\n    image: nginx:latest\n',
      },
    ];

    const findings: Finding[] = [
      {
        ruleId: 'IG-DKR-001',
        severity: 'warning',
        file: 'Dockerfile',
        line: 1,
        message: 'unpinned',
        remediation: 'pin',
        tier: 'free',
      },
      {
        ruleId: 'IG-DKR-003',
        severity: 'info',
        file: 'Dockerfile',
        line: 1,
        message: 'no healthcheck',
        remediation: 'add',
        tier: 'free',
      },
      {
        ruleId: 'IG-CMP-004',
        severity: 'warning',
        file: 'docker-compose.yml',
        line: 2,
        message: 'no limits',
        remediation: 'add limits',
        tier: 'free',
      },
    ];

    const filtered = applyInlineIgnores(findings, files);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.ruleId).toBe('IG-DKR-003');
  });

  it('sorts findings by severity (error > warning > info), file, then line', () => {
    const unsorted: Finding[] = [
      {
        ruleId: 'IG-DKR-003',
        severity: 'info',
        file: 'a.Dockerfile',
        line: 1,
        message: '',
        remediation: '',
        tier: 'free',
      },
      {
        ruleId: 'IG-DKR-001',
        severity: 'warning',
        file: 'b.Dockerfile',
        line: 5,
        message: '',
        remediation: '',
        tier: 'free',
      },
      {
        ruleId: 'IG-TF-001',
        severity: 'error',
        file: 'z.tf',
        line: 10,
        message: '',
        remediation: '',
        tier: 'pro',
      },
      {
        ruleId: 'IG-DKR-002',
        severity: 'warning',
        file: 'b.Dockerfile',
        line: 1,
        message: '',
        remediation: '',
        tier: 'free',
      },
    ];

    const sorted = sortFindings(unsorted);
    expect(sorted.map((f) => `${f.severity}:${f.file}:${f.line}`)).toEqual([
      'error:z.tf:10',
      'warning:b.Dockerfile:1',
      'warning:b.Dockerfile:5',
      'info:a.Dockerfile:1',
    ]);
  });
});
