import { minimatch } from 'minimatch';
import { ChangedFile, Config, Finding, Severity, Tier } from '../types';

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function isPathIgnored(filename: string, ignorePaths: string[]): boolean {
  const normalized = filename.replace(/\\/g, '/').replace(/^\.\//, '');
  return ignorePaths.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}

export function applyConfigFilters(findings: Finding[], config: Config): Finding[] {
  const ignoredSet = new Set(config.ignore_rules.map((r) => r.toUpperCase()));

  return findings
    .filter((f) => !ignoredSet.has(f.ruleId.toUpperCase()))
    .map((f) => {
      const override = config.severity_overrides[f.ruleId.toUpperCase()];
      return override ? { ...f, severity: override } : f;
    });
}

export function computeTotalMonthlyCost(findings: Finding[]): number {
  return findings.reduce((sum, f) => sum + (f.monthlyCostUsd ?? 0), 0);
}

export function shouldFailBuild(
  findings: Finding[],
  failOnError: boolean,
  tier: Tier,
  failOnSeverity: 'error' | 'warning' = 'error',
): boolean {
  if (tier !== 'pro' || !failOnError) {
    return false;
  }
  const thresholdRank = SEVERITY_ORDER[failOnSeverity];
  return findings.some((f) => SEVERITY_ORDER[f.severity] <= thresholdRank);
}

const INLINE_IGNORE_RE = /#\s*infraguard:ignore(?:\s+([A-Z0-9,\s-]+))?/i;

export function parseInlineIgnores(content: string): Map<number, Set<string> | 'ALL'> {
  const map = new Map<number, Set<string> | 'ALL'>();
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? '';
    const match = INLINE_IGNORE_RE.exec(lineText);
    if (!match) {
      continue;
    }
    const rawIds = match[1]?.trim();
    if (!rawIds) {
      map.set(i + 1, 'ALL');
    } else {
      const ids = rawIds
        .split(/[\s,]+/)
        .map((id) => id.trim().toUpperCase())
        .filter((id) => /^IG-[A-Z]+-\d+$/.test(id));
      if (ids.length > 0) {
        map.set(i + 1, new Set(ids));
      } else {
        map.set(i + 1, 'ALL');
      }
    }
  }

  return map;
}

export function applyInlineIgnores(findings: Finding[], files: ChangedFile[]): Finding[] {
  const fileIgnores = new Map<string, Map<number, Set<string> | 'ALL'>>();
  for (const file of files) {
    fileIgnores.set(file.filename, parseInlineIgnores(file.content));
  }

  return findings.filter((finding) => {
    const ignores = fileIgnores.get(finding.file);
    if (!ignores) {
      return true;
    }
    const lineIgnore = ignores.get(finding.line);
    if (!lineIgnore) {
      return true;
    }
    if (lineIgnore === 'ALL') {
      return false;
    }
    return !lineIgnore.has(finding.ruleId.toUpperCase());
  });
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) {
      return sevDiff;
    }
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) {
      return fileDiff;
    }
    const lineDiff = a.line - b.line;
    if (lineDiff !== 0) {
      return lineDiff;
    }
    return a.ruleId.localeCompare(b.ruleId);
  });
}
