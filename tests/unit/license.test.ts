import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FetchLike,
  POLAR_ORG_ID,
  POLAR_VALIDATE_URL,
  validateLicense,
} from '../../src/license/polar';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '../fixtures/polar', name), 'utf8')) as unknown;
}

function mockResponse(status: number, body: unknown, invalidJson = false): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (invalidJson) {
        throw new SyntaxError('Unexpected token');
      }
      return body;
    },
  } as Response;
}

describe('validateLicense (Polar.sh)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns free without calling fetch when key is empty or whitespace', async () => {
    const fetchMock = vi.fn();
    const res1 = await validateLicense('', { fetchImpl: fetchMock as unknown as FetchLike });
    const res2 = await validateLicense('   ', { fetchImpl: fetchMock as unknown as FetchLike });

    expect(res1).toEqual({ tier: 'free', verified: true, reason: 'no_key' });
    expect(res2).toEqual({ tier: 'free', verified: true, reason: 'no_key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends exact POST JSON payload without Authorization header and grants pro when status === granted', async () => {
    const grantedBody = loadFixture('granted.json');
    const fetchMock = vi.fn(async () => mockResponse(200, grantedBody));

    const result = await validateLicense('polar-secret-key-123', {
      fetchImpl: fetchMock as unknown as FetchLike,
    });

    expect(result).toEqual({ tier: 'pro', verified: true, reason: 'valid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(POLAR_VALIDATE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toEqual({
      key: 'polar-secret-key-123',
      organization_id: POLAR_ORG_ID,
    });
  });

  it('falls back to free on revoked, disabled, expired, or HTTP 404/422/400', async () => {
    const cases: Array<{ name: string; status: number; body: unknown; expectedReason: string }> = [
      {
        name: 'revoked',
        status: 200,
        body: loadFixture('revoked.json'),
        expectedReason: 'status_revoked',
      },
      {
        name: 'disabled',
        status: 200,
        body: loadFixture('disabled.json'),
        expectedReason: 'status_disabled',
      },
      {
        name: 'expired',
        status: 200,
        body: loadFixture('expired.json'),
        expectedReason: 'expired',
      },
      { name: '404', status: 404, body: {}, expectedReason: 'http_404' },
      { name: '422', status: 422, body: {}, expectedReason: 'http_422' },
      { name: '400', status: 400, body: {}, expectedReason: 'http_400' },
    ];

    for (const c of cases) {
      const fetchMock = vi.fn(async () => mockResponse(c.status, c.body));
      const res = await validateLicense('key', { fetchImpl: fetchMock as unknown as FetchLike });
      expect(res.tier, c.name).toBe('free');
      expect(res.verified, c.name).toBe(true);
      expect(res.reason, c.name).toBe(c.expectedReason);
    }
  });

  it('fails open to pro (unverified) on network errors, 5xx, 429, 403, and corrupted JSON', async () => {
    const networkFetch = vi.fn(async () => {
      throw new Error('ENOTFOUND api.polar.sh');
    });
    expect(
      await validateLicense('key', { fetchImpl: networkFetch as unknown as FetchLike }),
    ).toEqual({
      tier: 'pro',
      verified: false,
      reason: 'fail_open_network',
    });

    const serverErrFetch = vi.fn(async () => mockResponse(503, {}));
    expect(
      await validateLicense('key', { fetchImpl: serverErrFetch as unknown as FetchLike }),
    ).toEqual({
      tier: 'pro',
      verified: false,
      reason: 'fail_open_http_503',
    });

    const rateLimitFetch = vi.fn(async () => mockResponse(429, {}));
    expect(
      await validateLicense('key', { fetchImpl: rateLimitFetch as unknown as FetchLike }),
    ).toEqual({
      tier: 'pro',
      verified: false,
      reason: 'fail_open_http_429',
    });

    const unexpectedFetch = vi.fn(async () => mockResponse(403, {}));
    expect(
      await validateLicense('key', { fetchImpl: unexpectedFetch as unknown as FetchLike }),
    ).toEqual({
      tier: 'pro',
      verified: false,
      reason: 'fail_open_http_403',
    });

    const badJsonFetch = vi.fn(async () => mockResponse(200, null, true));
    expect(
      await validateLicense('key', { fetchImpl: badJsonFetch as unknown as FetchLike }),
    ).toEqual({
      tier: 'pro',
      verified: false,
      reason: 'fail_open_invalid_json',
    });
  });

  it('fails open on 5s timeout using fake timers without logging the key', async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, 'log');
    const errSpy = vi.spyOn(console, 'error');

    const hangingFetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    const promise = validateLicense('TOP-SECRET-POLAR-KEY', {
      fetchImpl: hangingFetch as unknown as FetchLike,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toEqual({ tier: 'pro', verified: false, reason: 'fail_open_timeout' });
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
