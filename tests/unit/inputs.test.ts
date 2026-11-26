import * as core from '@actions/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInputs } from '../../src/config/inputs';

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  warning: vi.fn(),
}));

describe('getInputs', () => {
  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it('returns default values when inputs are empty', () => {
    vi.mocked(core.getInput).mockReturnValue('');
    process.env.GITHUB_TOKEN = 'env-token';

    const inputs = getInputs();
    expect(inputs).toEqual({
      githubToken: 'env-token',
      licenseKey: '',
      failOnError: false,
      configPath: '.infraguard.yml',
      comment: true,
    });
    expect(core.setSecret).not.toHaveBeenCalled();
  });

  it('parses custom inputs and masks license_key with core.setSecret', () => {
    const values: Record<string, string> = {
      github_token: 'ghs_custom',
      license_key: '  pro-license-abc  ',
      fail_on_error: 'true',
      config_path: 'config/infraguard.yml',
      comment: 'false',
    };
    vi.mocked(core.getInput).mockImplementation((name) => values[name] ?? '');

    const inputs = getInputs();
    expect(inputs).toEqual({
      githubToken: 'ghs_custom',
      licenseKey: 'pro-license-abc',
      failOnError: true,
      configPath: 'config/infraguard.yml',
      comment: false,
    });
    expect(core.setSecret).toHaveBeenCalledWith('pro-license-abc');
  });

  it('warns and uses defaults on invalid boolean input', () => {
    const values: Record<string, string> = {
      github_token: 'tok',
      fail_on_error: 'maybe',
      comment: 'nope',
    };
    vi.mocked(core.getInput).mockImplementation((name) => values[name] ?? '');

    const inputs = getInputs();
    expect(inputs.failOnError).toBe(false);
    expect(inputs.comment).toBe(true);
    expect(core.warning).toHaveBeenCalledTimes(2);
  });
});
