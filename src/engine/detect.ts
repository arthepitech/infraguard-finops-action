import * as path from 'node:path';

export type FileCategory = 'dockerfile' | 'compose' | 'terraform' | 'text' | 'ignored';

const SECRET_EXCLUDED_DIRS = ['dist/', 'node_modules/', '.git/', 'coverage/'];
const SECRET_EXCLUDED_EXTS = new Set([
  '.lock',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bin',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
]);
const SECRET_EXCLUDED_BASENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
]);

export function isDockerfile(filename: string): boolean {
  const base = path.posix.basename(filename);
  return (
    base === 'Dockerfile' ||
    base.startsWith('Dockerfile.') ||
    base.endsWith('.Dockerfile') ||
    base.endsWith('.dockerfile')
  );
}

export function isComposeFile(filename: string): boolean {
  const base = path.posix.basename(filename);
  return /^(?:docker-compose|compose).*\.(?:ya?ml)$/i.test(base);
}

export function isTerraformFile(filename: string): boolean {
  return path.posix.extname(filename).toLowerCase() === '.tf';
}

export function isSecretScanEligible(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    SECRET_EXCLUDED_DIRS.some((dir) => normalized.startsWith(dir) || normalized.includes(`/${dir}`))
  ) {
    return false;
  }
  const base = path.posix.basename(normalized);
  if (SECRET_EXCLUDED_BASENAMES.has(base)) {
    return false;
  }
  const ext = path.posix.extname(base).toLowerCase();
  if (SECRET_EXCLUDED_EXTS.has(ext)) {
    return false;
  }
  return true;
}

export function classifyFile(filename: string): FileCategory {
  if (isDockerfile(filename)) {
    return 'dockerfile';
  }
  if (isComposeFile(filename)) {
    return 'compose';
  }
  if (isTerraformFile(filename)) {
    return 'terraform';
  }
  if (isSecretScanEligible(filename)) {
    return 'text';
  }
  return 'ignored';
}
