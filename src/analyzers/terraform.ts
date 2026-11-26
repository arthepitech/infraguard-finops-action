import {
  estimateExcessVolumeCost,
  estimateGp2ToGp3Savings,
  estimateInstanceMonthlyCost,
} from '../rules/pricing';
import { PRO_RULES } from '../rules/pro';
import { Finding, ThresholdsConfig } from '../types';
import { parseTerraform, TfResource } from './terraform-parser';

const GPU_FAMILIES = new Set([
  'p2',
  'p3',
  'p4d',
  'p4de',
  'p5',
  'g3',
  'g4dn',
  'g4ad',
  'g5',
  'g5g',
  'g6',
  'inf1',
  'inf2',
  'trn1',
  'trn1n',
  'dl1',
  'dl2q',
  'f1',
  'vt1',
]);

const SIZE_ORDER = [
  'nano',
  'micro',
  'small',
  'medium',
  'large',
  'xlarge',
  '2xlarge',
  '4xlarge',
  '8xlarge',
  '12xlarge',
  '16xlarge',
  '24xlarge',
  '32xlarge',
  '48xlarge',
  'metal',
];

const EC2_RESOURCE_TYPES = new Set([
  'aws_instance',
  'aws_launch_template',
  'aws_launch_configuration',
]);

export interface TerraformAnalyzeOptions {
  thresholds?: Partial<ThresholdsConfig>;
  allResources?: TfResource[];
}

function sizeRank(size: string): number {
  return SIZE_ORDER.indexOf(size.trim().toLowerCase());
}

function isSizeAtLeast(instanceType: string, minSize: string): boolean {
  const parts = instanceType.trim().toLowerCase().split('.');
  const size = parts[parts.length - 1] ?? '';
  const rank = sizeRank(size);
  const minRank = sizeRank(minSize);
  if (rank === -1 || minRank === -1) {
    return false;
  }
  return rank >= minRank;
}

function isGpuInstance(instanceType: string): boolean {
  const family = instanceType.trim().toLowerCase().split('.')[0] ?? '';
  return GPU_FAMILIES.has(family);
}

function formatCost(cost: number | null): string {
  if (cost === null) {
    return 'n/d';
  }
  return `~$${cost}/mois`;
}

function getNumericCount(res: TfResource): number {
  const countVal = res.attributes.count?.value;
  if (typeof countVal === 'number' && Number.isInteger(countVal) && countVal > 0) {
    return countVal;
  }
  return 1;
}

function isReferencedByAsg(res: TfResource, allResources: TfResource[]): boolean {
  if (res.type === 'aws_instance') {
    return false;
  }
  const refPrefix = `${res.type}.${res.name}.`;
  return allResources.some(
    (other) => other.type === 'aws_autoscaling_group' && other.rawBody.includes(refPrefix),
  );
}

