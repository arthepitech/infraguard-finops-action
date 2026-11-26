import { Severity, Tier } from '../types';

export interface RuleDefinition {
  id: string;
  severity: Severity;
  tier: Tier;
  title: string;
  message: string;
  remediation: string;
}

export const FREE_RULES: Record<string, RuleDefinition> = {
  'IG-DKR-001': {
    id: 'IG-DKR-001',
    severity: 'warning',
    tier: 'free',
    title: 'Image de base non épinglée',
    message: 'Image de base non épinglée.',
    remediation:
      'Épinglez une version précise (ex. `node:20.11-alpine`) ou un digest `@sha256:…` pour des builds reproductibles.',
  },
  'IG-DKR-002': {
    id: 'IG-DKR-002',
    severity: 'warning',
    tier: 'free',
    title: 'Exécution en root',
    message: "Le conteneur s'exécute en root.",
    remediation: 'Ajoutez `RUN adduser -D app` puis `USER app` avant `CMD`/`ENTRYPOINT`.',
  },
  'IG-DKR-003': {
    id: 'IG-DKR-003',
    severity: 'info',
    tier: 'free',
    title: 'Absence de HEALTHCHECK',
    message: 'Aucun HEALTHCHECK défini.',
    remediation: 'Ajoutez `HEALTHCHECK CMD curl -f http://localhost:PORT/health || exit 1`.',
  },
  'IG-CMP-001': {
    id: 'IG-CMP-001',
    severity: 'warning',
    tier: 'free',
    title: 'Image Compose non épinglée',
    message: 'Image non épinglée.',
    remediation: 'Utilisez un tag de version explicite.',
  },
  'IG-CMP-002': {
    id: 'IG-CMP-002',
    severity: 'warning',
    tier: 'free',
    title: 'Service Compose en root',
    message: "Le service s'exécute en root.",
    remediation: 'Ajoutez `user: "1000:1000"` ou définissez `USER` dans l\'image.',
  },
  'IG-CMP-003': {
    id: 'IG-CMP-003',
    severity: 'info',
    tier: 'free',
    title: 'Service Compose sans healthcheck',
    message: 'Service sans healthcheck.',
    remediation: 'Ajoutez `healthcheck: { test: [...], interval: 30s, retries: 3 }`.',
  },
  'IG-CMP-004': {
    id: 'IG-CMP-004',
    severity: 'warning',
    tier: 'free',
    title: 'Service Compose sans limites CPU/RAM',
    message: 'Service sans limites CPU/RAM.',
    remediation: 'Ajoutez `deploy.resources.limits: { cpus: "0.50", memory: 512M }`.',
  },
};

export const FREE_RULE_LIST: RuleDefinition[] = Object.values(FREE_RULES);
