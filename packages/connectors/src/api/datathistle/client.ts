/**
 * Data Thistle API client and auth layer.
 *
 * This is the raw HTTP layer only: it authenticates, fetches event listing pages,
 * and handles token refresh. It returns raw payloads — parsing into RawEvents is
 * the responsibility of parse.ts, and connector wiring is out of scope here.
 *
 * Auth: every request sends `Authorization: Bearer <JWT>`. The refresh flow follows
 * the Data Thistle Auth API docs (account documentation; the public OpenAPI spec at
 * https://api.datathistle.com/openapi/openapi.yaml does not cover auth):
 *
 *   GET {authBaseUrl}/refresh
 *   Authorization: Bearer <refresh token>
 *   → { "status": 200, "accessToken": "...", "refreshToken": "..." }
 *
 * where DATA_THISTLE_AUTH_BASE_URL is expected to be https://auth.datathistle.com/v1.
 * The response always issues BOTH new tokens (refresh tokens last ~a month), so every
 * successful refresh rotates the refresh token: the operator must copy the new tokens
 * into the secret store (local .env / GitHub Actions secrets / Trigger.dev or Supabase
 * secrets). Refresh is opt-in: it only runs when both `refreshToken` and `authBaseUrl`
 * are configured.
 *
 * Tokens are held in memory only. They are never written to disk, env, or logs,
 * and must never appear in error strings.
 */

const DEFAULT_API_BASE_URL = 'https://api.datathistle.com/v1';

export interface DataThistleClientConfig {
  accessToken: string;
  refreshToken?: string;
  /** Defaults to https://api.datathistle.com/v1 */
  apiBaseUrl?: string;
  /**
   * Base URL for the token refresh endpoint — expected value is
   * https://auth.datathistle.com/v1 (the client calls {authBaseUrl}/refresh).
   * Refresh is disabled when absent.
   */
  authBaseUrl?: string;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build a client config from environment variables. Returns undefined when
 * DATA_THISTLE_ACCESS_TOKEN is absent or empty — the caller decides whether
 * that is an error. Never throws.
 */
export function dataThistleConfigFromEnv(
  env: Record<string, string | undefined>
): DataThistleClientConfig | undefined {
  const accessToken = env['DATA_THISTLE_ACCESS_TOKEN'];
  if (!accessToken) return undefined;

  const config: DataThistleClientConfig = { accessToken };
  if (env['DATA_THISTLE_REFRESH_TOKEN']) {
    config.refreshToken = env['DATA_THISTLE_REFRESH_TOKEN'];
  }
  if (env['DATA_THISTLE_API_BASE_URL']) {
    config.apiBaseUrl = env['DATA_THISTLE_API_BASE_URL'];
  }
  if (env['DATA_THISTLE_AUTH_BASE_URL']) {
    config.authBaseUrl = env['DATA_THISTLE_AUTH_BASE_URL'];
  }
  return config;
}

export interface DataThistleEventsParams {
  town?: string;
  /** ISO 8601 — maps to min_date. */
  minDate?: string;
  /** ISO 8601 — maps to max_date. */
  maxDate?: string;
  status?: string;
  page?: number;
  /** Max 20 per the Data Thistle API (pass-through; not clamped here). */
  limit?: number;
}

export function buildDataThistleEventsUrl(
  baseUrl: string,
  params: DataThistleEventsParams
): string {
  const query = new URLSearchParams();
  if (params.town !== undefined) query.set('town', params.town);
  if (params.minDate !== undefined) query.set('min_date', params.minDate);
  if (params.maxDate !== undefined) query.set('max_date', params.maxDate);
  if (params.status !== undefined) query.set('status', params.status);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const queryString = query.toString();
  return queryString ? `${baseUrl}/events?${queryString}` : `${baseUrl}/events`;
}

export interface DataThistleFetchResult {
  ok: boolean;
  status?: number;
  payload?: unknown;
  /** Value of the X-Next pagination header, when present. */
  nextPage?: string;
  errors: string[];
}

export interface DataThistleClient {
  fetchEventsPage(params: DataThistleEventsParams): Promise<DataThistleFetchResult>;
}

export function createDataThistleClient(config: DataThistleClientConfig): DataThistleClient {
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  // In-memory token state only — never persisted, never logged.
  let accessToken = config.accessToken;
  let refreshToken = config.refreshToken;

  /**
   * Attempt a single token refresh. Returns notes for the result's errors array
   * (e.g. rotation warnings). Token values must never appear in these strings.
   */
  async function tryRefresh(authBaseUrl: string, notes: string[]): Promise<boolean> {
    try {
      // Per the Data Thistle Auth API docs: GET {authBaseUrl}/refresh with the
      // REFRESH token as the Bearer credential; the response issues both tokens.
      const response = await fetchImpl(`${authBaseUrl}/refresh`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${refreshToken}` },
      });

      if (!response.ok) {
        notes.push(`Data Thistle token refresh failed: HTTP ${response.status}`);
        return false;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        notes.push('Data Thistle token refresh failed: response was not valid JSON');
        return false;
      }

      if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as { accessToken?: unknown }).accessToken !== 'string'
      ) {
        notes.push('Data Thistle token refresh failed: no accessToken in response');
        return false;
      }

      const parsed = body as { accessToken: string; refreshToken?: unknown };
      accessToken = parsed.accessToken;

      if (typeof parsed.refreshToken === 'string' && parsed.refreshToken !== refreshToken) {
        refreshToken = parsed.refreshToken;
        notes.push(
          'Data Thistle refresh token rotated — update the secret store (see SPEC.md §auth)'
        );
      }
      return true;
    } catch {
      // Do not include the thrown value: it could echo request details (tokens).
      notes.push('Data Thistle token refresh failed: network error');
      return false;
    }
  }

  async function fetchEventsPage(
    params: DataThistleEventsParams
  ): Promise<DataThistleFetchResult> {
    const errors: string[] = [];
    const url = buildDataThistleEventsUrl(apiBaseUrl, params);

    const doRequest = (): Promise<Response> =>
      fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    try {
      let response = await doRequest();

      // At most one refresh attempt per call — no loops.
      if (response.status === 401 && refreshToken && config.authBaseUrl) {
        const refreshed = await tryRefresh(config.authBaseUrl, errors);
        if (!refreshed) {
          errors.push('Data Thistle request unauthorised (HTTP 401) and token refresh failed');
          return { ok: false, status: response.status, errors };
        }
        response = await doRequest();
      }

      if (!response.ok) {
        errors.push(`Data Thistle request failed: HTTP ${response.status} ${response.statusText}`);
        return { ok: false, status: response.status, errors };
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        errors.push('Data Thistle response was not valid JSON');
        return { ok: false, status: response.status, errors };
      }

      const nextPage = response.headers.get('X-Next');
      const result: DataThistleFetchResult = {
        ok: true,
        status: response.status,
        payload,
        errors,
      };
      if (nextPage !== null) result.nextPage = nextPage;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      errors.push(`Data Thistle fetch failed: ${message}`);
      return { ok: false, errors };
    }
  }

  return { fetchEventsPage };
}