function isAuroraAutoscaled(res: TfResource, allResources: TfResource[]): boolean {
  const clusterId = res.attributes.cluster_identifier?.raw ?? '';
  return allResources.some((other) => {
    if (other.type !== 'aws_appautoscaling_target') {
      return false;
    }
    const resourceIdRaw = other.attributes.resource_id?.raw ?? '';
    if (clusterId && resourceIdRaw.includes(clusterId.replace(/"/g, ''))) {
      return true;
    }
    return other.rawBody.includes('rds:cluster:');
  });
}

/**
 * Analyzes a Terraform `.tf` file for Pro-tier FinOps & security rules.
 */
export function analyzeTerraform(
  file: string,
  content: string,
  options: TerraformAnalyzeOptions = {},
): Finding[] {
  const parsed = parseTerraform(content);
  const allResources = options.allResources ?? parsed.resources;
  const ec2MinSize = options.thresholds?.ec2_min_size ?? '4xlarge';
  const rdsMinSize = options.thresholds?.rds_min_size ?? '4xlarge';
  const maxVolumeGb = options.thresholds?.max_volume_gb ?? 500;

  const findings: Finding[] = [];
  const rule001 = PRO_RULES['IG-TF-001']!;
  const rule002 = PRO_RULES['IG-TF-002']!;
  const rule003 = PRO_RULES['IG-TF-003']!;
  const rule004 = PRO_RULES['IG-TF-004']!;
  const rule005 = PRO_RULES['IG-TF-005']!;
  const rule006 = PRO_RULES['IG-TF-006']!;

  for (const res of parsed.resources) {
    if (EC2_RESOURCE_TYPES.has(res.type)) {
      const instanceTypeAttr = res.attributes.instance_type;
      if (instanceTypeAttr && typeof instanceTypeAttr.value === 'string') {
        const instanceType = instanceTypeAttr.value;
        const count = getNumericCount(res);
        const monthlyCost = estimateInstanceMonthlyCost(instanceType, count);
        const resourceLabel = `${res.type}.${res.name}`;

        if (isGpuInstance(instanceType)) {
          findings.push({
            ruleId: rule001.id,
            severity: rule001.severity,
            file,
            line: instanceTypeAttr.line,
            message: `Instance GPU/accélérée \`${instanceType}\` (${formatCost(monthlyCost)}).`,
            remediation: rule001.remediation,
            tier: rule001.tier,
            monthlyCostUsd: monthlyCost ?? undefined,
            resource: resourceLabel,
          });
        } else if (
          isSizeAtLeast(instanceType, ec2MinSize) &&
          !isReferencedByAsg(res, allResources)
        ) {
          findings.push({
            ruleId: rule002.id,
            severity: rule002.severity,
            file,
            line: instanceTypeAttr.line,
            message: `Instance \`${instanceType}\` fixe sans scaling (${formatCost(monthlyCost)}).`,
            remediation: rule002.remediation,
            tier: rule002.tier,
            monthlyCostUsd: monthlyCost ?? undefined,
            resource: resourceLabel,
          });
        }
      }
    }

    if (res.type === 'aws_db_instance' || res.type === 'aws_rds_cluster_instance') {
      const classAttr = res.attributes.instance_class;
      if (classAttr && typeof classAttr.value === 'string') {
        const instanceClass = classAttr.value;
        const isLarge = isSizeAtLeast(instanceClass, rdsMinSize);
        const hasScaling =
          res.type === 'aws_db_instance'
            ? res.attributes.max_allocated_storage !== undefined
            : isAuroraAutoscaled(res, allResources);

        if (isLarge && !hasScaling) {
          const count = getNumericCount(res);
          const monthlyCost = estimateInstanceMonthlyCost(instanceClass, count);
          findings.push({
            ruleId: rule003.id,
            severity: rule003.severity,
            file,
            line: classAttr.line,
            message: `RDS \`${instanceClass}\` surdimensionné sans scaling (${formatCost(monthlyCost)}).`,
            remediation: rule003.remediation,
            tier: rule003.tier,
            monthlyCostUsd: monthlyCost ?? undefined,
            resource: `${res.type}.${res.name}`,
          });
        }
      }

      if (res.type === 'aws_db_instance') {
        const resourceLabel = `${res.type}.${res.name}`;
        // IG-TF-004: RDS storage_encrypted
        if (res.attributes.storage_encrypted?.value !== true) {
          findings.push({
            ruleId: rule004.id,
            severity: rule004.severity,
            file,
            line: res.attributes.storage_encrypted?.line ?? res.line,
            message: `Stockage \`${resourceLabel}\` non chiffré.`,
            remediation: rule004.remediation,
            tier: rule004.tier,
            resource: resourceLabel,
          });
        }

        // IG-TF-005: RDS allocated_storage > maxVolumeGb
        const allocAttr = res.attributes.allocated_storage;
        if (allocAttr && typeof allocAttr.value === 'number' && allocAttr.value > maxVolumeGb) {
          const excessCost = estimateExcessVolumeCost(allocAttr.value, maxVolumeGb, 'gp2', true);
          findings.push({
            ruleId: rule005.id,
            severity: rule005.severity,
            file,
            line: allocAttr.line,
            message: `Disque \`${allocAttr.value}\` Go (> ${maxVolumeGb} Go, +$${excessCost}/mois).`,
            remediation: rule005.remediation,
            tier: rule005.tier,
            monthlyCostUsd: excessCost,
            resource: resourceLabel,
          });
        }
      }
    }

    // IG-TF-004 / 005 / 006 on standalone aws_ebs_volume
    if (res.type === 'aws_ebs_volume') {
      const resourceLabel = `${res.type}.${res.name}`;
      if (res.attributes.encrypted?.value !== true) {
        findings.push({
          ruleId: rule004.id,
          severity: rule004.severity,
          file,
          line: res.attributes.encrypted?.line ?? res.line,
          message: `Stockage \`${resourceLabel}\` non chiffré.`,
          remediation: rule004.remediation,
          tier: rule004.tier,
          resource: resourceLabel,
        });
      }

      const volType =
        typeof res.attributes.type?.value === 'string' ? res.attributes.type.value : 'gp2';
      const sizeAttr = res.attributes.size;
      const sizeGb = sizeAttr && typeof sizeAttr.value === 'number' ? sizeAttr.value : 0;

      if (sizeAttr && sizeGb > maxVolumeGb) {
        const excessCost = estimateExcessVolumeCost(sizeGb, maxVolumeGb, volType, false);
        findings.push({
          ruleId: rule005.id,
          severity: rule005.severity,
          file,
          line: sizeAttr.line,
          message: `Disque \`${sizeGb}\` Go (> ${maxVolumeGb} Go, +$${excessCost}/mois).`,
          remediation: rule005.remediation,
          tier: rule005.tier,
          monthlyCostUsd: excessCost,
          resource: resourceLabel,
        });
      }

      if (volType.toLowerCase() === 'gp2') {
        const savings = estimateGp2ToGp3Savings(sizeGb);
        findings.push({
          ruleId: rule006.id,
          severity: rule006.severity,
          file,
          line: res.attributes.type?.line ?? res.line,
          message: `gp2 est ~20 % plus cher que gp3${savings > 0 ? ` (économie ≈ $${savings}/mois)` : ''}.`,
          remediation: rule006.remediation,
          tier: rule006.tier,
          resource: resourceLabel,
        });
      }
    }

    // IG-TF-004 / 005 / 006 on nested root_block_device / ebs_block_device
    if (EC2_RESOURCE_TYPES.has(res.type)) {
      const resourceLabel = `${res.type}.${res.name}`;
      for (const block of res.blocks) {
        if (block.type !== 'root_block_device' && block.type !== 'ebs_block_device') {
          continue;
        }
        if (block.attributes.encrypted?.value !== true) {
          findings.push({
            ruleId: rule004.id,
            severity: rule004.severity,
            file,
            line: block.attributes.encrypted?.line ?? block.line,
            message: `Stockage \`${resourceLabel}.${block.type}\` non chiffré.`,
            remediation: rule004.remediation,
            tier: rule004.tier,
            resource: resourceLabel,
          });
        }

        const volType =
          typeof block.attributes.volume_type?.value === 'string'
            ? block.attributes.volume_type.value
            : 'gp2';
        const sizeAttr = block.attributes.volume_size;
        const sizeGb = sizeAttr && typeof sizeAttr.value === 'number' ? sizeAttr.value : 0;

        if (sizeAttr && sizeGb > maxVolumeGb) {
          const excessCost = estimateExcessVolumeCost(sizeGb, maxVolumeGb, volType, false);
          findings.push({
            ruleId: rule005.id,
            severity: rule005.severity,
            file,
            line: sizeAttr.line,
            message: `Disque \`${sizeGb}\` Go (> ${maxVolumeGb} Go, +$${excessCost}/mois).`,
            remediation: rule005.remediation,
            tier: rule005.tier,
            monthlyCostUsd: excessCost,
            resource: resourceLabel,
          });
        }

        if (block.type === 'root_block_device' && volType.toLowerCase() === 'gp2') {
          const savings = estimateGp2ToGp3Savings(sizeGb);
          findings.push({
            ruleId: rule006.id,
            severity: rule006.severity,
            file,
            line: block.attributes.volume_type?.line ?? block.line,
            message: `gp2 est ~20 % plus cher que gp3${savings > 0 ? ` (économie ≈ $${savings}/mois)` : ''}.`,
            remediation: rule006.remediation,
            tier: rule006.tier,
            resource: resourceLabel,
          });
        }
      }
    }
  }

  return findings;
}
