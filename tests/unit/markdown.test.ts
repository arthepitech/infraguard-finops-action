import { describe, expect, it } from 'vitest';
import {
  escapeCell,
  MAX_REPORT_LENGTH,
  renderMarkdownReport,
  REPORT_MARKER,
} from '../../src/report/markdown';
import { Finding } from '../../src/types';

const FIXED_DATE = new Date('2026-11-26T12:00:00Z');

describe('renderMarkdownReport', () => {
  it('escapes pipes and newlines in markdown table cells', () => {
    expect(escapeCell('a | b\nc')).toBe('a \\| b c');
  });

  it('matches snapshot for Free tier report with Docker findings and upsell', () => {
    const findings: Finding[] = [
      {
        ruleId: 'IG-DKR-001',
        severity: 'warning',
        file: 'Dockerfile',
        line: 1,
        message: 'Image de base non épinglée (`node:latest`).',
        remediation: 'Épinglez une version précise.',
        tier: 'free',
      },
      {
        ruleId: 'IG-DKR-003',
        severity: 'info',
        file: 'Dockerfile',
        line: 1,
        message: 'Aucun HEALTHCHECK défini.',
        remediation: 'Ajoutez HEALTHCHECK.',
        tier: 'free',
      },
    ];

    const md = renderMarkdownReport({
      tier: 'free',
      licenseVerified: true,
      filesAnalyzed: 2,
      findings,
      version: '0.1.0',
      now: FIXED_DATE,
    });

    expect(md.startsWith(REPORT_MARKER)).toBe(true);
    expect(md).toContain('### 🐳 Docker & Compose');
    expect(md).not.toContain('### ☁️ Terraform (Pro)');
    expect(md).not.toContain('### 🔑 Secrets exposés (Pro)');
    expect(md).toContain('InfraGuard Pro');
    expect(md).toMatchSnapshot();
  });

  it('matches snapshot for Pro tier report (with fail-open badge, Terraform, and Secrets)', () => {
    const findings: Finding[] = [
      {
        ruleId: 'IG-TF-001',
        severity: 'error',
        file: 'infra/main.tf',
        line: 12,
        message: 'Instance GPU/accélérée `p3.2xlarge` (~$2234/mois).',
        remediation: 'Préférez Spot ou une instance plus petite.',
        tier: 'pro',
        monthlyCostUsd: 2234,
        resource: 'aws_instance.gpu',
      },
      {
        ruleId: 'IG-SEC-001',
        severity: 'error',
        file: '.env',
        line: 3,
        message: 'Clé AWS exposée.',
        remediation: 'Révoquez la clé dans IAM.',
        tier: 'pro',
        resource: 'AKIA************XYZ1',
      },
    ];

    const md = renderMarkdownReport({
      tier: 'pro',
      licenseVerified: false,
      filesAnalyzed: 3,
      findings,
      ignoredRules: ['IG-DKR-003'],
      version: '0.1.0',
      now: FIXED_DATE,
    });

    expect(md).toContain('Pro (licence non vérifiée)');
    expect(md).toContain('≈ $2 234 /mois');
    expect(md).toContain('### ☁️ Terraform (Pro)');
    expect(md).toContain('### 🔑 Secrets exposés (Pro)');
    expect(md).not.toContain('Débloquez Terraform');
    expect(md).toMatchSnapshot();
  });

  it('renders clean zero-findings report and truncates oversized reports below 60 000 chars', () => {
    const clean = renderMarkdownReport({
      tier: 'free',
      licenseVerified: true,
      filesAnalyzed: 1,
      findings: [],
      now: FIXED_DATE,
    });
    expect(clean).toContain('✅ Aucun problème détecté');

    const manyFindings: Finding[] = Array.from({ length: 500 }, (_, i) => ({
      ruleId: 'IG-DKR-001',
      severity: 'warning',
      file: `services/service-${i}/Dockerfile`,
      line: i + 1,
      message: 'x'.repeat(100),
      remediation: 'y'.repeat(100),
      tier: 'free',
    }));

    const truncated = renderMarkdownReport({
      tier: 'free',
      licenseVerified: true,
      filesAnalyzed: 500,
      findings: manyFindings,
      now: FIXED_DATE,
    });
    expect(truncated.length).toBeLessThanOrEqual(MAX_REPORT_LENGTH);
    expect(truncated).toContain('autres findings masqués');
  });
});
