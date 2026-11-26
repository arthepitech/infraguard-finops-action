import { FREE_RULES } from '../rules/free';
import { Finding } from '../types';
import { parseDockerfile } from './dockerfile-parser';

function resolveDockerArgs(value: string, argDefaults: Map<string, string>): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (
      match,
      bracedName: string | undefined,
      fallback: string | undefined,
      plainName: string | undefined,
    ) => {
      const name = bracedName ?? plainName ?? '';
      const resolved = argDefaults.get(name);
      if (resolved !== undefined) {
        return resolved;
      }
      if (fallback !== undefined) {
        return fallback;
      }
      return match;
    },
  );
}

function isImageUnpinned(image: string): boolean {
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

/**
 * Analyzes a Dockerfile for Free-tier best practices.
 */
export function analyzeDockerfile(file: string, content: string): Finding[] {
  const parsed = parseDockerfile(content);
  const findings: Finding[] = [];

  const argDefaults = new Map<string, string>();
  for (const arg of parsed.globalArgs) {
    if (arg.defaultValue !== undefined) {
      argDefaults.set(arg.name, arg.defaultValue);
    }
  }

  const stageAliases = new Set<string>();
  const rule001 = FREE_RULES['IG-DKR-001']!;

  for (const stage of parsed.stages) {
    const resolvedImage = resolveDockerArgs(stage.image, argDefaults);
    const lowerImage = resolvedImage.toLowerCase();

    const isScratch = lowerImage === 'scratch';
    const isStageAlias = stageAliases.has(lowerImage);
    const hasUnresolvedVar = /\$[A-Za-z_{]/.test(resolvedImage);

    if (!isScratch && !isStageAlias && !hasUnresolvedVar && isImageUnpinned(resolvedImage)) {
      findings.push({
        ruleId: rule001.id,
        severity: rule001.severity,
        file,
        line: stage.fromLine,
        message: `Image de base non épinglée (\`${resolvedImage}\`).`,
        remediation: rule001.remediation,
        tier: rule001.tier,
      });
    }

    if (stage.alias) {
      stageAliases.add(stage.alias.toLowerCase());
    }
  }

  const finalStage = parsed.stages[parsed.stages.length - 1];
  if (finalStage) {
    const finalResolvedImage = resolveDockerArgs(finalStage.image, argDefaults).toLowerCase();
    const isFinalScratch = finalResolvedImage === 'scratch';

    // IG-DKR-002: Final stage must have a non-root USER
    const userInstructions = finalStage.instructions.filter((ins) => ins.instruction === 'USER');
    const lastUser = userInstructions[userInstructions.length - 1];
    const rule002 = FREE_RULES['IG-DKR-002']!;

    const isRootUser = (args: string): boolean => {
      const userPart = args.trim().split(':')[0]?.trim().toLowerCase() ?? '';
      return userPart === 'root' || userPart === '0';
    };

    if (!lastUser) {
      findings.push({
        ruleId: rule002.id,
        severity: rule002.severity,
        file,
        line: finalStage.fromLine,
        message: rule002.message,
        remediation: rule002.remediation,
        tier: rule002.tier,
      });
    } else if (isRootUser(lastUser.args)) {
      findings.push({
        ruleId: rule002.id,
        severity: rule002.severity,
        file,
        line: lastUser.line,
        message: rule002.message,
        remediation: rule002.remediation,
        tier: rule002.tier,
      });
    }

    // IG-DKR-003: Final stage must define HEALTHCHECK (unless FROM scratch)
    if (!isFinalScratch) {
      const healthchecks = finalStage.instructions.filter(
        (ins) => ins.instruction === 'HEALTHCHECK',
      );
      const lastHealthcheck = healthchecks[healthchecks.length - 1];
      const rule003 = FREE_RULES['IG-DKR-003']!;

      if (!lastHealthcheck) {
        findings.push({
          ruleId: rule003.id,
          severity: rule003.severity,
          file,
          line: finalStage.fromLine,
          message: rule003.message,
          remediation: rule003.remediation,
          tier: rule003.tier,
        });
      } else if (/^NONE\b/i.test(lastHealthcheck.args.trim())) {
        findings.push({
          ruleId: rule003.id,
          severity: rule003.severity,
          file: file,
          line: lastHealthcheck.line,
          message: rule003.message,
          remediation: rule003.remediation,
          tier: rule003.tier,
        });
      }
    }
  }

  return findings;
}
