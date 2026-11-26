import * as core from '@actions/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitAnnotations, MAX_ANNOTATIONS } from '../../src/report/annotations';
import { Finding } from '../../src/types';

vi.mock('@actions/core', () => ({
  error: vi.fn(),
  warning: vi.fn(),
  notice: vi.fn(),
}));

describe('emitAnnotations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps error, warning, and info findings to core.error, core.warning, and core.notice', () => {
    const findings: Finding[] = [
      {
        ruleId: 'IG-TF-001',
        severity: 'error',
        file: 'main.tf',
        line: 10,
        endLine: 15,
        message: 'GPU instance',
        remediation: 'Use smaller',
        tier: 'pro',
      },
      {
        ruleId: 'IG-DKR-001',
        severity: 'warning',
        file: 'Dockerfile',
        line: 1,
        message: 'Unpinned',
        remediation: 'Pin tag',
        tier: 'free',
      },
      {
        ruleId: 'IG-DKR-003',
        severity: 'info',
        file: 'Dockerfile',
        line: 1,
        message: 'No healthcheck',
        remediation: 'Add healthcheck',
        tier: 'free',
      },
    ];

    emitAnnotations(findings);

    expect(core.error).toHaveBeenCalledWith('[IG-TF-001] GPU instance — Use smaller', {
      title: 'InfraGuard IG-TF-001',
      file: 'main.tf',
      startLine: 10,
      endLine: 15,
    });
    expect(core.warning).toHaveBeenCalledWith('[IG-DKR-001] Unpinned — Pin tag', {
      title: 'InfraGuard IG-DKR-001',
      file: 'Dockerfile',
      startLine: 1,
    });
    expect(core.notice).toHaveBeenCalledWith('[IG-DKR-003] No healthcheck — Add healthcheck', {
      title: 'InfraGuard IG-DKR-003',
      file: 'Dockerfile',
      startLine: 1,
    });
  });

  it('caps emitted annotations at 50 and logs a final notice for the remainder', () => {
    const many: Finding[] = Array.from({ length: 65 }, (_, i) => ({
      ruleId: 'IG-DKR-001',
      severity: 'warning',
      file: `f-${i}/Dockerfile`,
      line: 1,
      message: 'msg',
      remediation: 'rem',
      tier: 'free',
    }));

    emitAnnotations(many);

    expect(core.warning).toHaveBeenCalledTimes(MAX_ANNOTATIONS);
    expect(core.notice).toHaveBeenCalledTimes(1);
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('15 annotations'));
  });
});
