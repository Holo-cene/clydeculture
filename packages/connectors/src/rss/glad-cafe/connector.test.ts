import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGladCafeConnector } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFeed(): string {
  return readFileSync(join(__dirname, 'fixtures', 'feed.xml'), 'utf-8');
}

function okResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' },
  });
}

describe('createGladCafeConnector — Connector interface conformance', () => {
  it('exposes slug "glad-cafe" matching the sources.slug seed', () => {
    const connector = createGladCafeConnector({ url: 'https://example.test/feed' });

    expect(connector.slug).toBe('glad-cafe');
  });

  it('exposes type "rss"', () => {
    const connector = createGladCafeConnector({ url: 'https://example.test/feed' });

    expect(connector.type).toBe('rss');
  });
});

describe('createGladCafeConnector — run()', () => {
  it('returns IngestResult shape (fetchedCount, parsedCount, items, errors)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(loadFeed()));
    const connector = createGladCafeConnector({
      url: 'https://example.test/feed',
      fetchImpl,
    });

    const result = await connector.run();

    expect(result).toEqual(
      expect.objectContaining({
        fetchedCount: expect.any(Number),
        parsedCount: expect.any(Number),
        items: expect.any(Array),
        errors: expect.any(Array),
      }),
    );
  });

  it('fetches the configured URL and parses the feed body into RawEvents', async () => {
    const url = 'https://example.test/feed';
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(loadFeed()));
    const connector = createGladCafeConnector({ url, fetchImpl });

    const result = await connector.run();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(url);
    expect(result.parsedCount).toBe(result.items.length);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('does not throw when the fetch fails — records the error instead', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connection refused'));
    const connector = createGladCafeConnector({
      url: 'https://example.test/feed',
      fetchImpl,
    });

    let threw = false;
    let result;
    try {
      result = await connector.run();
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.fetchedCount).toBe(0);
    expect(result?.items).toEqual([]);
    expect(result?.errors.some(e => /connection refused/i.test(e))).toBe(true);
  });

  it('treats non-2xx responses as fetch errors (does not parse the body)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );
    const connector = createGladCafeConnector({
      url: 'https://example.test/feed',
      fetchImpl,
    });

    const result = await connector.run();

    expect(result.items).toEqual([]);
    expect(result.errors.some(e => /404|not found|status/i.test(e))).toBe(true);
  });
});
