import { FREE_RULES } from '../rules/free';
import { Finding } from '../types';
import { parseCompose } from './compose-parser';

function interpolateEnvDefaults(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}/g, '$2');
}

function isComposeImageUnpinned(image: string): boolean {
  if (!image) {
    return false;
  }
  if (image.includes('@sha256:')) {
    return false;
  }
  const lastSlash = image.lastIndexOf('/');
  const lastSegment = lastSlash === -1 ? image : image.slice(lastSlash + 1);
  const colonIdx = lastSegment.indexOf(':');
  if (colonIdx === -1) {
    return true;
  }
  const tag = lastSegment.slice(colonIdx + 1);
  return tag === '' || tag === 'latest';
}

function isRootUser(user: string): boolean {
  const userPart = user.trim().split(':')[0]?.trim().toLowerCase() ?? '';
  return userPart === 'root' || userPart === '0';
}

/**
 * Analyzes a docker-compose YAML file for Free-tier best practices.
 */
export function analyzeCompose(file: string, content: string): Finding[] {
  const parsed = parseCompose(content);
  if (!parsed.valid) {
    return [];
  }

  const findings: Finding[] = [];
  const rule001 = FREE_RULES['IG-CMP-001']!;
  const rule002 = FREE_RULES['IG-CMP-002']!;
  const rule003 = FREE_RULES['IG-CMP-003']!;
  const rule004 = FREE_RULES['IG-CMP-004']!;

  for (const svc of parsed.services) {
    if (svc.image !== undefined) {
      const resolvedImage = interpolateEnvDefaults(svc.image);
      const hasUnresolvedVar = /\$[A-Za-z_{]/.test(resolvedImage);

      if (!hasUnresolvedVar && isComposeImageUnpinned(resolvedImage)) {
        findings.push({
          ruleId: rule001.id,
          severity: rule001.severity,
          file,
          line: svc.imageLine ?? svc.line,
          message: `Service \`${svc.name}\` : image non épinglée (\`${resolvedImage}\`).`,
          remediation: rule001.remediation,
          tier: rule001.tier,
          resource: svc.name,
        });
      }
    }

    if (svc.image !== undefined || svc.hasBuild) {
      if (svc.user === undefined || isRootUser(svc.user)) {
        findings.push({
          ruleId: rule002.id,
          severity: rule002.severity,
          file,
          line: svc.userLine ?? svc.line,
          message: `Service \`${svc.name}\` s'exécute en root.`,
          remediation: rule002.remediation,
          tier: rule002.tier,
          resource: svc.name,
        });
      }

      // IG-CMP-003: healthcheck
      if (!svc.hasHealthcheck || svc.healthcheckDisabled) {
        findings.push({
          ruleId: rule003.id,
          severity: rule003.severity,
          file,
          line: svc.healthcheckLine ?? svc.line,
          message: `Service \`${svc.name}\` sans healthcheck.`,
          remediation: rule003.remediation,
          tier: rule003.tier,
          resource: svc.name,
        });
      }

      // IG-CMP-004: CPU & Memory limits
      if (!svc.hasCpuLimit && !svc.hasMemoryLimit) {
        findings.push({
          ruleId: rule004.id,
          severity: 'warning',
          file,
          line: svc.line,
          message: `Service \`${svc.name}\` sans limites CPU/RAM.`,
          remediation: rule004.remediation,
          tier: rule004.tier,
          resource: svc.name,
        });
      } else if (!svc.hasCpuLimit || !svc.hasMemoryLimit) {
        const missing = !svc.hasCpuLimit ? 'CPU' : 'RAM';
        findings.push({
          ruleId: rule004.id,
          severity: 'info',
          file,
          line: svc.line,
          message: `Service \`${svc.name}\` sans limite ${missing}.`,
          remediation: rule004.remediation,
          tier: rule004.tier,
          resource: svc.name,
        });
      }
    }
  }

  return findings;
}
