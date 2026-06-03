import { describe, it, expect } from 'vitest';
import type { Connector, IngestResult, RawEvent } from './connector.js';

describe('Connector interface', () => {
  it('accepts a conforming implementation and run() returns an IngestResult', async () => {
    const mockItem: RawEvent = {
      externalId: 'evt-001',
      externalUrl: 'https://example.com/events/evt-001',
      title: 'Test Event',
      startAt: '2026-07-01T19:00:00Z',
      venueName: 'The Old Hairdresser',
      raw: { id: 'evt-001' },
    };

    const connector: Connector = {
      slug: 'test-connector',
      type: 'api',
      async run(): Promise<IngestResult> {
        return {
          fetchedCount: 1,
          parsedCount: 1,
          items: [mockItem],
          errors: [],
        };
      },
    };

    const result = await connector.run();

    expect(result.fetchedCount).toBe(1);
    expect(result.parsedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item).toBeDefined();
    if (item) {
      expect(item.externalId).toBe('evt-001');
      expect(item.externalUrl).toBe('https://example.com/events/evt-001');
      expect(item.title).toBe('Test Event');
    }
  });

  it('run() must not throw — errors are returned in IngestResult.errors', async () => {
    const faultyConnector: Connector = {
      slug: 'faulty-connector',
      type: 'rss',
      async run(): Promise<IngestResult> {
        const errors: string[] = [];
        try {
          throw new Error('upstream fetch failed');
        } catch (err) {
          errors.push(`Fetch failed: ${String(err)}`);
        }
        return {
          fetchedCount: 0,
          parsedCount: 0,
          items: [],
          errors,
        };
      },
    };

    // Must not throw
    const result = await faultyConnector.run();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Fetch failed/);
    expect(result.items).toHaveLength(0);
    expect(result.fetchedCount).toBe(0);
  });

  it('connector has required slug and type properties', () => {
    const connector: Connector = {
      slug: 'my-venue',
      type: 'html',
      async run(): Promise<IngestResult> {
        return { fetchedCount: 0, parsedCount: 0, items: [], errors: [] };
      },
    };

    expect(connector.slug).toBe('my-venue');
    expect(connector.type).toBe('html');
  });
});
