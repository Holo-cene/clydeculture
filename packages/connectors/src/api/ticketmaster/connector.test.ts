/**
 * Red tests for the production Ticketmaster connector.
 * All tests fail until packages/connectors/src/api/ticketmaster/index.ts is created.
 *
 * Covers: interface conformance, Glasgow geo-filter, 14-day window loop,
 * pagination, deep-paging cap, truncation sentinel, partial failure resilience,
 * stable external IDs, source URL preservation, image URL policy (ADR 0004),
 * link-first compliance, and result counts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RawEvent } from '../../connector.js';

// This import does not exist yet — the entire file will fail to load until
// packages/connectors/src/api/ticketmaster/index.ts is created.
import { createTicketmasterConnector, ticketmasterConnector } from './index.js';

// ============================================================================
// Test constants
// ============================================================================

const TEST_API_KEY = 'test-api-key-12345';
// Fixed "today" injected via startDate config so window dates are deterministic.
const START_DATE = new Date('2026-07-01T00:00:00Z');

// All 18 RawEvent keys — used to verify link-first compliance (no extra fields).
const RAW_EVENT_KEYS: ReadonlyArray<keyof RawEvent> = [
  'externalId',
  'externalUrl',
  'title',
  'startAt',
  'endAt',
  'doorsAt',
  'venueName',
  'eventTypeGuess',
  'tagsGuess',
  'priceMinGuess',
  'priceMaxGuess',
  'isFreeGuess',
  'ticketUrlGuess',
  'ticketUrlLabelGuess',
  'imageUrlGuess',
  'availabilityGuess',
  'timeTba',
  'raw',
];

// ============================================================================
// Helpers
// ============================================================================

/** Minimal parseable Ticketmaster event. Override any field via `overrides`. */
function makeTmEvent(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name: `Event ${id}`,
    url: `https://www.ticketmaster.co.uk/event/${id}`,
    images: [
      {
        ratio: '16_9',
        url: `https://s1.ticketimg.com/dam/${id}_16_9.jpg`,
        width: 1024,
        height: 576,
        fallback: false,
      },
    ],
    dates: {
      start: {
        localDate: '2026-07-10',
        localTime: '20:00:00',
        dateTime: '2026-07-10T19:00:00Z',
        dateTBD: false,
        dateTBA: false,
        timeTBA: false,
        noSpecificTime: false,
      },
      status: { code: 'onsale' },
    },
    classifications: [
      { primary: true, segment: { id: 'KZFzniwnSyZfZ7v7nJ', name: 'Music' } },
    ],
    priceRanges: [{ type: 'standard', currency: 'GBP', min: 15.0, max: 25.0 }],
    _embedded: { venues: [{ name: 'Barrowland Ballroom' }] },
    ...overrides,
  };
}

/**
 * Builds a Ticketmaster page response.
 * When events is empty, omits _embedded (matching real TM API behaviour for
 * zero-result windows, which fetchTicketmasterPage already handles).
 */
function makeTmPage(
  events: unknown[],
  pageNum: number,
  totalPages: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    page: {
      size: 200,
      totalElements: totalPages * Math.max(events.length, 0),
      totalPages,
      number: pageNum,
    },
  };
  if (events.length > 0) {
    result['_embedded'] = { events };
  }
  return result;
}

/** Wraps a body in a minimal fetch Response-alike. */
function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Extracts the URL from the Nth fetch call. */
function fetchedUrl(mockFn: ReturnType<typeof vi.fn>, callIndex: number): URL {
  const args = mockFn.mock.calls[callIndex];
  if (!args) throw new Error(`No fetch call at index ${callIndex}`);
  return new URL(args[0] as string);
}

/**
 * A fetch mock whose response mirrors the requested page number,
 * reporting totalPages regardless. Useful for deep-paging-cap tests.
 */
function makeInfinitePagerMock(totalPages: number, eventsPerPage = 1) {
  return vi.fn((url: string) => {
    const pageNum = parseInt(new URL(url).searchParams.get('page') ?? '0', 10);
    const events = Array.from({ length: eventsPerPage }, (_, i) =>
      makeTmEvent(`p${pageNum}-e${i}`)
    );
    return Promise.resolve(okResponse(makeTmPage(events, pageNum, totalPages)));
  });
}

