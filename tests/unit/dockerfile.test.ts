import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDockerfile } from '../../src/analyzers/dockerfile';

describe('analyzeDockerfile', () => {
  it('flags :latest and untagged images (IG-DKR-001)', () => {
    const bad = readFileSync(join(__dirname, '../fixtures/docker/bad.Dockerfile'), 'utf8');
    const findings = analyzeDockerfile('Dockerfile', bad);
    expect(findings.some((f) => f.ruleId === 'IG-DKR-001' && f.line === 1)).toBe(true);

    const untagged = analyzeDockerfile('Dockerfile', 'FROM ubuntu\n').filter(
      (f) => f.ruleId === 'IG-DKR-001',
    );
    expect(untagged).toHaveLength(1);
    expect(untagged[0]?.message).toContain('ubuntu');

    const registryPortUntagged = analyzeDockerfile(
      'Dockerfile',
      'FROM localhost:5000/my-service\n',
    ).filter((f) => f.ruleId === 'IG-DKR-001');
    expect(registryPortUntagged).toHaveLength(1);
  });

  it('ignores pinned versions, digests, scratch, stage aliases and resolves ARG defaults', () => {
    const good = readFileSync(join(__dirname, '../fixtures/docker/good.Dockerfile'), 'utf8');
    expect(analyzeDockerfile('Dockerfile', good)).toEqual([]);

    const specialCases = [
      'ARG TAG=latest',
      'FROM alpine:${TAG} AS base',
      'FROM base AS mid',
      'FROM scratch',
      'FROM ghcr.io/org/app@sha256:0123456789abcdef',
      'FROM localhost:5000/my-service:1.2.3',
    ].join('\n');

    const dkr001 = analyzeDockerfile('Dockerfile', specialCases).filter(
      (f) => f.ruleId === 'IG-DKR-001',
    );
    expect(dkr001).toHaveLength(1);
    expect(dkr001[0]?.line).toBe(2);
    expect(dkr001[0]?.message).toContain('alpine:latest');
  });

  it('flags missing or root USER only in the final stage (IG-DKR-002)', () => {
    const multistageNoUserInFinal = [
      'FROM node:20-alpine AS builder',
      'USER app',
      'FROM node:20-alpine',
      'HEALTHCHECK CMD exit 0',
    ].join('\n');

    const missing = analyzeDockerfile('Dockerfile', multistageNoUserInFinal);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.ruleId).toBe('IG-DKR-002');
    expect(missing[0]?.line).toBe(3);

    const rootUsers = [
      'FROM node:20-alpine\nUSER root\nHEALTHCHECK CMD exit 0',
      'FROM node:20-alpine\nUSER 0\nHEALTHCHECK CMD exit 0',
      'FROM node:20-alpine\nUSER 0:0\nHEALTHCHECK CMD exit 0',
      'FROM node:20-alpine\nUSER root:root\nHEALTHCHECK CMD exit 0',
      'FROM node:20-alpine\nUSER app\nUSER 0\nHEALTHCHECK CMD exit 0',
    ];
    for (const df of rootUsers) {
      const res = analyzeDockerfile('Dockerfile', df);
      const dkr002 = res.filter((f) => f.ruleId === 'IG-DKR-002');
      expect(dkr002).toHaveLength(1);
    }

    const nonRoot = analyzeDockerfile(
      'Dockerfile',
      'FROM node:20-alpine\nUSER 1000:1000\nHEALTHCHECK CMD exit 0',
    );
    expect(nonRoot).toEqual([]);
  });

  it('flags missing HEALTHCHECK or HEALTHCHECK NONE unless final stage is scratch (IG-DKR-003)', () => {
    const missing = analyzeDockerfile('Dockerfile', 'FROM node:20-alpine\nUSER app\n');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.ruleId).toBe('IG-DKR-003');
    expect(missing[0]?.severity).toBe('info');
    expect(missing[0]?.line).toBe(1);

    const none = analyzeDockerfile(
      'Dockerfile',
      'FROM node:20-alpine\nUSER app\nHEALTHCHECK NONE\n',
    );
    expect(none).toHaveLength(1);
    expect(none[0]?.ruleId).toBe('IG-DKR-003');
    expect(none[0]?.line).toBe(3);

    const scratch = analyzeDockerfile('Dockerfile', 'FROM scratch\nUSER 1000\nCOPY app /app\n');
    expect(scratch).toEqual([]);
  });
});
