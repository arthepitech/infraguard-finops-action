import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCompose } from '../../src/analyzers/compose';

describe('analyzeCompose', () => {
  it('flags unpinned images, ${VAR:-latest}, and ignores unresolved vars or build-only (IG-CMP-001)', () => {
    const yamlContent = [
      'services:',
      '  web:',
      '    image: nginx:${NGINX_TAG:-latest}',
      '    user: "1000:1000"',
      '  dynamic:',
      '    image: myorg/app:${APP_TAG}',
      '    user: "1000:1000"',
      '  builder:',
      '    build: .',
      '    user: "1000:1000"',
    ].join('\n');

    const cmp001 = analyzeCompose('docker-compose.yml', yamlContent).filter(
      (f) => f.ruleId === 'IG-CMP-001',
    );
    expect(cmp001).toHaveLength(1);
    expect(cmp001[0]?.line).toBe(3);
    expect(cmp001[0]?.message).toContain('nginx:latest');
  });

  it('flags missing or root user, missing/disabled healthcheck, and missing/partial limits on bad.yml', () => {
    const bad = readFileSync(join(__dirname, '../fixtures/compose/bad.yml'), 'utf8');
    const findings = analyzeCompose('docker-compose.yml', bad);

    expect(findings.filter((f) => f.ruleId === 'IG-CMP-001')).toHaveLength(2);

    const cmp002 = findings.filter((f) => f.ruleId === 'IG-CMP-002');
    expect(cmp002).toHaveLength(2);
    expect(cmp002[0]?.line).toBe(2);
    expect(cmp002[1]?.line).toBe(9);

    const cmp003 = findings.filter((f) => f.ruleId === 'IG-CMP-003');
    expect(cmp003).toHaveLength(2);
    expect(cmp003[0]?.severity).toBe('info');
    expect(cmp003[1]?.line).toBe(10);

    const cmp004 = findings.filter((f) => f.ruleId === 'IG-CMP-004');
    expect(cmp004).toHaveLength(2);
    expect(cmp004[0]?.severity).toBe('warning'); // api: neither cpu nor memory
    expect(cmp004[1]?.severity).toBe('info'); // db: memory only, missing CPU
  });

  it('produces zero findings for good.yml and v2-legacy.yml and handles invalid YAML', () => {
    const good = readFileSync(join(__dirname, '../fixtures/compose/good.yml'), 'utf8');
    expect(analyzeCompose('docker-compose.yml', good)).toEqual([]);

    const v2 = readFileSync(join(__dirname, '../fixtures/compose/v2-legacy.yml'), 'utf8');
    expect(analyzeCompose('docker-compose.yml', v2)).toEqual([]);

    expect(analyzeCompose('docker-compose.yml', 'services: [invalid')).toEqual([]);
  });
});
