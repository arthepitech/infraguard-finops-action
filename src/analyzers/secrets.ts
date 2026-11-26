import { PRO_RULES } from '../rules/pro';
import { Finding, Severity } from '../types';

interface SecretPattern {
  ruleId: string;
  regex: RegExp;
  severityOverride?: Severity;
  extractValue?: (match: RegExpExecArray) => string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    ruleId: 'IG-SEC-001',
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  {
    ruleId: 'IG-SEC-001',
    regex: /aws.{0,20}?(?:secret|sk).{0,20}?['"]([0-9a-zA-Z/+]{40})['"]/gi,
    extractValue: (m) => m[1] ?? m[0],
  },
  {
    ruleId: 'IG-SEC-002',
    regex: /\bsk-(?:proj-)?(?!ant-)[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    ruleId: 'IG-SEC-003',
    regex: /\bsk-ant-(?:api\d{2}-)?[A-Za-z0-9_-]{80,}\b/g,
  },
  {
    ruleId: 'IG-SEC-004',
    regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g,
  },
  {
    ruleId: 'IG-SEC-004',
    regex: /\b(?:sk|rk)_test_[0-9a-zA-Z]{24,}\b/g,
    severityOverride: 'warning',
  },
  {
    ruleId: 'IG-SEC-005',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g,
  },
];

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  const starCount = Math.min(12, secret.length - 8);
  return `${secret.slice(0, 4)}${'*'.repeat(starCount)}${secret.slice(-4)}`;
}

function isFalsePositive(value: string, lineText: string): boolean {
  if (/infraguard:ignore/i.test(lineText)) {
    return true;
  }
  if (value === 'AKIAIOSFODNN7EXAMPLE') {
    return true;
  }
  if (/example/i.test(value) || /xxxx/i.test(value) || /your_/i.test(value)) {
    return true;
  }
  if (/<[^>]+>|\$\{[^}]+\}/.test(value)) {
    return true;
  }
  return false;
}

interface AddedLine {
  lineNumber: number;
  text: string;
}

function extractAddedLinesFromPatch(patch: string): AddedLine[] {
  const result: AddedLine[] = [];
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  let currentNewLine = 0;

  for (const raw of lines) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunkMatch && hunkMatch[1]) {
      currentNewLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) {
      continue;
    }
    if (raw.startsWith('+')) {
      result.push({ lineNumber: currentNewLine, text: raw.slice(1) });
      currentNewLine++;
    } else if (!raw.startsWith('-')) {
      currentNewLine++;
    }
  }

  return result;
}

function getMarkdownCodeBlockLines(content: string): Set<number> {
  const inBlock = new Set<number>();
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let inside = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('```')) {
      inside = !inside;
      continue;
    }
    if (inside) {
      inBlock.add(i + 1);
    }
  }
  return inBlock;
}

/**
 * Scans added lines (from PR diff `patch`, or full `content` if `patch` is absent)
 * for exposed API keys/tokens. Masks all matched values.
 */
export function analyzeSecrets(file: string, content: string, patch?: string): Finding[] {
  const linesToScan: AddedLine[] =
    patch !== undefined
      ? extractAddedLinesFromPatch(patch)
      : content
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((text, idx) => ({ lineNumber: idx + 1, text }));

  const isMarkdown = file.toLowerCase().endsWith('.md');
  const mdCodeLines = isMarkdown ? getMarkdownCodeBlockLines(content) : new Set<number>();

  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const { lineNumber, text } of linesToScan) {
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = pattern.extractValue ? pattern.extractValue(match) : match[0];
        if (isFalsePositive(value, text)) {
          continue;
        }

        const dedupeKey = `${pattern.ruleId}:${file}:${lineNumber}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        const rule = PRO_RULES[pattern.ruleId]!;
        let severity: Severity = pattern.severityOverride ?? rule.severity;
        if (isMarkdown && mdCodeLines.has(lineNumber)) {
          severity = 'info';
        }

        const masked = maskSecret(value);
        findings.push({
          ruleId: rule.id,
          severity,
          file,
          line: lineNumber,
          message: `${rule.message} (\`${masked}\`)`,
          remediation: rule.remediation,
          tier: rule.tier,
          resource: masked,
        });
      }
    }
  }

  return findings;
}
