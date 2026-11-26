import { computeTotalMonthlyCost, sortFindings } from '../engine/filter';
import { Finding, Severity, Tier } from '../types';

export const REPORT_MARKER = '<!-- infraguard-report -->';
export const MAX_REPORT_LENGTH = 60_000;
export const PRO_UPSELL_URL =
  'https://buy.polar.sh/polar_cl_1vY1xdhWPozSZfAU1VtaBbJC71nMOpuUl4ple4GQQPC';

const SEVERITY_ICON: Record<Severity, string> = {
  error: '🔴',
  warning: '🟠',
  info: '🔵',
};

export interface RenderReportOptions {
  tier: Tier;
  licenseVerified: boolean;
  filesAnalyzed: number;
  findings: Finding[];
  ignoredRules?: string[];
  version?: string;
  now?: Date;
}

export function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function formatUsdAmount(amount: number): string {
  return '$' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatUsd(amount: number): string {
  return `~${formatUsdAmount(amount)}`;
}

function formatPlanLabel(tier: Tier, licenseVerified: boolean): string {
  if (tier === 'free') {
    return 'Free';
  }
  return licenseVerified ? 'Pro' : 'Pro (licence non vérifiée)';
}

function formatUtcDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function renderDockerRow(f: Finding): string {
  return `| ${SEVERITY_ICON[f.severity]} | \`${escapeCell(f.ruleId)}\` | \`${escapeCell(f.file)}\` | ${f.line} | ${escapeCell(f.message)} | ${escapeCell(f.remediation)} |`;
}

function renderTerraformRow(f: Finding): string {
  const loc = `\`${escapeCell(f.file)}:${f.line}\``;
  const resource = f.resource ? `\`${escapeCell(f.resource)}\`` : '—';
  const cost = f.monthlyCostUsd !== undefined ? formatUsd(f.monthlyCostUsd) : '—';
  const rem =
    f.ruleId === 'IG-FIN-001'
      ? `${escapeCell(f.message)} ${escapeCell(f.remediation)}`
      : escapeCell(f.remediation);
  return `| ${SEVERITY_ICON[f.severity]} | \`${escapeCell(f.ruleId)}\` | ${loc} | ${resource} | ${cost} | ${rem} |`;
}

function renderSecretRow(f: Finding): string {
  const loc = `\`${escapeCell(f.file)}:${f.line}\``;
  const masked = f.resource ? `\`${escapeCell(f.resource)}\`` : '****';
  return `| ${SEVERITY_ICON[f.severity]} | \`${escapeCell(f.ruleId)}\` | ${loc} | ${masked} | ${escapeCell(f.remediation)} |`;
}

function assembleReport(
  header: string,
  footer: string,
  dockerRows: string[],
  terraformRows: string[],
  secretRows: string[],
  hiddenCount: number,
): string {
  const sections: string[] = [header];

  if (dockerRows.length === 0 && terraformRows.length === 0 && secretRows.length === 0) {
    sections.push('✅ Aucun problème détecté sur les fichiers analysés.');
  } else {
    if (dockerRows.length > 0) {
      sections.push(
        [
          '### 🐳 Docker & Compose',
          '| Sév. | Règle | Fichier | Ligne | Problème | Remédiation |',
          '|:--:|---|---|:--:|---|---|',
          ...dockerRows,
        ].join('\n'),
      );
    }

    if (terraformRows.length > 0) {
      sections.push(
        [
          '### ☁️ Terraform (Pro)',
          '| Sév. | Règle | Fichier:Ligne | Ressource | Surcoût/mois | Remédiation |',
          '|:--:|---|---|---|--:|---|',
          ...terraformRows,
        ].join('\n'),
      );
    }

    if (secretRows.length > 0) {
      sections.push(
        [
          '### 🔑 Secrets exposés (Pro)',
          '| Sév. | Règle | Fichier:Ligne | Valeur (masquée) | Remédiation |',
          '|:--:|---|---|---|---|',
          ...secretRows,
        ].join('\n'),
      );
    }
  }

  if (hiddenCount > 0) {
    sections.push(
      `> ⚠️ … ${hiddenCount} autres findings masqués (limite de taille GitHub atteinte).`,
    );
  }

  sections.push(footer);
  return sections.join('\n\n') + '\n';
}

/**
 * Generates the idempotent Markdown PR report conforming to SPEC §5.1.
 */
export function renderMarkdownReport(options: RenderReportOptions): string {
  const sorted = sortFindings(options.findings);
  const errors = sorted.filter((f) => f.severity === 'error').length;
  const warnings = sorted.filter((f) => f.severity === 'warning').length;
  const infos = sorted.filter((f) => f.severity === 'info').length;
  const totalCost = computeTotalMonthlyCost(sorted);

  const costCell =
    options.tier === 'pro'
      ? totalCost > 0
        ? `≈ ${formatUsdAmount(totalCost)} /mois`
        : '$0 /mois'
      : '— (Pro)';

  const header = [
    REPORT_MARKER,
    '## 🛡️ InfraGuard FinOps & Security — Rapport',
    '',
    `**Plan :** ${formatPlanLabel(options.tier, options.licenseVerified)} · **Fichiers analysés :** ${options.filesAnalyzed} · **Findings :** ${sorted.length}`,
    '| 🔴 Errors | 🟠 Warnings | 🔵 Infos | 💸 Surcoût mensuel estimé |',
    '|:--:|:--:|:--:|:--:|',
    `| ${errors} | ${warnings} | ${infos} | ${costCell} |`,
  ].join('\n');

  const ignoredText =
    options.ignoredRules && options.ignoredRules.length > 0
      ? options.ignoredRules.join(', ')
      : 'aucune';

  const footerParts: string[] = [
    [
      '<details><summary>ℹ️ Détails & limites</summary>',
      '',
      `Estimations de coûts indicatives (on-demand us-east-1, 730 h/mois). Règles ignorées : ${escapeCell(ignoredText)}.`,
      '</details>',
    ].join('\n'),
  ];

  if (options.tier === 'free') {
    footerParts.push(
      `> 🔒 **Débloquez Terraform, détection de secrets, \`.infraguard.yml\` et \`fail_on_error\` avec InfraGuard Pro** → ${PRO_UPSELL_URL}`,
    );
  }

  const version = options.version ?? '1.0.0';
  const dateStr = formatUtcDate(options.now ?? new Date());
  footerParts.push(`<sub>InfraGuard FinOps & Security v${version} · ${dateStr}</sub>`);
  const footer = footerParts.join('\n\n');

  const dockerRows = sorted
    .filter((f) => f.ruleId.startsWith('IG-DKR-') || f.ruleId.startsWith('IG-CMP-'))
    .map(renderDockerRow);
  const terraformRows = sorted
    .filter((f) => f.ruleId.startsWith('IG-TF-') || f.ruleId.startsWith('IG-FIN-'))
    .map(renderTerraformRow);
  const secretRows = sorted.filter((f) => f.ruleId.startsWith('IG-SEC-')).map(renderSecretRow);

  let hiddenCount = 0;
  let report = assembleReport(header, footer, dockerRows, terraformRows, secretRows, hiddenCount);

  while (report.length > MAX_REPORT_LENGTH) {
    if (secretRows.length > 0) {
      secretRows.pop();
    } else if (terraformRows.length > 0) {
      terraformRows.pop();
    } else if (dockerRows.length > 0) {
      dockerRows.pop();
    } else {
      break;
    }
    hiddenCount++;
    report = assembleReport(header, footer, dockerRows, terraformRows, secretRows, hiddenCount);
  }

  return report;
}
