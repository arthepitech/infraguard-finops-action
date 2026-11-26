import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSecrets, maskSecret } from '../../src/analyzers/secrets';

describe('analyzeSecrets', () => {
  it('masks secrets safely', () => {
    expect(maskSecret('AKIA9876543210ABCDEF')).toBe('AKIA************CDEF');
    expect(maskSecret('short')).toBe('****');
  });

  it('detects all 5 providers and never exposes raw values', () => {
    const rawLeaks = readFileSync(join(__dirname, '../fixtures/secrets/leaks.env.txt'), 'utf8');
    const leaks = rawLeaks.replace(
      '{{STRIPE_LIVE}}',
      'sk_live_' + '51AbCdEfGhIjKlMnOpQrStUvWxYz12',
    );
    const findings = analyzeSecrets('.env', leaks);

    const ruleIds = findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('IG-SEC-001');
    expect(ruleIds).toContain('IG-SEC-002');
    expect(ruleIds).toContain('IG-SEC-003');
    expect(ruleIds).toContain('IG-SEC-004');
    expect(ruleIds).toContain('IG-SEC-005');

    // Ensure no raw secret appears in any finding
    for (const line of leaks.split('\n')) {
      const val = line.split('=')[1]?.replace(/"/g, '').trim();
      if (val) {
        for (const f of findings) {
          expect(f.message).not.toContain(val);
          expect(f.resource).not.toContain(val);
        }
      }
    }
  });

  it('ignores false positives and infraguard:ignore lines', () => {
    const rawFp = readFileSync(join(__dirname, '../fixtures/secrets/false-positives.txt'), 'utf8');
    const fp = rawFp.replace(
      '{{STRIPE_FALSE_POSITIVE}}',
      'sk_live_' + 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    );
    expect(analyzeSecrets('.env.example', fp)).toEqual([]);
  });

  it('scans only added lines when a PR patch is provided and downgrades markdown code blocks to info', () => {
    const stripeTestKey = 'sk_test_' + '51AbCdEfGhIjKlMnOpQrStUvWxYz12';
    const patch = [
      '@@ -10,4 +10,5 @@',
      ' AWS_ACCESS_KEY_ID=AKIA9876543210ABCDEF',
      '-OLD_KEY=ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
      `+NEW_STRIPE_TEST=${stripeTestKey}`,
      ' unchanged=true',
    ].join('\n');

    const findings = analyzeSecrets('config.env', '', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('IG-SEC-004');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.line).toBe(11);

    const mdContent = [
      '# Docs',
      '```bash',
      'export GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
      '```',
    ].join('\n');
    const mdFindings = analyzeSecrets('README.md', mdContent);
    expect(mdFindings).toHaveLength(1);
    expect(mdFindings[0]?.severity).toBe('info');
  });
});
