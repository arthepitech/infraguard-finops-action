import { describe, expect, it } from 'vitest';
import {
  estimateExcessVolumeCost,
  estimateGp2ToGp3Savings,
  estimateInstanceMonthlyCost,
} from '../../src/rules/pricing';
import { PRO_RULES } from '../../src/rules/pro';

describe('PRO_RULES & pricing', () => {
  it('defines all Pro rule IDs', () => {
    const expected = [
      'IG-TF-001',
      'IG-TF-002',
      'IG-TF-003',
      'IG-TF-004',
      'IG-TF-005',
      'IG-TF-006',
      'IG-SEC-001',
      'IG-SEC-002',
      'IG-SEC-003',
      'IG-SEC-004',
      'IG-SEC-005',
      'IG-FIN-001',
    ];
    expect(Object.keys(PRO_RULES).sort()).toEqual(expected.sort());
  });

  it('returns known instance prices and multiplies by count', () => {
    expect(estimateInstanceMonthlyCost('p3.2xlarge')).toBe(2234);
    expect(estimateInstanceMonthlyCost('m5.4xlarge', 2)).toBe(1122);
    expect(estimateInstanceMonthlyCost('db.r5.4xlarge')).toBe(2190);
  });

  it('scales unknown sizes from family xlarge baseline or returns null for unknown families', () => {
    // c5.xlarge = 124, 8xlarge factor = 8 -> 992
    expect(estimateInstanceMonthlyCost('c5.8xlarge')).toBe(992);
    // db.m6i.xlarge = 250, 4xlarge factor = 4 -> 1000
    expect(estimateInstanceMonthlyCost('db.m6i.4xlarge')).toBe(1000);
    // Unknown family or malformed instance type
    expect(estimateInstanceMonthlyCost('z99.4xlarge')).toBeNull();
    expect(estimateInstanceMonthlyCost('malformed')).toBeNull();
  });

  it('calculates excess volume cost and gp2->gp3 savings', () => {
    // (1000 - 500) * 0.10 = 50
    expect(estimateExcessVolumeCost(1000, 500, 'gp2')).toBe(50);
    // (1000 - 500) * 0.08 = 40
    expect(estimateExcessVolumeCost(1000, 500, 'gp3')).toBe(40);
    // Unknown volume type falls back to gp2 (0.10)
    expect(estimateExcessVolumeCost(1000, 500, 'unknown')).toBe(50);
    // (1500 - 500) * 0.115 = 115
    expect(estimateExcessVolumeCost(1500, 500, 'gp2', true)).toBe(115);
    expect(estimateExcessVolumeCost(400, 500, 'gp2')).toBe(0);

    expect(estimateGp2ToGp3Savings(500)).toBe(10);
    expect(estimateGp2ToGp3Savings(0)).toBe(0);
  });
});
