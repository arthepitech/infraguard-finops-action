import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  isComposeFile,
  isDockerfile,
  isSecretScanEligible,
  isTerraformFile,
} from '../../src/engine/detect';

describe('file detection', () => {
  it('detects Dockerfiles', () => {
    expect(isDockerfile('Dockerfile')).toBe(true);
    expect(isDockerfile('docker/Dockerfile.prod')).toBe(true);
    expect(isDockerfile('app.Dockerfile')).toBe(true);
    expect(isDockerfile('app.dockerfile')).toBe(true);
    expect(isDockerfile('Dockerfile.md')).toBe(true);
    expect(isDockerfile('src/docker.ts')).toBe(false);
  });

  it('detects docker-compose files', () => {
    expect(isComposeFile('docker-compose.yml')).toBe(true);
    expect(isComposeFile('docker-compose.prod.yaml')).toBe(true);
    expect(isComposeFile('infra/compose.yml')).toBe(true);
    expect(isComposeFile('values.yaml')).toBe(false);
  });

  it('detects Terraform files and secret exclusions', () => {
    expect(isTerraformFile('infra/main.tf')).toBe(true);
    expect(isTerraformFile('main.tfvars')).toBe(false);

    expect(isSecretScanEligible('src/app.ts')).toBe(true);
    expect(isSecretScanEligible('dist/index.js')).toBe(false);
    expect(isSecretScanEligible('node_modules/pkg/index.js')).toBe(false);
    expect(isSecretScanEligible('package-lock.json')).toBe(false);
    expect(isSecretScanEligible('yarn.lock')).toBe(false);
    expect(isSecretScanEligible('assets/logo.png')).toBe(false);
  });

  it('classifies files into categories', () => {
    expect(classifyFile('Dockerfile')).toBe('dockerfile');
    expect(classifyFile('docker-compose.yml')).toBe('compose');
    expect(classifyFile('main.tf')).toBe('terraform');
    expect(classifyFile('.env.example')).toBe('text');
    expect(classifyFile('dist/index.js')).toBe('ignored');
  });
});
