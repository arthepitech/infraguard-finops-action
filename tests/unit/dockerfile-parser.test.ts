import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDockerfile } from '../../src/analyzers/dockerfile-parser';

describe('parseDockerfile', () => {
  it('parses global ARGs, stages, flags, aliases, case-insensitivity and line continuations', () => {
    const content = readFileSync(
      join(__dirname, '../fixtures/docker/multistage.Dockerfile'),
      'utf8',
    );
    const parsed = parseDockerfile(content);

    expect(parsed.globalArgs).toEqual([
      { name: 'NODE_VERSION', defaultValue: '20.11-alpine', line: 2 },
    ]);

    expect(parsed.stages).toHaveLength(2);

    const builder = parsed.stages[0];
    expect(builder).toBeDefined();
    expect(builder?.fromLine).toBe(4);
    expect(builder?.platform).toBe('linux/amd64');
    expect(builder?.image).toBe('node:${NODE_VERSION}');
    expect(builder?.alias).toBe('builder');

    const runInstr = builder?.instructions.find((ins) => ins.instruction === 'RUN');
    expect(runInstr?.line).toBe(7);
    expect(runInstr?.endLine).toBe(9);
    expect(runInstr?.args).toContain('npm ci &&');
    expect(runInstr?.args).toContain('npm run build');

    const runtime = parsed.stages[1];
    expect(runtime).toBeDefined();
    expect(runtime?.fromLine).toBe(11);
    expect(runtime?.image).toBe('gcr.io/distroless/nodejs20-debian12:nonroot');
    expect(runtime?.alias).toBe('runtime');

    const healthcheck = runtime?.instructions.find((ins) => ins.instruction === 'HEALTHCHECK');
    expect(healthcheck?.line).toBe(15);
    expect(healthcheck?.endLine).toBe(16);
  });

  it('handles CRLF line endings and empty files', () => {
    expect(parseDockerfile('')).toEqual({ globalArgs: [], stages: [] });

    const crlf = 'FROM alpine:3.19\r\nUSER 1000\r\n';
    const parsed = parseDockerfile(crlf);
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.stages[0]?.fromLine).toBe(1);
    expect(parsed.stages[0]?.instructions[1]).toEqual({
      instruction: 'USER',
      args: '1000',
      line: 2,
      endLine: 2,
    });
  });

  it('supports escape directive, quoted ARGs, and ARGs without default', () => {
    const df = [
      '# escape=`',
      'ARG UNSET',
      'ARG VER="20.11-alpine"',
      'FROM node:${VER}',
      'RUN echo hello `',
      '  && echo world',
    ].join('\n');
    const parsed = parseDockerfile(df);
    expect(parsed.globalArgs).toEqual([
      { name: 'UNSET', line: 2 },
      { name: 'VER', defaultValue: '20.11-alpine', line: 3 },
    ]);
    expect(parsed.stages[0]?.instructions[1]?.args).toContain('echo world');
  });
});
