import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RawEvent } from '../../connector.js';
import { validateIngestResult } from '../../validate.js';
import { parseDataThistleEvents } from './parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  'isAllDay',
  'raw',
];

function readFixture(name: string): unknown[] {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf-8')
  ) as unknown[];
}

function fixtureEvent(name: string): Record<string, unknown> {
  const [event] = readFixture(name);
  return event as Record<string, unknown>;
}

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status: 'live',
    name: 'Synthetic Inline Event',
    website: 'https://example.test/events/synthetic-inline-event',
    tags: ['music'],
    schedules: [
      {
        place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        place: {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          name: 'Example Inline Venue',
        },
        performances: [
          {
            ts: '2026-07-20T20:00:00+01:00',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function parseOne(event: Record<string, unknown>) {
  return parseDataThistleEvents([event]);
}

describe('parseDataThistleEvents', () => {
  it('returns one RawEvent from the single-performance fixture', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('Synthetic Music Night');
  });

  it('returns multiple RawEvents from one event with multiple performances', () => {
    const result = parseDataThistleEvents(readFixture('multi-performance'));

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items.map(item => item.startAt)).toEqual([
      '2026-08-01T13:00:00Z',
      '2026-08-01T18:30:00Z',
    ]);
  });

  it('returns one RawEvent per performance across multiple schedules/places', () => {
    const event = makeEvent({
      event_id: 'abababab-abab-4aba-8aba-abababababab',
      schedules: [
        {
          place_id: 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
          place: { name: 'Example First Room' },
          performances: [{ ts: '2026-07-20T20:00:00+01:00' }],
        },
        {
          place_id: 'efefefef-efef-4efe-8efe-efefefefefef',
          place: { name: 'Example Second Room' },
          performances: [{ ts: '2026-07-20T20:00:00+01:00' }],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items.map(item => item.venueName)).toEqual([
      'Example First Room',
      'Example Second Room',
    ]);
    expect(result.items.map(item => item.externalId)).toEqual([
      'datathistle:abababab-abab-4aba-8aba-abababababab:cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd:2026-07-20T20:00:00+01:00',
      'datathistle:abababab-abab-4aba-8aba-abababababab:efefefef-efef-4efe-8efe-efefefefefef:2026-07-20T20:00:00+01:00',
    ]);
  });

  it('builds composite external IDs from event_id, place_id, and performance timestamp', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));

    expect(result.items[0]?.externalId).toBe(
      'datathistle:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:2026-07-10T19:00:00+01:00'
    );
  });

  it('never uses event_id alone as the external identity', () => {
    const event = fixtureEvent('single-performance');
    const result = parseDataThistleEvents([event]);

    expect(result.items[0]?.externalId).not.toBe(event['event_id']);
  });

  it('stores only minimal source identifiers and occurrence context in raw', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));
    const raw = result.items[0]?.raw as Record<string, unknown>;

    expect(raw['source']).toBe('datathistle');
    expect(raw['eventId']).toBe('11111111-1111-4111-8111-111111111111');
    expect(raw['placeId']).toBe('22222222-2222-4222-8222-222222222222');
    expect(raw['performanceTs']).toBe('2026-07-10T19:00:00+01:00');
    expect(raw['schedule']).toBeDefined();
    expect(raw).not.toHaveProperty('description');
    expect(raw).not.toHaveProperty('descriptions');
    expect(raw).not.toHaveProperty('images');
  });

  it('maps startAt from performance timestamp and derives endAt only from structured duration', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));

    expect(result.items[0]?.startAt).toBe('2026-07-10T18:00:00Z');
    expect(result.items[0]?.endAt).toBe('2026-07-10T20:00:00Z');
  });

  it('uses event website as externalUrl when it is clearly user-facing HTTPS', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));

    expect(result.items[0]?.externalUrl).toBe(
      'https://example.test/events/synthetic-music-night'
    );
  });

  it('falls back to a clearly typed HTTPS booking link when website is absent', () => {
    const event = makeEvent({
      website: undefined,
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [
            {
              ts: '2026-07-20T20:00:00+01:00',
              links: [{ type: 'booking', url: 'https://example.test/tickets/inline' }],
            },
          ],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.errors).toHaveLength(0);
    expect(result.items[0]?.externalUrl).toBe('https://example.test/tickets/inline');
    expect(result.items[0]?.ticketUrlGuess).toBe('https://example.test/tickets/inline');
  });

  it('skips an occurrence when no safe HTTPS externalUrl is available', () => {
    const event = makeEvent({
      website: 'http://example.test/not-safe',
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [{ ts: '2026-07-20T20:00:00+01:00' }],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/externalUrl/i);
  });

  it('does not use ambiguous non-booking links as externalUrl fallback', () => {
    const event = makeEvent({
      website: undefined,
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [
            {
              ts: '2026-07-20T20:00:00+01:00',
              links: [{ type: 'social', url: 'https://example.test/social/inline' }],
            },
          ],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.items).toHaveLength(0);
    expect(result.errors[0]).toMatch(/externalUrl/i);
  });

  it('skips offset-less performance timestamps instead of normalising unstable source data', () => {
    const event = makeEvent({
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [{ ts: '2026-07-20T20:00:00' }],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.items).toHaveLength(0);
    expect(result.errors[0]).toMatch(/timezone|offset/i);
  });

  it('skips malformed performances without crashing', () => {
    const event = makeEvent({
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [{}],
        },
      ],
    });

    const result = parseOne(event);

    expect(result.items).toHaveLength(0);
    expect(result.errors[0]).toMatch(/performance ts/i);
  });

  it('maps venue name while missing optional venue fields do not fail parsing', () => {
    const result = parseDataThistleEvents(readFixture('missing-venue-fields'));

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.venueName).toBe('Example Workshop Room');
  });

  it('does not fail parsing or imply free when price is missing', () => {
    const result = parseDataThistleEvents(readFixture('missing-price'));

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.priceMinGuess).toBeUndefined();
    expect(result.items[0]?.priceMaxGuess).toBeUndefined();
    expect(result.items[0]?.isFreeGuess).toBeUndefined();
  });

  it('maps price min/max/free only from structured GBP ticket fields', () => {
    const paid = parseDataThistleEvents(readFixture('single-performance'));
    const free = parseDataThistleEvents(readFixture('categories-tags'));

    expect(paid.items[0]?.priceMinGuess).toBe(10);
    expect(paid.items[0]?.priceMaxGuess).toBe(15);
    expect(paid.items[0]?.isFreeGuess).toBe(false);
    expect(free.items[0]?.priceMinGuess).toBe(0);
    expect(free.items[0]?.priceMaxGuess).toBe(0);
    expect(free.items[0]?.isFreeGuess).toBe(true);
  });

  it('does not map ticket description text', () => {
    const event = makeEvent({
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue' },
          performances: [
            {
              ts: '2026-07-20T20:00:00+01:00',
              tickets: [
                {
                  currency: 'GBP',
                  min_price: 5,
                  max_price: 7,
                  description: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = parseOne(event);
    const raw = result.items[0]?.raw as Record<string, unknown>;

    expect(result.items[0]).not.toHaveProperty('priceDisplayGuess');
    expect(JSON.stringify(raw)).not.toContain('description');
  });

  it('skips deleted/non-live events conservatively', () => {
    const result = parseDataThistleEvents(readFixture('non-live-status'));

    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/non-live|deleted/i);
  });

  it('maps obvious tags to local eventTypeGuess values and preserves fixture-safe tags', () => {
    const result = parseDataThistleEvents(readFixture('categories-tags'));

    expect(result.errors).toHaveLength(0);
    expect(result.items[0]?.eventTypeGuess).toBe('comedy');
    expect(result.items[0]?.tagsGuess).toEqual(['comedy', 'fixture-only-tag']);
  });

  it('falls back safely when tags are unknown', () => {
    const result = parseOne(makeEvent({ tags: ['fixture-only-unknown'] }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.eventTypeGuess).toBeUndefined();
    expect(result.items[0]?.tagsGuess).toEqual(['fixture-only-unknown']);
  });

  it('preserves source tag text while mapping obvious tags case-insensitively', () => {
    const result = parseOne(makeEvent({ tags: ['Comedy', 'Fixture-Only-Tag'] }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.eventTypeGuess).toBe('comedy');
    expect(result.items[0]?.tagsGuess).toEqual(['Comedy', 'Fixture-Only-Tag']);
  });

  it('ignores descriptions even if an upstream payload accidentally includes the field', () => {
    const event = makeEvent({
      description: [{ type: 'third-party' }],
      descriptions: [{ type: 'third-party' }],
    });

    const result = parseOne(event);
    const item = result.items[0];
    const raw = item?.raw as Record<string, unknown>;

    expect(item).not.toHaveProperty('description');
    expect(item).not.toHaveProperty('summary');
    expect(raw).not.toHaveProperty('description');
    expect(raw).not.toHaveProperty('descriptions');
  });

  it('ignores images and image metadata even if an upstream payload accidentally includes those fields', () => {
    const event = makeEvent({
      images: [{}],
      schedules: [
        {
          place_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          place: { name: 'Example Inline Venue', images: [{}] },
          performances: [{ ts: '2026-07-20T20:00:00+01:00' }],
        },
      ],
    });

    const result = parseOne(event);
    const item = result.items[0];
    const raw = item?.raw as Record<string, unknown>;

    expect(item?.imageUrlGuess).toBeUndefined();
    expect(raw).not.toHaveProperty('images');
    expect(JSON.stringify(raw)).not.toContain('images');
  });

  it('emits only recognised RawEvent keys', () => {
    const result = parseDataThistleEvents(readFixture('single-performance'));

    for (const item of result.items) {
      const unknownKeys = Object.keys(item).filter(
        key => !RAW_EVENT_KEYS.includes(key as keyof RawEvent)
      );
      expect(unknownKeys).toHaveLength(0);
    }
  });

  it('emitted RawEvents pass existing connector validation', () => {
    const events = [
      ...readFixture('single-performance'),
      ...readFixture('multi-performance'),
      ...readFixture('missing-price'),
      ...readFixture('missing-venue-fields'),
      ...readFixture('categories-tags'),
    ];
    const result = parseDataThistleEvents(events);

    const validated = validateIngestResult({
      fetchedCount: events.length,
      parsedCount: result.items.length,
      items: result.items,
      errors: result.errors,
    });

    expect(validated.errors).toHaveLength(0);
    expect(validated.items).toHaveLength(result.items.length);
    expect(validated.parsedCount).toBe(result.items.length);
  });
});