// ============================================================================
// 1. Module export and Connector interface conformance
// ============================================================================

describe('ticketmasterConnector — module export and Connector interface', () => {
  it('ticketmasterConnector is exported from the module', () => {
    expect(ticketmasterConnector).toBeDefined();
  });

  it('has slug "ticketmaster" matching the sources.slug database row', () => {
    expect(ticketmasterConnector.slug).toBe('ticketmaster');
  });

  it('has type "api"', () => {
    expect(ticketmasterConnector.type).toBe('api');
  });

  it('run() is a function', () => {
    expect(typeof ticketmasterConnector.run).toBe('function');
  });

  it('createTicketmasterConnector returns a Connector with correct slug and type', () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY });
    expect(c.slug).toBe('ticketmaster');
    expect(c.type).toBe('api');
    expect(typeof c.run).toBe('function');
  });
});

// ============================================================================
// 2. Glasgow geo-filter and required URL parameters
// ============================================================================

describe('ticketmasterConnector — Glasgow geo-filter and required URL parameters', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse(makeTmPage([], 0, 1)));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes latlong=55.8642,-4.2518 (Glasgow city centre)', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('latlong')).toBe('55.8642,-4.2518');
  });

  it('includes radius=10', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('radius')).toBe('10');
  });

  it('includes unit=km', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('unit')).toBe('km');
  });

  it('includes countryCode=GB', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('countryCode')).toBe('GB');
  });

  it('includes sort=date,asc (deterministic ordering for stable pagination)', async () => {
    // The current buildTicketmasterUrl in fetch.ts does NOT include sort — this test is RED
    // until sort=date%2Casc is added to the URL builder or connector.
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('sort')).toBe('date,asc');
  });

  it('includes locale=* (accept all locales)', async () => {
    // The current buildTicketmasterUrl in fetch.ts does NOT include locale — RED.
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('locale')).toBe('*');
  });

  it('includes size=200 (Ticketmaster API maximum)', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('size')).toBe('200');
  });

  it('includes the apikey parameter', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('apikey')).toBe(TEST_API_KEY);
  });
});

// ============================================================================
// 3. 14-day rolling window loop
// ============================================================================

describe('ticketmasterConnector — 14-day rolling window loop', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse(makeTmPage([], 0, 1)));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('window 0 startDateTime is the startDate at 00:00:00Z', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('startDateTime')).toBe('2026-07-01T00:00:00Z');
  });

  it('window 0 endDateTime is startDate+13 at 23:59:59Z (14-day inclusive window)', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('endDateTime')).toBe('2026-07-14T23:59:59Z');
  });

  it('window 1 starts on startDate+14 (2026-07-15T00:00:00Z)', async () => {
    // Window 0 is empty (1 page) → second fetch is window 1, page 0.
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 1).searchParams.get('startDateTime')).toBe('2026-07-15T00:00:00Z');
  });

  it('queries exactly 5 windows covering 60+ days forward', async () => {
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();

    const startDateTimes = new Set(
      fetchMock.mock.calls.map((call) =>
        new URL(call[0] as string).searchParams.get('startDateTime')
      )
    );

    expect(startDateTimes.size).toBe(5);
    expect(startDateTimes.has('2026-07-01T00:00:00Z')).toBe(true); // window 0
    expect(startDateTimes.has('2026-07-15T00:00:00Z')).toBe(true); // window 1
    expect(startDateTimes.has('2026-07-29T00:00:00Z')).toBe(true); // window 2
    expect(startDateTimes.has('2026-08-12T00:00:00Z')).toBe(true); // window 3
    expect(startDateTimes.has('2026-08-26T00:00:00Z')).toBe(true); // window 4
  });
});

// ============================================================================
// 4. Pagination
// ============================================================================

