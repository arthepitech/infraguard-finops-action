import { Tier } from '../types';

export const POLAR_VALIDATE_URL = 'https://api.polar.sh/v1/customer-portal/license-keys/validate';

export const POLAR_ORG_ID = '5e25eb4f-321a-4e5f-b909-1ec156b374bd';

export type FetchLike = typeof fetch;

export interface ValidateLicenseOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  organizationId?: string;
}

export interface LicenseResult {
  tier: Tier;
  verified: boolean;
  reason: string;
}

interface PolarValidateResponse {
  id?: string;
  organization_id?: string;
  status?: string;
  expires_at?: string | null;
}

/**
 * Validates a Polar.sh license key via the public customer-portal endpoint with a strict
 * 5s timeout and fail-open behavior on network/5xx/429/timeout errors so CI is never blocked.
 */
export async function validateLicense(
  licenseKey: string,
  options: ValidateLicenseOptions = {},
): Promise<LicenseResult> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    return { tier: 'free', verified: true, reason: 'no_key' };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const organizationId = options.organizationId ?? POLAR_ORG_ID;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(POLAR_VALIDATE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: trimmedKey,
        organization_id: organizationId,
      }),
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 422 || response.status === 400) {
      return { tier: 'free', verified: true, reason: `http_${response.status}` };
    }

    if (response.status === 429 || response.status >= 500 || !response.ok) {
      return { tier: 'pro', verified: false, reason: `fail_open_http_${response.status}` };
    }

    let data: PolarValidateResponse;
    try {
      data = (await response.json()) as PolarValidateResponse;
    } catch {
      return { tier: 'pro', verified: false, reason: 'fail_open_invalid_json' };
    }

    if (data.status !== 'granted') {
      return { tier: 'free', verified: true, reason: `status_${data.status ?? 'unknown'}` };
    }

    if (data.expires_at) {
      const expTime = Date.parse(data.expires_at);
      if (!Number.isNaN(expTime) && expTime <= Date.now()) {
        return { tier: 'free', verified: true, reason: 'expired' };
      }
    }

    return { tier: 'pro', verified: true, reason: 'valid' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { tier: 'pro', verified: false, reason: 'fail_open_timeout' };
    }
    return { tier: 'pro', verified: false, reason: 'fail_open_network' };
  } finally {
    clearTimeout(timer);
  }
}
