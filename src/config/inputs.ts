import * as core from '@actions/core';

export interface ActionInputs {
  githubToken: string;
  licenseKey: string;
  failOnError: boolean;
  configPath: string;
  comment: boolean;
}

function parseBoolInput(name: string, raw: string, defaultValue: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  core.warning(
    `Invalid boolean value "${raw}" for input "${name}"; defaulting to ${defaultValue}.`,
  );
  return defaultValue;
}

/**
 * Reads and validates GitHub Action inputs from `action.yml`, immediately masking `license_key`.
 */
export function getInputs(): ActionInputs {
  const githubToken = (core.getInput('github_token') || process.env.GITHUB_TOKEN || '').trim();
  const licenseKey = core.getInput('license_key').trim();

  if (licenseKey) {
    core.setSecret(licenseKey);
  }

  const failOnError = parseBoolInput('fail_on_error', core.getInput('fail_on_error'), false);
  const configPath = core.getInput('config_path').trim() || '.infraguard.yml';
  const comment = parseBoolInput('comment', core.getInput('comment'), true);

  return {
    githubToken,
    licenseKey,
    failOnError,
    configPath,
    comment,
  };
}
