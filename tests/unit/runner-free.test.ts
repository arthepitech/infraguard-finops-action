import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/engine/runner';
import { ChangedFile } from '../../src/types';

describe('runAnalysis (Free)', () => {
  it('analyzes Dockerfiles and Compose files, skips removed and Terraform files in Free', () => {
    const files: ChangedFile[] = [
      {
        filename: 'Dockerfile',
        status: 'modified',
        content: 'FROM node:latest\n',
      },
      {
        filename: 'deleted.Dockerfile',
        status: 'removed',
        content: 'FROM node:latest\n',
      },
      {
        filename: 'docker-compose.yml',
        status: 'added',
        content: 'services:\n  app:\n    image: redis:7.2\n    user: "1000"\n',
      },
      {
        filename: 'main.tf',
        status: 'added',
        content: 'resource "aws_instance" "gpu" { instance_type = "p3.2xlarge" }',
      },
    ];

    const findings = runAnalysis(files, { tier: 'free' });
    expect(findings.some((f) => f.file === 'deleted.Dockerfile')).toBe(false);
    expect(findings.some((f) => f.file === 'main.tf')).toBe(false);
    expect(findings.some((f) => f.file === 'Dockerfile' && f.ruleId === 'IG-DKR-001')).toBe(true);
    expect(findings.some((f) => f.file === 'docker-compose.yml' && f.ruleId === 'IG-CMP-004')).toBe(
      true,
    );
  });
});
