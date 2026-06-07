import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RawEvent } from '../../connector.js';
import { parseTicketmasterEvents } from './parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/response.json'), 'utf-8')
) as { _embedded: { events: unknown[] } };

// All 17 fields from the RawEvent interface — used to verify no extraneous keys
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
  'raw',
];

describe('parseTicketmasterEvents', () => {
  describe('event count', () => {
    it('returns 2 RawEvents from the 2-event fixture', () => {
      const result = parseTicketmasterEvents(fixture);
      expect(result).toHaveLength(2);
    });
  });

  describe('17-field RawEvent contract', () => {
    it('each returned item contains only recognised RawEvent keys', () => {
      const result = parseTicketmasterEvents(fixture);
      for (const item of result) {
        const unknownKeys = Object.keys(item).filter(
          k => !RAW_EVENT_KEYS.includes(k as keyof RawEvent)
        );
        expect(unknownKeys).toHaveLength(0);
      }
    });

    it('each item has the four required fields: externalId, externalUrl, title, raw', () => {
      const result = parseTicketmasterEvents(fixture);
      for (const item of result) {
        expect(item.externalId).toBeTruthy();
        expect(item.externalUrl).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.raw).toBeDefined();
      }
    });

    it('externalUrl is an absolute HTTPS URL on each item', () => {
      const result = parseTicketmasterEvents(fixture);
      for (const item of result) {
        expect(item.externalUrl).toMatch(/^https:\/\//);
      }
    });

    it('startAt is an ISO 8601 UTC string on each item', () => {
      const result = parseTicketmasterEvents(fixture);
      for (const item of result) {
        expect(item.startAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      }
    });
  });

  describe('Mogwai event (index 0)', () => {
    it('maps title from event.name', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.title).toBe('Mogwai');
    });

    it('maps externalId from event.id', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.externalId).toBe('G5vYZpYd1bujA');
    });

    it('maps externalUrl from event.url (Ticketmaster source URL)', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.externalUrl).toBe(
        'https://www.ticketmaster.co.uk/mogwai-tickets/artist/735616'
      );
    });

    it('maps startAt from event.dates.start.dateTime (already UTC)', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.startAt).toBe('2026-07-05T18:00:00Z');
    });

    it('maps doorsAt from event.dates.doorOpenTime when present', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.doorsAt).toBe('2026-07-05T17:30:00Z');
    });

    it('maps eventTypeGuess to the lowercased primary segment ID (Music → live_music via source_type_category_map)', () => {
      // 'KZFzniwnSyZfZ7v7nJ' lowercased → 'kzfzniwnsyzfz7v7nj'
      // Maps to live_music via B5 seed corrected by fix_ticketmaster_segment_ids migration
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.eventTypeGuess).toBe('kzfzniwnsyzfz7v7nj');
    });

    it('selects the widest 16:9 image ≥ 640px wide as imageUrlGuess (1024px chosen over 640px)', () => {
      // E1 image policy: filter 16:9 AND width >= 640, sort desc by width, take first
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.imageUrlGuess).toBe(
        'https://s1.ticketimg.com/dam/a/b3e/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d_EVENT_DETAIL_PAGE_16_9.jpg'
      );
      expect(mogwai?.imageUrlGuess).toMatch(/^https:\/\//);
    });

    it('maps priceMinGuess and priceMaxGuess from priceRanges[0]', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.priceMinGuess).toBe(22.5);
      expect(mogwai?.priceMaxGuess).toBe(30);
    });

    it('isFreeGuess is false when priceRanges[0].min is non-zero (22.50)', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.isFreeGuess).toBe(false);
    });

    it('maps ticketUrlGuess to event.url (TM is both source and seller)', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.ticketUrlGuess).toBe(
        'https://www.ticketmaster.co.uk/mogwai-tickets/artist/735616'
      );
    });

    it('sets ticketUrlLabelGuess to "Buy on Ticketmaster"', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.ticketUrlLabelGuess).toBe('Buy on Ticketmaster');
    });

    it('maps venueName from _embedded.venues[0].name', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.venueName).toBe('Barrowland Ballroom');
    });

    it('maps availabilityGuess from dates.status.code', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect(mogwai?.availabilityGuess).toBe('onsale');
    });

    it('stores the full upstream event object in raw', () => {
      const [mogwai] = parseTicketmasterEvents(fixture);
      expect((mogwai?.raw as Record<string, unknown>)?.id).toBe('G5vYZpYd1bujA');
    });
  });

  describe('Scottish Ballet event (index 1)', () => {
    it('maps title from event.name', () => {
      const [, ballet] = parseTicketmasterEvents(fixture);
      expect(ballet?.title).toBe('Scottish Ballet: Swan Lake');
    });

    it('doorsAt is undefined when event.dates.doorOpenTime is absent', () => {
      const [, ballet] = parseTicketmasterEvents(fixture);
      expect(ballet?.doorsAt).toBeUndefined();
    });

    it('maps eventTypeGuess to the lowercased Arts & Theatre segment ID (→ arts_exhibition)', () => {
      // 'KZFzniwnSyZfZ7v7na' lowercased → 'kzfzniwnsyzfz7v7na'
      // Maps to arts_exhibition via B5 seed corrected by fix_ticketmaster_segment_ids migration
      const [, ballet] = parseTicketmasterEvents(fixture);
      expect(ballet?.eventTypeGuess).toBe('kzfzniwnsyzfz7v7na');
    });

    it('imageUrlGuess is an absolute HTTPS URL (16:9 at 1024px selected)', () => {
      const [, ballet] = parseTicketmasterEvents(fixture);
      expect(ballet?.imageUrlGuess).toBe(
        'https://s1.ticketimg.com/dam/a/f9c/9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f_EVENT_DETAIL_PAGE_16_9.jpg'
      );
      expect(ballet?.imageUrlGuess).toMatch(/^https:\/\//);
    });
  });

  describe('isFreeGuess — absent priceRanges must not imply free', () => {
    it('isFreeGuess is undefined (not false or true) when priceRanges is absent from the event', () => {
      // Absence of pricing data from the API does not mean the event is free.
      // Only priceRanges[0].min === 0 should produce isFreeGuess = true.
      const noPriceFixture = {
        _embedded: {
          events: [
            {
              id: 'no-price-001',
              name: 'No Price Event',
              url: 'https://www.ticketmaster.co.uk/no-price-001',
              images: [],
              dates: {
                start: {
                  dateTime: '2026-08-01T19:00:00Z',
                  localDate: '2026-08-01',
                  localTime: '20:00:00',
                  dateTBD: false,
                  dateTBA: false,
                  timeTBA: false,
                  noSpecificTime: false,
                },
                timezone: 'Europe/London',
                status: { code: 'onsale' },
              },
              classifications: [],
              _embedded: { venues: [] },
              // priceRanges intentionally absent
            },
          ],
        },
      };

      const result = parseTicketmasterEvents(noPriceFixture);
      expect(result).toHaveLength(1);
      expect(result[0]?.isFreeGuess).toBeUndefined();
    });
  });
});