describe('ticketmasterConnector — pagination', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('first page request uses page=0 (zero-indexed)', async () => {
    fetchMock.mockResolvedValue(okResponse(makeTmPage([], 0, 1)));
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();
    expect(fetchedUrl(fetchMock, 0).searchParams.get('page')).toBe('0');
  });

  it('fetches page=1 when totalPages > 1', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e0')], 0, 2))) // window 0 page 0
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1')], 1, 2))) // window 0 page 1
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));                      // remaining windows

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();

    expect(fetchedUrl(fetchMock, 0).searchParams.get('page')).toBe('0');
    expect(fetchedUrl(fetchMock, 1).searchParams.get('page')).toBe('1');
  });

  it('stops pagination after page.number === page.totalPages - 1', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e0')], 0, 2)))
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1')], 1, 2))) // final page
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await c.run();

    // page=2 must never be requested
    const allPages = fetchMock.mock.calls.map((call) =>
      new URL(call[0] as string).searchParams.get('page')
    );
    expect(allPages).not.toContain('2');
  });

  it('combines items from multiple pages of the same window', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('p0-a'), makeTmEvent('p0-b')], 0, 2)))
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('p1-a')], 1, 2)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const ids = result.items.map((i) => i.externalId);
    expect(ids).toContain('p0-a');
    expect(ids).toContain('p0-b');
    expect(ids).toContain('p1-a');
  });
});

// ============================================================================
// 5. Deep-paging cap
// ============================================================================

describe('ticketmasterConnector — deep-paging cap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops fetching pages within a window when maxPagesPerWindow is reached', async () => {
    const fetchMock = makeInfinitePagerMock(100);
    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({
      apiKey: TEST_API_KEY,
      startDate: START_DATE,
      pageSleepMs: 0,
      maxPagesPerWindow: 2,
    });
    await c.run();

    // Only page 0 and page 1 should be requested for window 0
    const window0Pages = fetchMock.mock.calls
      .filter((call) => new URL(call[0] as string).searchParams.get('startDateTime') === '2026-07-01T00:00:00Z')
      .map((call) => new URL(call[0] as string).searchParams.get('page'));

    expect(window0Pages).toHaveLength(2);
    expect(window0Pages).toContain('0');
    expect(window0Pages).toContain('1');
    expect(window0Pages).not.toContain('2');
  });

  it('result.errors contains a non-fatal warning when the cap is hit with more pages remaining', async () => {
    // totalPages: 10, cap: 1 → 9 pages unfetched per window
    const fetchMock = makeInfinitePagerMock(10, 1);
    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({
      apiKey: TEST_API_KEY,
      startDate: START_DATE,
      pageSleepMs: 0,
      maxPagesPerWindow: 1,
    });
    const result = await c.run();

    const capWarning = result.errors.find((e) => /cap|truncat/i.test(e));
    expect(capWarning).toBeDefined();
    // Non-fatal: items are still returned
    expect(result.items.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 6. Truncation sentinel (final page = 200 results)
// ============================================================================

describe('ticketmasterConnector — truncation sentinel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds a non-fatal truncation warning when the final page of a window has exactly 200 events', async () => {
    // 200-item single page — may mean TM silently truncated beyond 200.
    const fullPage = Array.from({ length: 200 }, (_, i) => makeTmEvent(`e${i}`));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage(fullPage, 0, 1))) // window 0: full page
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));            // windows 1-4: empty

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const sentinel = result.errors.find((e) => /200|truncat/i.test(e));
    expect(sentinel).toBeDefined();
    // Non-fatal: the 200 items are still present
    expect(result.items).toHaveLength(200);
  });

  it('does NOT add a truncation warning when the final page has fewer than 200 events', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('a'), makeTmEvent('b')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const sentinel = result.errors.find((e) => /truncat/i.test(e));
    expect(sentinel).toBeUndefined();
  });
});

// ============================================================================
// 7. Partial failure resilience — run() must not throw
// ============================================================================

