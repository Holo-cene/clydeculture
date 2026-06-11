import { describe, expect, it, vi } from 'vitest';
import {
  buildDataThistleEventsUrl,
  createDataThistleClient,
  dataThistleConfigFromEnv,
} from './client.js';

const ACCESS_TOKEN = 'access-token-abc123';
const REFRESH_TOKEN = 'refresh-token-xyz789';
const NEW_ACCESS_TOKEN = 'new-access-token-def456';
const API_BASE = 'https://api.datathistle.com/v1';
const AUTH_BASE = 'https://auth.datathistle.com/v1';

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('dataThistleConfigFromEnv', () => {
  it('returns undefined when DATA_THISTLE_ACCESS_TOKEN is absent', () => {
    expect(dataThistleConfigFromEnv({})).toBeUndefined();
  });

  it('returns undefined when DATA_THISTLE_ACCESS_TOKEN is empty', () => {
    expect(dataThistleConfigFromEnv({ DATA_THISTLE_ACCESS_TOKEN: '' })).toBeUndefined();
  });

  it('builds full config when all four env vars are set', () => {
    const config = dataThistleConfigFromEnv({
      DATA_THISTLE_ACCESS_TOKEN: ACCESS_TOKEN,
      DATA_THISTLE_REFRESH_TOKEN: REFRESH_TOKEN,
      DATA_THISTLE_API_BASE_URL: 'https://example.com/v1',
      DATA_THISTLE_AUTH_BASE_URL: 'https://example.com',
    });
    expect(config).toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      apiBaseUrl: 'https://example.com/v1',
      authBaseUrl: 'https://example.com',
    });
  });

  it('omits optional fields when their env vars are absent', () => {
    const config = dataThistleConfigFromEnv({
      DATA_THISTLE_ACCESS_TOKEN: ACCESS_TOKEN,
    });
    expect(config).toEqual({ accessToken: ACCESS_TOKEN });
    expect(config).not.toHaveProperty('refreshToken');
    expect(config).not.toHaveProperty('apiBaseUrl');
    expect(config).not.toHaveProperty('authBaseUrl');
  });
});

describe('buildDataThistleEventsUrl', () => {
  it('builds the events URL with snake_case query keys', () => {
    const url = buildDataThistleEventsUrl(API_BASE, {
      town: 'Glasgow',
      minDate: '2026-06-11T00:00:00Z',
      maxDate: '2026-07-11T00:00:00Z',
      status: 'live',
      page: 2,
      limit: 20,
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${API_BASE}/events`);
    expect(parsed.searchParams.get('town')).toBe('Glasgow');
    expect(parsed.searchParams.get('min_date')).toBe('2026-06-11T00:00:00Z');
    expect(parsed.searchParams.get('max_date')).toBe('2026-07-11T00:00:00Z');
    expect(parsed.searchParams.get('status')).toBe('live');
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('limit')).toBe('20');
  });

  it('omits absent params', () => {
    const url = buildDataThistleEventsUrl(API_BASE, { town: 'Glasgow' });
    expect(url).toBe(`${API_BASE}/events?town=Glasgow`);
  });

  it('builds a bare events URL with no params', () => {
    const url = buildDataThistleEventsUrl(API_BASE, {});
    expect(url).toBe(`${API_BASE}/events`);
  });
});

describe('createDataThistleClient — fetchEventsPage', () => {
  it('sends the Authorization: Bearer header with the configured token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.fetchEventsPage({ town: 'Glasgow' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/events?town=Glasgow`);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('returns ok:true with parsed payload and nextPage from X-Next header on 200', async () => {
    const payload = [{ event_id: 'abc' }];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(payload, { headers: { 'X-Next': '/v1/events?page=2' } }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual(payload);
    expect(result.nextPage).toBe('/v1/events?page=2');
    expect(result.errors).toEqual([]);
  });

  it('omits nextPage when X-Next header is absent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(result.ok).toBe(true);
    expect(result.nextPage).toBeUndefined();
  });

  it('on 401 with refreshToken and authBaseUrl, refreshes then retries once with the new token', async () => {
    const payload = [{ event_id: 'after-refresh' }];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorised' }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          accessToken: NEW_ACCESS_TOKEN,
          refreshToken: 'new-refresh-token-after-renewal',
        })
      )
      .mockResolvedValueOnce(jsonResponse(payload));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({ town: 'Glasgow' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // Refresh call shape per the Data Thistle Auth API docs:
    // GET {authBaseUrl}/refresh with the REFRESH token as the Bearer credential.
    const [refreshUrl, refreshInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(refreshUrl).toBe(`${AUTH_BASE}/refresh`);
    expect(refreshInit.method ?? 'GET').toBe('GET');
    expect(refreshInit.body).toBeUndefined();
    expect(new Headers(refreshInit.headers).get('Authorization')).toBe(
      `Bearer ${REFRESH_TOKEN}`
    );

    // Retry of the original URL with the new token
    const [retryUrl, retryInit] = fetchImpl.mock.calls[2] as [string, RequestInit];
    expect(retryUrl).toBe(`${API_BASE}/events?town=Glasgow`);
    expect(new Headers(retryInit.headers).get('Authorization')).toBe(
      `Bearer ${NEW_ACCESS_TOKEN}`
    );

    expect(result.ok).toBe(true);
    expect(result.payload).toEqual(payload);
  });

  it('returns ok:false after a second 401 following refresh — no infinite loop', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorised' }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          accessToken: NEW_ACCESS_TOKEN,
          refreshToken: 'new-refresh-token-after-renewal',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'still unauthorised' }, { status: 401 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(fetchImpl).toHaveBeenCalledTimes(3); // original + refresh + one retry, no more
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns ok:false on 401 without refreshToken — no refresh call', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'unauthorised' }, { status: 401 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.errors.some((e) => e.includes('401'))).toBe(true);
  });

  it('returns ok:false on 401 without authBaseUrl — no refresh call', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'unauthorised' }, { status: 401 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns ok:false when the refresh endpoint fails — original request not retried', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorised' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, { status: 403 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(fetchImpl).toHaveBeenCalledTimes(2); // original + refresh only
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('surfaces a secret-store note when the refresh response rotates the refresh token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorised' }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          accessToken: NEW_ACCESS_TOKEN,
          refreshToken: 'rotated-refresh-token',
        })
      )
      .mockResolvedValueOnce(jsonResponse([]));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(result.ok).toBe(true);
    expect(
      result.errors.some((e) =>
        e.includes('Data Thistle refresh token rotated — update the secret store')
      )
    ).toBe(true);
    // The rotated token value itself must not leak into output
    expect(JSON.stringify(result)).not.toContain('rotated-refresh-token');
  });

  it('never includes token values in errors or output', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorised' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, { status: 403 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      authBaseUrl: AUTH_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(ACCESS_TOKEN);
    expect(serialised).not.toContain(REFRESH_TOKEN);
  });

  it('returns ok:false on network throw — never throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ECONNRESET'))).toBe(true);
  });

  it('returns ok:false on invalid JSON body — never throws', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200 }));
    const client = createDataThistleClient({
      accessToken: ACCESS_TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.fetchEventsPage({});

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
