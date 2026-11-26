import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTerraform } from '../../src/analyzers/terraform-parser';

describe('parseTerraform', () => {
  it('parses variables, resources, nested blocks, comments, heredocs and preserves line numbers', () => {
    const content = readFileSync(join(__dirname, '../fixtures/terraform/clean.tf'), 'utf8');
    const parsed = parseTerraform(content);

    expect(parsed.variables).toEqual({ instance_type: 't3.medium' });
    expect(parsed.resources).toHaveLength(1);

    const res = parsed.resources[0];
    expect(res?.type).toBe('aws_instance');
    expect(res?.name).toBe('web');
    expect(res?.line).toBe(10);
    expect(res?.endLine).toBe(26);
    expect(res?.attributes.instance_type?.value).toBe('t3.medium');
    expect(res?.attributes.count?.value).toBe(1);

    expect(res?.blocks).toHaveLength(1);
    const rootBlock = res?.blocks[0];
    expect(rootBlock?.type).toBe('root_block_device');
    expect(rootBlock?.line).toBe(21);
    expect(rootBlock?.attributes.volume_type?.value).toBe('gp3');
    expect(rootBlock?.attributes.volume_size?.value).toBe(50);
    expect(rootBlock?.attributes.encrypted?.value).toBe(true);
  });

  it('handles empty or unclosed blocks gracefully without throwing', () => {
    expect(parseTerraform('')).toEqual({ variables: {}, resources: [] });
    expect(parseTerraform('resource "aws_instance" "broken" { ami = "123"')).toEqual({
      variables: {},
      resources: [],
    });
  });
});
