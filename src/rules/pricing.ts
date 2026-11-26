// Static on-demand Linux us-east-1 monthly estimates (730 h/month). Indicative only.
export const INSTANCE_MONTHLY_PRICES: Record<string, number> = {
  // GPU / Accelerated
  'p2.xlarge': 657,
  'p3.2xlarge': 2234,
  'p3.8xlarge': 8935,
  'p4d.24xlarge': 23924,
  'p5.48xlarge': 71774,
  'g3.4xlarge': 832,
  'g4dn.xlarge': 384,
  'g4dn.2xlarge': 549,
  'g5.xlarge': 734,
  'g5.2xlarge': 885,
  'g6.xlarge': 588,
  'inf1.xlarge': 166,
  'inf2.xlarge': 553,
  'trn1.2xlarge': 978,
  // General / Compute / Memory EC2
  'm5.xlarge': 140,
  'm5.2xlarge': 280,
  'm5.4xlarge': 561,
  'm5.8xlarge': 1122,
  'm5.12xlarge': 1682,
  'm6i.xlarge': 140,
  'c5.xlarge': 124,
  'c5.4xlarge': 496,
  'c6i.xlarge': 124,
  'r5.xlarge': 184,
  'r5.4xlarge': 736,
  't3.xlarge': 121,
  // RDS
  'db.t3.xlarge': 204,
  'db.m5.xlarge': 250,
  'db.m5.4xlarge': 1002,
  'db.m6i.xlarge': 250,
  'db.r5.xlarge': 365,
  'db.r5.4xlarge': 2190,
  'db.r6i.xlarge': 365,
};

export const SIZE_FACTORS: Record<string, number> = {
  nano: 0.0625,
  micro: 0.125,
  small: 0.25,
  medium: 0.5,
  large: 0.5,
  xlarge: 1,
  '2xlarge': 2,
  '4xlarge': 4,
  '8xlarge': 8,
  '12xlarge': 12,
  '16xlarge': 16,
  '24xlarge': 24,
  '32xlarge': 32,
  '48xlarge': 48,
  metal: 24,
};

export const VOLUME_PRICE_PER_GB: Record<string, number> = {
  gp2: 0.1,
  gp3: 0.08,
  io1: 0.125,
  io2: 0.125,
  st1: 0.045,
  sc1: 0.015,
};

export const RDS_STORAGE_PRICE_PER_GB = 0.115;

/**
 * Estimates monthly USD cost for an EC2 instance type or RDS instance class.
 * Returns null if the family has no known baseline price.
 */
export function estimateInstanceMonthlyCost(instanceType: string, count = 1): number | null {
  const normalized = instanceType.trim().toLowerCase();
  const safeCount = count > 0 ? count : 1;

  const exact = INSTANCE_MONTHLY_PRICES[normalized];
  if (exact !== undefined) {
    return Math.round(exact * safeCount);
  }

  const parts = normalized.split('.');
  if (parts.length < 2) {
    return null;
  }

  const size = parts[parts.length - 1] ?? '';
  const familyPrefix = parts.slice(0, -1).join('.');
  const factor = SIZE_FACTORS[size];
  const baseXlarge = INSTANCE_MONTHLY_PRICES[`${familyPrefix}.xlarge`];

  if (factor === undefined || baseXlarge === undefined) {
    return null;
  }

  return Math.round(baseXlarge * factor * safeCount);
}

/**
 * Estimates monthly USD excess cost for a volume larger than `thresholdGb`.
 */
export function estimateExcessVolumeCost(
  sizeGb: number,
  thresholdGb: number,
  volumeType = 'gp2',
  isRds = false,
): number {
  if (sizeGb <= thresholdGb) {
    return 0;
  }
  const pricePerGb = isRds
    ? RDS_STORAGE_PRICE_PER_GB
    : (VOLUME_PRICE_PER_GB[volumeType.trim().toLowerCase()] ?? VOLUME_PRICE_PER_GB.gp2!);

  return Math.round((sizeGb - thresholdGb) * pricePerGb);
}

/**
 * Estimates monthly USD savings when migrating a gp2 EBS volume to gp3.
 */
export function estimateGp2ToGp3Savings(sizeGb: number): number {
  if (sizeGb <= 0) {
    return 0;
  }
  const diff = (VOLUME_PRICE_PER_GB.gp2 ?? 0.1) - (VOLUME_PRICE_PER_GB.gp3 ?? 0.08);
  return Math.round(sizeGb * diff);
}
