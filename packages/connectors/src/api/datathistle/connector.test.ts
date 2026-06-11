import { describe, it, expect, vi } from 'vitest';
import { DATA_THISTLE_SOURCE_POLICY } from '@clydeculture/shared';
import { validateIngestResult } from '../../validate.js';
import { createDataThistleConnector } from './index.js';

const ACCESS_TOKEN = 'test-access-token';

function syntheticEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'live',
    name: 'Synthetic Connector Event',
    website: 'https://example.test/events/synthetic-connector-event',
    tags: ['music'],
    schedules: [
      {
        place_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        place: {
          place_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Example Connector Venue',
        },
        performances: [{ ts: '2026-07-21T19:30:00+01:00' }],
      },
    ],
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function makeConnector(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return createDataThistleConnector({
    accessToken: ACCESS_TOKEN,
    fetchImpl,
    pageSleepMs: 0,
    ...overrides,
  });
}

describe('createDataThistleConnector', () => {
  it('declares the datathistle slug and api type', () => {
    const connector = makeConnector(vi.fn() as unknown as typeof fetch);
    expect(connector.slug).toBe('datathistle');
    expect(connector.type).toBe('api');
  });

  it('fetches a page, parses events, and returns a valid IngestResult', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([syntheticEvent()]));
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(result.fetchedCount).toBe(1);
    expect(result.parsedCount).toBe(1);
    expect(result.items[0]?.externalId).toBe(
      'datathistle:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:2026-07-21T19:30:00+01:00'
    );
    expect(validateIngestResult(result).items).toHaveLength(1);
  });

  it('requests the events endpoint scoped to Glasgow live events with a bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    await connector.run();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events?');
    expect(url).toContain('town=Glasgow');
    expect(url).toContain('status=live');
    expect(url).toContain('min_date=');
    expect(url).toContain('max_date=');
    expect(url).toContain('limit=20');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${ACCESS_TOKEN}`
    );
  });

  it('follows X-Next pagination until exhausted', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([syntheticEvent()], { headers: { 'X-Next': '/events?page=2' } })
      )
      .mockResolvedValueOnce(
        jsonResponse([syntheticEvent({ event_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })])
      );
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.fetchedCount).toBe(2);
    expect(result.parsedCount).toBe(2);
    const [secondUrl] = fetchImpl.mock.calls[1] as [string];
    expect(secondUrl).toContain('page=2');
  });

  it('stops at the page cap and reports a non-fatal note', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse([syntheticEvent()], { headers: { 'X-Next': '/events?page=next' } })
      )
    );
    const connector = makeConnector(fetchImpl as unknown as typeof fetch, { maxPages: 3 });

    const result = await connector.run();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.errors.some((message) => message.includes('page cap'))).toBe(true);
  });

  it('does not fetch at all when the source policy disables staging collection', async () => {
    const fetchImpl = vi.fn();
    const connector = makeConnector(fetchImpl as unknown as typeof fetch, {
      sourcePolicy: { ...DATA_THISTLE_SOURCE_POLICY, allowStagingCollection: false },
    });

    const result = await connector.run();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.errors.some((message) => message.includes('staging collection disabled'))).toBe(
      true
    );
  });

  it('runs under the default policy even though production display is disabled', async () => {
    // Staging ingestion is gated on allowStagingCollection, not productionEnabled.
    expect(DATA_THISTLE_SOURCE_POLICY.productionEnabled).toBe(false);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([syntheticEvent()]));
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(result.parsedCount).toBe(1);
  });

  it('never throws: HTTP failures are returned as errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('nope', { status: 500, statusText: 'Internal Server Error' })
    );
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(result.items).toEqual([]);
    expect(result.errors.some((message) => message.includes('HTTP 500'))).toBe(true);
  });

  it('never throws: network errors are returned as errors without leaking the token', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(result.items).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it('reports a parse error when the payload is not an events array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ unexpected: 'shape' }));
    const connector = makeConnector(fetchImpl as unknown as typeof fetch);

    const result = await connector.run();

    expect(result.items).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
