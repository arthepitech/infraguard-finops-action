import { describe, expect, it } from 'vitest';
import { FREE_RULES, FREE_RULE_LIST } from '../../src/rules/free';

describe('FREE_RULES catalog', () => {
  it('contains all expected Free rule IDs', () => {
    const expectedIds = [
      'IG-DKR-001',
      'IG-DKR-002',
      'IG-DKR-003',
      'IG-CMP-001',
      'IG-CMP-002',
      'IG-CMP-003',
      'IG-CMP-004',
    ];
    expect(Object.keys(FREE_RULES).sort()).toEqual(expectedIds.sort());
  });

  it('has unique IDs, free tier, and non-empty fields', () => {
    const ids = FREE_RULE_LIST.map((r) => r.id);
    expect(new Set(ids).size).toBe(FREE_RULE_LIST.length);

    for (const rule of FREE_RULE_LIST) {
      expect(rule.tier).toBe('free');
      expect(['info', 'warning', 'error']).toContain(rule.severity);
      expect(rule.message.trim().length).toBeGreaterThan(0);
      expect(rule.remediation.trim().length).toBeGreaterThan(0);
    }
  });
});