describe('ticketmasterConnector — partial failure resilience', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('run() resolves (does not throw) when the API returns HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
    );
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await expect(c.run()).resolves.toBeDefined();
  });

  it('HTTP error result carries the status in errors and zero items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
    );
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('run() resolves (does not throw) when fetch itself rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')));
    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    await expect(c.run()).resolves.toBeDefined();
  });

  it('valid events from a subsequent window are returned even when an earlier window page fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' }) // window 0 fails
      .mockResolvedValue(okResponse(makeTmPage([makeTmEvent('valid-evt')], 0, 1)));         // windows 1-4 ok

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const ids = result.items.map((i) => i.externalId);
    expect(ids).toContain('valid-evt');
  });

  it('one bad item in a page does not drop the other valid items on that page', async () => {
    // Event with no dateTime is skipped by parseTicketmasterEvents — others should remain.
    const badEvent = makeTmEvent('bad', {
      dates: { status: { code: 'onsale' } }, // missing start.dateTime → parseTicketmasterEvents skips it
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        okResponse(makeTmPage([makeTmEvent('good-a'), badEvent, makeTmEvent('good-b')], 0, 1))
      )
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const ids = result.items.map((i) => i.externalId);
    expect(ids).toContain('good-a');
    expect(ids).toContain('good-b');
    expect(ids).not.toContain('bad');
  });

  it('adds a diagnostic error when a no-date/dateTBA event is skipped', async () => {
    const noDateEvent = makeTmEvent('date-tba', {
      dates: {
        start: {
          dateTBA: true,
          dateTBD: true,
          timeTBA: true,
          noSpecificTime: true,
        },
        status: { code: 'onsale' },
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        okResponse(makeTmPage([makeTmEvent('good'), noDateEvent], 0, 1))
      )
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items.map((item) => item.externalId)).not.toContain('date-tba');
    expect(
      result.errors.some((error) =>
        /date-tba/i.test(error) && /dateTBA|missing start|no date/i.test(error)
      )
    ).toBe(true);
  });
});

// ============================================================================
// 8. Stable external IDs
// ============================================================================

describe('ticketmasterConnector — stable external IDs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('externalId is sourced from event.id (upstream API identifier)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('G5vYZpYd1bujA')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items[0]?.externalId).toBe('G5vYZpYd1bujA');
  });

  it('the same upstream event id produces the same externalId on every run', async () => {
    const event = makeTmEvent('G5vYZpYd1bujA');
    const fetchMock = vi.fn().mockResolvedValue(okResponse(makeTmPage([event], 0, 1)));
    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const run1 = await c.run();
    const run2 = await c.run();

    expect(run1.items[0]?.externalId).toBe('G5vYZpYd1bujA');
    expect(run1.items[0]?.externalId).toBe(run2.items[0]?.externalId);
  });
});

// ============================================================================
// 9. Source URL preservation (link-first)
// ============================================================================

describe('ticketmasterConnector — source URL preservation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('externalUrl is the Ticketmaster event page URL from event.url', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('test-id')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items[0]?.externalUrl).toBe('https://www.ticketmaster.co.uk/event/test-id');
  });

  it('externalUrl is an absolute HTTPS URL on every returned item', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1'), makeTmEvent('e2')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    for (const item of result.items) {
      expect(item.externalUrl).toMatch(/^https:\/\//);
    }
  });

  it('ticketUrlGuess equals externalUrl (Ticketmaster is both source and ticket seller)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('test-id')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    const item = result.items[0];
    expect(item?.ticketUrlGuess).toBe(item?.externalUrl);
  });

  it('ticketUrlLabelGuess is "Buy on Ticketmaster" (attribution requirement)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('test-id')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items[0]?.ticketUrlLabelGuess).toBe('Buy on Ticketmaster');
  });
});

// ============================================================================
// 10. Image URL handling — ADR 0004
// ============================================================================

