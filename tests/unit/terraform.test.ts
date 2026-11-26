import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeTerraform } from '../../src/analyzers/terraform';

describe('analyzeTerraform - IG-TF-001 & IG-TF-002', () => {
  it('flags GPU instances with cost multiplied by count and handles unknown GPU prices (IG-TF-001)', () => {
    const content = readFileSync(join(__dirname, '../fixtures/terraform/gpu.tf'), 'utf8');
    const findings = analyzeTerraform('gpu.tf', content);

    const tf001 = findings.filter((f) => f.ruleId === 'IG-TF-001');
    expect(tf001).toHaveLength(2);
    expect(tf001[0]?.severity).toBe('error');
    expect(tf001[0]?.resource).toBe('aws_instance.ml_worker');
    expect(tf001[0]?.monthlyCostUsd).toBe(4468); // 2234 * 2
    expect(tf001[0]?.message).toContain('~$4468/mois');

    expect(tf001[1]?.resource).toBe('aws_instance.unknown_gpu');
    expect(tf001[1]?.monthlyCostUsd).toBeUndefined();
    expect(tf001[1]?.message).toContain('n/d');
  });

  it('flags large fixed EC2 instances without ASG and ignores launch templates referenced by ASG (IG-TF-002)', () => {
    const content = readFileSync(join(__dirname, '../fixtures/terraform/ec2-large-asg.tf'), 'utf8');
    const findings = analyzeTerraform('ec2.tf', content);

    const tf002 = findings.filter((f) => f.ruleId === 'IG-TF-002');
    expect(tf002).toHaveLength(1);
    expect(tf002[0]?.severity).toBe('warning');
    expect(tf002[0]?.resource).toBe('aws_instance.fixed_big');
    expect(tf002[0]?.monthlyCostUsd).toBe(561);
  });

  it('flags large RDS instances without max_allocated_storage (IG-TF-003)', () => {
    const content = readFileSync(join(__dirname, '../fixtures/terraform/rds-large.tf'), 'utf8');
    const findings = analyzeTerraform('rds.tf', content);

    const tf003 = findings.filter((f) => f.ruleId === 'IG-TF-003');
    expect(tf003).toHaveLength(1);
    expect(tf003[0]?.severity).toBe('warning');
    expect(tf003[0]?.resource).toBe('aws_db_instance.analytics_unscaled');
    expect(tf003[0]?.monthlyCostUsd).toBe(2190);
    expect(tf003[0]?.message).toContain('~$2190/mois');
  });

  it('flags unencrypted storage, oversized volumes, and gp2 volumes (IG-TF-004, 005, 006)', () => {
    const content = readFileSync(
      join(__dirname, '../fixtures/terraform/ebs-unencrypted.tf'),
      'utf8',
    );
    const findings = analyzeTerraform('ebs.tf', content);

    const tf004 = findings.filter((f) => f.ruleId === 'IG-TF-004');
    expect(tf004).toHaveLength(3);
    expect(tf004.every((f) => f.severity === 'error')).toBe(true);

    const tf005 = findings.filter((f) => f.ruleId === 'IG-TF-005');
    expect(tf005).toHaveLength(2);
    // 1000 Go gp2 -> (1000-500)*0.10 = 50
    expect(tf005[0]?.monthlyCostUsd).toBe(50);
    // 1500 Go RDS -> (1500-500)*0.115 = 115
    expect(tf005[1]?.monthlyCostUsd).toBe(115);

    const tf006 = findings.filter((f) => f.ruleId === 'IG-TF-006');
    expect(tf006).toHaveLength(2);
    expect(tf006.every((f) => f.severity === 'info')).toBe(true);
  });

  it('covers Aurora cluster scaling, ebs_block_device, custom thresholds, and unknown sizes', () => {
    const auroraUnscaled = `
resource "aws_rds_cluster_instance" "writer" {
  cluster_identifier = "my-cluster"
  instance_class     = "db.r5.4xlarge"
}
`;
    expect(
      analyzeTerraform('aurora.tf', auroraUnscaled).some((f) => f.ruleId === 'IG-TF-003'),
    ).toBe(true);

    const auroraScaled = `
resource "aws_rds_cluster_instance" "writer" {
  cluster_identifier = "my-cluster"
  instance_class     = "db.r5.4xlarge"
}
resource "aws_appautoscaling_target" "replicas" {
  resource_id = "cluster:my-cluster"
}
`;
    expect(analyzeTerraform('aurora.tf', auroraScaled)).toEqual([]);

    const ebsBlockAndUnknownSize = `
resource "aws_instance" "custom" {
  instance_type = "m5.weirdsize"
  ebs_block_device {
    volume_size = 700
    volume_type = "io2"
  }
}
`;
    const res = analyzeTerraform('custom.tf', ebsBlockAndUnknownSize, {
      thresholds: { max_volume_gb: 600 },
    });
    expect(res.some((f) => f.ruleId === 'IG-TF-004')).toBe(true);
    expect(res.some((f) => f.ruleId === 'IG-TF-005')).toBe(true);
    expect(res.some((f) => f.ruleId === 'IG-TF-002')).toBe(false);
  });

  it('returns zero findings on clean.tf', () => {
    const clean = readFileSync(join(__dirname, '../fixtures/terraform/clean.tf'), 'utf8');
    expect(analyzeTerraform('clean.tf', clean)).toEqual([]);
  });
});
