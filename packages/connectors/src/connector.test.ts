import { describe, it, expect } from 'vitest';
import type { Connector, IngestResult, RawEvent, SourceType } from './connector.js';
import { validateIngestResult, isValidHttpsUrl } from './validate.js';

describe('Connector interface', () => {
  it('accepts a conforming implementation and run() returns an IngestResult', async () => {
    const mockItem: RawEvent = {
      externalId: 'evt-001',
      externalUrl: 'https://example.com/events/evt-001',
      title: 'Test Event',
      startAt: '2026-07-01T19:00:00Z',
      endAt: '2026-07-01T22:00:00Z',
      doorsAt: '2026-07-01T18:30:00Z',
      venueName: 'The Old Hairdresser',
      eventTypeGuess: 'live_music',
      tagsGuess: ['indie', 'glaswegian'],
      priceMinGuess: 10.00,
      priceMaxGuess: 15.00,
      isFreeGuess: false,
      ticketUrlGuess: 'https://example.com/tickets/evt-001',
      ticketUrlLabelGuess: 'Buy tickets',
      imageUrlGuess: 'https://example.com/images/evt-001.jpg',
      availabilityGuess: 'onsale',
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

// validateIngestResult — link-first compliance and shape guarantees
// Every item returned by a connector must have a non-empty externalUrl (link-first
// architecture). validateIngestResult enforces this at the boundary before items
// reach the normaliser.

describe('validateIngestResult', () => {
  it('returns the result unchanged when all items have a valid externalUrl', () => {
    const result: IngestResult = {
      fetchedCount: 2,
      parsedCount: 2,
      items: [
        { externalId: 'a', externalUrl: 'https://example.com/a', title: 'A', raw: {} },
        { externalId: 'b', externalUrl: 'https://example.com/b', title: 'B', raw: {} },
      ],
      errors: [],
    };

    const validated = validateIngestResult(result);
    expect(validated.items).toHaveLength(2);
    expect(validated.errors).toHaveLength(0);
  });

  it('removes items with no externalUrl and adds an error entry', () => {
    const result: IngestResult = {
      fetchedCount: 2,
      parsedCount: 2,
      items: [
        { externalId: 'a', externalUrl: 'https://example.com/a', title: 'A', raw: {} },
        { externalId: 'b', externalUrl: '', title: 'B (no url)', raw: {} },
      ],
      errors: [],
    };

    const validated = validateIngestResult(result);
    expect(validated.items).toHaveLength(1);
    expect(validated.items[0]?.externalId).toBe('a');
    expect(validated.errors).toHaveLength(1);
    expect(validated.errors[0]).toMatch(/externalUrl/);
    expect(validated.errors[0]).toMatch(/b/);
  });

  it('removes items with a non-https externalUrl', () => {
    const result: IngestResult = {
      fetchedCount: 1,
      parsedCount: 1,
      items: [{ externalId: 'a', externalUrl: 'http://example.com/a', title: 'A', raw: {} }],
      errors: [],
    };

    const validated = validateIngestResult(result);
    expect(validated.items).toHaveLength(0);
    expect(validated.errors).toHaveLength(1);
  });

  it('preserves existing errors alongside new validation errors', () => {
    const result: IngestResult = {
      fetchedCount: 2,
      parsedCount: 1,
      items: [{ externalId: 'a', externalUrl: '', title: 'A', raw: {} }],
      errors: ['upstream: rate limit hit'],
    };

    const validated = validateIngestResult(result);
    expect(validated.errors).toHaveLength(2);
    expect(validated.errors).toContain('upstream: rate limit hit');
  });

  it('handles an empty items array without error', () => {
    const result: IngestResult = {
      fetchedCount: 0,
      parsedCount: 0,
      items: [],
      errors: [],
    };

    const validated = validateIngestResult(result);
    expect(validated.items).toHaveLength(0);
    expect(validated.errors).toHaveLength(0);
  });
});

// isValidHttpsUrl — used by validateIngestResult and can be used by individual connectors

describe('isValidHttpsUrl', () => {
  it('accepts a valid https URL', () => {
    expect(isValidHttpsUrl('https://dice.fm/event/abc123')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidHttpsUrl('')).toBe(false);
  });

  it('rejects a plain http URL', () => {
    expect(isValidHttpsUrl('http://example.com/event')).toBe(false);
  });

  it('rejects a relative path', () => {
    expect(isValidHttpsUrl('/events/abc123')).toBe(false);
  });

  it('rejects a non-URL string', () => {
    expect(isValidHttpsUrl('not a url at all')).toBe(false);
  });

  it('rejects undefined passed as string (runtime guard)', () => {
    // The function signature is string, but runtime data may be undefined.
    // The !url guard at line 4 of validate.ts handles this.
    expect(isValidHttpsUrl(undefined as unknown as string)).toBe(false);
  });

  it('rejects a malformed https:// with no host', () => {
    // new URL('https://') throws — caught and returns false
    expect(isValidHttpsUrl('https://')).toBe(false);
  });

  it('accepts an uppercase HTTPS:// URL (URL spec normalises scheme to lowercase)', () => {
    // new URL('HTTPS://example.com').protocol === 'https:' — passes the check
    expect(isValidHttpsUrl('HTTPS://example.com/event')).toBe(true);
  });
});

// Stable externalId — a connector run against the same fixture must produce the same
// externalId values on every call. This test verifies the invariant by building a
// simple connector that parses a static fixture twice.

describe('stable externalId', () => {
  it('the same upstream payload always produces the same externalId', async () => {
    const fixture = { id: 'upstream-123', title: 'A Show', url: 'https://example.com/a-show' };

    const connector: Connector = {
      slug: 'fixture-connector',
      type: 'api',
      async run(): Promise<IngestResult> {
        return {
          fetchedCount: 1,
          parsedCount: 1,
          items: [
            {
              externalId: fixture.id, // stable: always from fixture.id
              externalUrl: fixture.url,
              title: fixture.title,
              raw: fixture,
            },
          ],
          errors: [],
        };
      },
    };

    const run1 = await connector.run();
    const run2 = await connector.run();

    expect(run1.items[0]?.externalId).toBe(run2.items[0]?.externalId);
    expect(run1.items[0]?.externalId).toBe('upstream-123');
  });

  it('a connector must not use a counter or timestamp as externalId', async () => {
    // This is a negative example — a counter-based id is NOT stable across runs.
    // We test that the stable pattern (using the upstream id) is what we expect.
    let counter = 0;
    const unstableConnector: Connector = {
      slug: 'unstable',
      type: 'api',
      async run(): Promise<IngestResult> {
        counter++;
        return {
          fetchedCount: 1,
          parsedCount: 1,
          items: [{ externalId: `run-${counter}`, externalUrl: 'https://example.com', title: 'X', raw: {} }],
          errors: [],
        };
      },
    };

    const run1 = await unstableConnector.run();
    const run2 = await unstableConnector.run();

    // These differ — proving why counter-based ids must never be used
    expect(run1.items[0]?.externalId).not.toBe(run2.items[0]?.externalId);
  });
});

// SourceType sync guard — Phase 1 canonical values
// These tests guard against drift between the connector package's SourceType and the
// canonical set defined in @clydeculture/shared. If either definition changes, the
// compile-time assertions below will cause this file to fail to compile, making the
// test suite fail.

describe('SourceType canonical values — sync guard', () => {
  it('includes all six canonical Phase 1 source types including apify', () => {
    // compile-time: every element here must be a valid SourceType; removing a value
    // from connector.ts SourceType causes a compile error on the satisfies line.
    const canonical = [
      'api',
      'rss',
      'ical',
      'html',
      'apify',
      'manual',
    ] satisfies SourceType[];

    expect(canonical).toHaveLength(6);
    expect(canonical).toContain('apify');
    expect(canonical).toContain('manual');
  });

  it('connector SourceType is exactly the canonical set — no extra or missing values (compile-time guard)', () => {
    // Bidirectional type assertion against the hardcoded canonical union.
    // Adding or removing a value from connector.ts SourceType without updating this
    // canonical type causes `never`, which cannot be assigned to `true`, breaking compilation.
    // NOTE: packages/shared SourceType must stay manually in sync (cross-package rootDir
    // constraint prevents a direct import here; alignment verified by inspection or step 2).
    type CanonicalSourceType = 'api' | 'rss' | 'ical' | 'html' | 'apify' | 'manual';
    type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;
    const syncCheck: AssertEqual<SourceType, CanonicalSourceType> = true;
    expect(syncCheck).toBe(true);
  });
});

// B4: RawEvent full field contract — compile-time guard
// RawEvent must carry all fields needed to populate external_events so connectors
// cannot silently discard pricing, availability, ticket URL, image URL, end time,
// or doors time. These tests are red (TypeScript errors on `pnpm typecheck`) until
// connector.ts adds the 9 missing fields: endAt, doorsAt, priceMinGuess,
// priceMaxGuess, isFreeGuess, ticketUrlGuess, ticketUrlLabelGuess, imageUrlGuess,
// availabilityGuess.

describe('RawEvent full field contract', () => {
  it('accepts a RawEvent with all 17 fields mapped to external_events columns', () => {
    // Excess property check: TypeScript errors on fields not yet in RawEvent.
    // After step 2 adds the fields to connector.ts, this compiles cleanly.
    const fullEvent: RawEvent = {
      externalId: 'evt-b4-001',
      externalUrl: 'https://example.com/events/evt-b4-001',
      title: 'Full Contract Test Event',
      startAt: '2026-07-01T19:00:00Z',
      endAt: '2026-07-01T22:00:00Z',
      doorsAt: '2026-07-01T18:30:00Z',
      venueName: 'The Barrowlands',
      eventTypeGuess: 'live_music',
      tagsGuess: ['indie', 'rock'],
      priceMinGuess: 12.50,
      priceMaxGuess: 20.00,
      isFreeGuess: false,
      ticketUrlGuess: 'https://tickets.example.com/evt-b4-001',
      ticketUrlLabelGuess: 'Buy tickets',
      imageUrlGuess: 'https://images.example.com/evt-b4-001.jpg',
      availabilityGuess: 'onsale',
      raw: { id: 'evt-b4-001' },
    };

    expect(fullEvent.externalId).toBe('evt-b4-001');
    expect(fullEvent.endAt).toBe('2026-07-01T22:00:00Z');
    expect(fullEvent.doorsAt).toBe('2026-07-01T18:30:00Z');
    expect(fullEvent.priceMinGuess).toBe(12.50);
    expect(fullEvent.priceMaxGuess).toBe(20.00);
    expect(fullEvent.isFreeGuess).toBe(false);
    expect(fullEvent.ticketUrlGuess).toBe('https://tickets.example.com/evt-b4-001');
    expect(fullEvent.ticketUrlLabelGuess).toBe('Buy tickets');
    expect(fullEvent.imageUrlGuess).toBe('https://images.example.com/evt-b4-001.jpg');
    expect(fullEvent.availabilityGuess).toBe('onsale');
  });
});
