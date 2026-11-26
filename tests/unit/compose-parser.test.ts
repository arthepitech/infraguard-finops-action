import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCompose } from '../../src/analyzers/compose-parser';

describe('parseCompose', () => {
  it('parses services, line numbers and YAML anchors/merge keys', () => {
    const content = readFileSync(join(__dirname, '../fixtures/compose/good.yml'), 'utf8');
    const parsed = parseCompose(content);

    expect(parsed.valid).toBe(true);
    expect(parsed.services).toHaveLength(2);

    const web = parsed.services[0];
    expect(web?.name).toBe('web');
    expect(web?.line).toBe(10);
    expect(web?.image).toBe('nginx:1.25.4-alpine');
    expect(web?.imageLine).toBe(12);
    expect(web?.user).toBe('1000:1000');
    expect(web?.hasHealthcheck).toBe(true);
    expect(web?.hasCpuLimit).toBe(true);
    expect(web?.hasMemoryLimit).toBe(true);

    const worker = parsed.services[1];
    expect(worker?.name).toBe('worker');
    expect(worker?.hasBuild).toBe(true);
    expect(worker?.image).toBeUndefined();
  });

  it('supports compose v2 legacy cpus/mem_limit and bad.yml fields', () => {
    const v2 = readFileSync(join(__dirname, '../fixtures/compose/v2-legacy.yml'), 'utf8');
    const parsedV2 = parseCompose(v2);
    expect(parsedV2.valid).toBe(true);
    expect(parsedV2.services[0]?.hasCpuLimit).toBe(true);
    expect(parsedV2.services[0]?.hasMemoryLimit).toBe(true);

    const bad = readFileSync(join(__dirname, '../fixtures/compose/bad.yml'), 'utf8');
    const parsedBad = parseCompose(bad);
    expect(parsedBad.valid).toBe(true);
    const db = parsedBad.services[1];
    expect(db?.name).toBe('db');
    expect(db?.user).toBe('root');
    expect(db?.userLine).toBe(9);
    expect(db?.healthcheckDisabled).toBe(true);
    expect(db?.hasCpuLimit).toBe(false);
    expect(db?.hasMemoryLimit).toBe(true);
  });

  it('does not crash on invalid or empty YAML', () => {
    expect(parseCompose('')).toEqual({ valid: true, services: [] });
    const invalid = parseCompose('services:\n  web:\n    image: [unclosed');
    expect(invalid.valid).toBe(false);
    expect(invalid.services).toEqual([]);
  });
});