describe('ticketmasterConnector — image URL handling (ADR 0004)', () => {
  // ADR 0004 decision: store Ticketmaster CDN URL in imageUrlGuess; hot-link at render time.
  // Do NOT download or cache image binaries. Attribution label must be adjacent on frontend.

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('imageUrlGuess is the Ticketmaster CDN HTTPS URL (not a cached binary, not null)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('img-id')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items[0]?.imageUrlGuess).toBe(
      'https://s1.ticketimg.com/dam/img-id_16_9.jpg'
    );
  });

  it('imageUrlGuess is an absolute HTTPS URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('img-id')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.items[0]?.imageUrlGuess).toMatch(/^https:\/\//);
  });

  it('imageUrlGuess is undefined (not null, not empty string) when no suitable image exists', async () => {
    const noImageEvent = makeTmEvent('no-img', { images: [] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([noImageEvent], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    // exactOptionalPropertyTypes: field must be absent, not set to undefined
    expect('imageUrlGuess' in (result.items[0] ?? {})).toBe(false);
  });

  it('selects the widest 16:9 image at or above 640px (ADR 0004 selection algorithm)', async () => {
    const multiImageEvent = makeTmEvent('multi-img', {
      images: [
        { ratio: '16_9', url: 'https://s1.ticketimg.com/narrow.jpg', width: 640, height: 360, fallback: false },
        { ratio: '16_9', url: 'https://s1.ticketimg.com/wide.jpg', width: 1024, height: 576, fallback: false },
        { ratio: '4_3', url: 'https://s1.ticketimg.com/wrong-ratio.jpg', width: 2000, height: 1500, fallback: false },
      ],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([multiImageEvent], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    // Must pick widest 16:9 (1024px), not the wider 4:3 (2000px) nor narrower 16:9 (640px)
    expect(result.items[0]?.imageUrlGuess).toBe('https://s1.ticketimg.com/wide.jpg');
  });

  it('externalUrl is always present alongside imageUrlGuess (ADR 0004 prohibition)', async () => {
    // ADR 0004: "Do not store image_url without an accompanying externalUrl linking back."
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1'), makeTmEvent('e2')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    for (const item of result.items) {
      if (item.imageUrlGuess !== undefined) {
        expect(item.externalUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

// ============================================================================
// 11. Link-first compliance — no full descriptions stored
// ============================================================================

describe('ticketmasterConnector — link-first compliance', () => {
  it('items contain only the 18 recognised RawEvent fields (no description, summary, or other extras)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1'), makeTmEvent('e2')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    for (const item of result.items) {
      const unknownKeys = Object.keys(item).filter(
        (k) => !RAW_EVENT_KEYS.includes(k as keyof RawEvent)
      );
      expect(unknownKeys, `Unexpected extra keys: ${unknownKeys.join(', ')}`).toHaveLength(0);
    }

    vi.unstubAllGlobals();
  });
});

// ============================================================================
// 12. Result counts
// ============================================================================

describe('ticketmasterConnector — result counts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchedCount equals the total raw events received from the API across all windows', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1'), makeTmEvent('e2')], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.fetchedCount).toBe(2);
  });

  it('parsedCount equals result.items.length (valid items only)', async () => {
    // One event is missing dateTime → parser skips it, reducing parsedCount below fetchedCount.
    const badEvent = makeTmEvent('bad', { dates: { status: { code: 'onsale' } } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('good'), badEvent], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.parsedCount).toBe(result.items.length);
    expect(result.items.length).toBe(1);
  });

  it('fetchedCount > parsedCount when some events are skipped by the parser', async () => {
    const badEvent = makeTmEvent('bad', { dates: { status: { code: 'onsale' } } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('good'), badEvent], 0, 1)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.fetchedCount).toBeGreaterThan(result.parsedCount);
  });

  it('errors is empty for a clean two-page single-window run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e1')], 0, 2)))
      .mockResolvedValueOnce(okResponse(makeTmPage([makeTmEvent('e2')], 1, 2)))
      .mockResolvedValue(okResponse(makeTmPage([], 0, 1)));

    vi.stubGlobal('fetch', fetchMock);

    const c = createTicketmasterConnector({ apiKey: TEST_API_KEY, startDate: START_DATE, pageSleepMs: 0 });
    const result = await c.run();

    expect(result.errors).toHaveLength(0);
  });

  it('run() with empty API key returns error in IngestResult without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
    );
    const c = createTicketmasterConnector({ apiKey: '', startDate: START_DATE, pageSleepMs: 0 });
    await expect(c.run()).resolves.toBeDefined();
    const result = await c.run();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
