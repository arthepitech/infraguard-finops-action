import * as core from '@actions/core';
import { Finding } from '../types';

export const MAX_ANNOTATIONS = 50;

/**
 * Emits inline GitHub Actions annotations (`core.error`, `core.warning`, `core.notice`)
 * capped at 50 annotations per step.
 */
export function emitAnnotations(findings: Finding[]): void {
  const capped = findings.slice(0, MAX_ANNOTATIONS);

  for (const finding of capped) {
    const message = `[${finding.ruleId}] ${finding.message} — ${finding.remediation}`;
    const props: core.AnnotationProperties = {
      title: `InfraGuard ${finding.ruleId}`,
      file: finding.file,
      startLine: finding.line,
      ...(finding.endLine !== undefined ? { endLine: finding.endLine } : {}),
    };

    if (finding.severity === 'error') {
      core.error(message, props);
    } else if (finding.severity === 'warning') {
      core.warning(message, props);
    } else {
      core.notice(message, props);
    }
  }

  if (findings.length > MAX_ANNOTATIONS) {
    const extra = findings.length - MAX_ANNOTATIONS;
    core.notice(`${extra} annotations supplémentaires — voir le commentaire PR.`);
  }
}
