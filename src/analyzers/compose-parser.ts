import { isMap, isPair, isScalar, LineCounter, Node, parseDocument } from 'yaml';

export interface ComposeService {
  name: string;
  line: number;
  image?: string;
  imageLine?: number;
  hasBuild: boolean;
  user?: string;
  userLine?: number;
  hasHealthcheck: boolean;
  healthcheckDisabled: boolean;
  healthcheckLine?: number;
  hasCpuLimit: boolean;
  hasMemoryLimit: boolean;
}

export interface ParsedCompose {
  valid: boolean;
  services: ComposeService[];
}

function getLine(node: unknown, lineCounter: LineCounter, fallback: number): number {
  if (node && typeof node === 'object' && 'range' in node) {
    const range = (node as Node).range;
    if (range && typeof range[0] === 'number') {
      return lineCounter.linePos(range[0]).line;
    }
  }
  return fallback;
}

function getMapPair(mapNode: unknown, keyName: string) {
  if (!isMap(mapNode)) {
    return undefined;
  }
  for (const item of mapNode.items) {
    if (isPair(item) && isScalar(item.key) && String(item.key.value) === keyName) {
      return item;
    }
  }
  return undefined;
}

function asRecord(val: unknown): Record<string, unknown> | undefined {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Parses a docker-compose YAML file using `yaml` AST for accurate 1-based line numbers
 * and resolved anchors/merge keys. Never throws on invalid YAML.
 */
export function parseCompose(content: string): ParsedCompose {
  if (!content.trim()) {
    return { valid: true, services: [] };
  }

  const lineCounter = new LineCounter();
  let doc;
  try {
    doc = parseDocument(content, { lineCounter, merge: true });
  } catch {
    return { valid: false, services: [] };
  }

  if (doc.errors.length > 0) {
    return { valid: false, services: [] };
  }

  let jsObj: unknown;
  try {
    jsObj = doc.toJS({ maxAliasCount: 100 });
  } catch {
    return { valid: false, services: [] };
  }

  const rootRecord = asRecord(jsObj);
  const servicesRecord = asRecord(rootRecord?.services);
  if (!servicesRecord) {
    return { valid: true, services: [] };
  }

  const servicesPair = getMapPair(doc.contents, 'services');
  const servicesLine = getLine(servicesPair?.key, lineCounter, 1);
  const servicesMap = servicesPair?.value;

  const services: ComposeService[] = [];

  for (const [name, rawSvc] of Object.entries(servicesRecord)) {
    const svc = asRecord(rawSvc);
    if (!svc) {
      continue;
    }

    const svcPair = getMapPair(servicesMap, name);
    const svcLine = getLine(svcPair?.key, lineCounter, servicesLine);
    const svcMap = svcPair?.value;

    const imagePair = getMapPair(svcMap, 'image');
    const userPair = getMapPair(svcMap, 'user');
    const healthPair = getMapPair(svcMap, 'healthcheck');

    const image = svc.image !== undefined ? String(svc.image) : undefined;
    const hasBuild = svc.build !== undefined;
    const user = svc.user !== undefined ? String(svc.user) : undefined;

    const healthObj = asRecord(svc.healthcheck);
    const hasHealthcheck = svc.healthcheck !== undefined && svc.healthcheck !== null;
    const healthcheckDisabled = healthObj?.disable === true;

    const deployObj = asRecord(svc.deploy);
    const resourcesObj = asRecord(deployObj?.resources);
    const limitsObj = asRecord(resourcesObj?.limits);

    const hasCpuLimit =
      (limitsObj?.cpus !== undefined && limitsObj.cpus !== null) ||
      (svc.cpus !== undefined && svc.cpus !== null);
    const hasMemoryLimit =
      (limitsObj?.memory !== undefined && limitsObj.memory !== null) ||
      (svc.mem_limit !== undefined && svc.mem_limit !== null);

    services.push({
      name,
      line: svcLine,
      image,
      imageLine: image !== undefined ? getLine(imagePair?.key, lineCounter, svcLine) : undefined,
      hasBuild,
      user,
      userLine: user !== undefined ? getLine(userPair?.key, lineCounter, svcLine) : undefined,
      hasHealthcheck,
      healthcheckDisabled,
      healthcheckLine: hasHealthcheck ? getLine(healthPair?.key, lineCounter, svcLine) : undefined,
      hasCpuLimit,
      hasMemoryLimit,
    });
  }

  return { valid: true, services };
}
