import { vi, describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertExternalEvents } from './upsertExternalEvents.js';

// Test fixtures representing RawEvent shapes (structurally equivalent to
// parseTicketmasterEvents output; externalId/imageUrl values match parse.test.ts
// assertions so this test and the parser test cross-reference the same fixture).

// Fully-populated event — all 17 RawEvent fields present.
const MOGWAI = {
  externalId: 'G5vYZpYd1bujA',
  externalUrl: 'https://www.ticketmaster.co.uk/mogwai-tickets/artist/735616',
  title: 'Mogwai',
  startAt: '2026-07-05T18:00:00Z',
  endAt: '2026-07-05T21:00:00Z',
  doorsAt: '2026-07-05T17:30:00Z',
  venueName: 'Barrowland Ballroom',
  eventTypeGuess: 'kzfzniwnszyfz7v7nj',
  tagsGuess: ['rock', 'post-rock'] as string[],
  priceMinGuess: 22.5,
  priceMaxGuess: 30,
  isFreeGuess: false,
  ticketUrlGuess: 'https://www.ticketmaster.co.uk/mogwai-tickets/artist/735616',
  ticketUrlLabelGuess: 'Buy on Ticketmaster',
  imageUrlGuess:
    'https://s1.ticketimg.com/dam/a/b3e/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d_EVENT_DETAIL_PAGE_16_9.jpg',
  availabilityGuess: 'onsale',
  raw: { id: 'G5vYZpYd1bujA', name: 'Mogwai' },
};

// Sparse event — optional pricing, doors, end, tags absent.
// imageUrlGuess matches parse.test.ts assertion for the Scottish Ballet fixture event.
const BALLET = {
  externalId: 'G5vYZpYd1bujB',
  externalUrl: 'https://www.ticketmaster.co.uk/scottish-ballet-swan-lake-glasgow-tickets',
  title: 'Scottish Ballet: Swan Lake',
  startAt: '2026-07-10T19:30:00Z',
  venueName: 'Theatre Royal',
  eventTypeGuess: 'kzfzniwnszyfz7v7na',
  ticketUrlGuess: 'https://www.ticketmaster.co.uk/scottish-ballet-swan-lake-glasgow-tickets',
  ticketUrlLabelGuess: 'Buy on Ticketmaster',
  imageUrlGuess:
    'https://s1.ticketimg.com/dam/a/f9c/9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f_EVENT_DETAIL_PAGE_16_9.jpg',
  availabilityGuess: 'onsale',
  raw: { id: 'G5vYZpYd1bujB', name: 'Scottish Ballet: Swan Lake' },
};

const SOURCE_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

function makeClient() {
  const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });
  return {
    client: { from: mockFrom } as unknown as SupabaseClient,
    mockFrom,
    mockUpsert,
  };
}

type UpsertCall = [rows: Record<string, unknown>[], options: Record<string, unknown>];

function capturedRows(
  mockUpsert: ReturnType<typeof vi.fn>,
  callIndex = 0,
): Record<string, unknown>[] {
  return (mockUpsert.mock.calls[callIndex] as UpsertCall)[0];
}

function capturedOptions(
  mockUpsert: ReturnType<typeof vi.fn>,
  callIndex = 0,
): Record<string, unknown> {
  return (mockUpsert.mock.calls[callIndex] as UpsertCall)[1];
}

describe('upsertExternalEvents', () => {
  describe('database call shape', () => {
    it('calls .from("external_events").upsert()', async () => {
      const { client, mockFrom, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      expect(mockFrom).toHaveBeenCalledWith('external_events');
      expect(mockUpsert).toHaveBeenCalledOnce();
    });

    it('uses onConflict: "source_id,external_id" to enable within-source upsert', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      expect(capturedOptions(mockUpsert)).toMatchObject({
        onConflict: 'source_id,external_id',
      });
    });

    it('sends all events in a single upsert call (not one call per event)', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI, BALLET]);
      expect(mockUpsert).toHaveBeenCalledOnce();
      expect(capturedRows(mockUpsert)).toHaveLength(2);
    });
  });

  describe('column mapping — fully-populated event (Mogwai)', () => {
    it('maps source_id from the sourceId argument', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      expect(capturedRows(mockUpsert)[0]).toMatchObject({ source_id: SOURCE_ID });
    });

    it('maps all 17 RawEvent camelCase fields to snake_case external_events columns', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      const row = capturedRows(mockUpsert)[0]!;

      expect(row['external_id']).toBe('G5vYZpYd1bujA');
      expect(row['external_url']).toBe(MOGWAI.externalUrl);
      expect(row['title']).toBe('Mogwai');
      expect(row['start_at']).toBe('2026-07-05T18:00:00Z');
      expect(row['end_at']).toBe('2026-07-05T21:00:00Z');
      expect(row['doors_at']).toBe('2026-07-05T17:30:00Z');
      expect(row['venue_name']).toBe('Barrowland Ballroom');
      expect(row['event_type_guess']).toBe('kzfzniwnszyfz7v7nj');
      expect(row['tags_guess']).toEqual(['rock', 'post-rock']);
      expect(row['price_min_guess']).toBe(22.5);
      expect(row['price_max_guess']).toBe(30);
      expect(row['is_free_guess']).toBe(false);
      expect(row['ticket_url_guess']).toBe(MOGWAI.ticketUrlGuess);
      expect(row['ticket_url_label_guess']).toBe('Buy on Ticketmaster');
      expect(row['image_url_guess']).toBe(MOGWAI.imageUrlGuess);
      expect(row['availability_guess']).toBe('onsale');
      expect(row['raw']).toEqual(MOGWAI.raw);
    });

    it('sets is_deleted = false on every upserted row', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      expect(capturedRows(mockUpsert)[0]).toMatchObject({ is_deleted: false });
    });

    it('sets last_seen_at to a current ISO 8601 timestamp', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      const lastSeenAt = capturedRows(mockUpsert)[0]!['last_seen_at'];
      expect(lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('does not include first_seen_at in the upsert payload (left to DB default)', async () => {
      // first_seen_at must not be sent — if it were, the ON CONFLICT UPDATE would
      // overwrite it on every run, losing the original ingestion timestamp.
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      expect(capturedRows(mockUpsert)[0]).not.toHaveProperty('first_seen_at');
    });
  });

  describe('optional field handling — sparse event (Scottish Ballet)', () => {
    it('omits end_at from the row when RawEvent has no endAt', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [BALLET]);
      expect(capturedRows(mockUpsert)[0]).not.toHaveProperty('end_at');
    });

    it('omits doors_at from the row when RawEvent has no doorsAt', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [BALLET]);
      expect(capturedRows(mockUpsert)[0]).not.toHaveProperty('doors_at');
    });

    it('omits price_min_guess / price_max_guess / is_free_guess when absent from RawEvent', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [BALLET]);
      const row = capturedRows(mockUpsert)[0];
      expect(row).not.toHaveProperty('price_min_guess');
      expect(row).not.toHaveProperty('price_max_guess');
      expect(row).not.toHaveProperty('is_free_guess');
    });

    it('omits tags_guess from the row when RawEvent has no tagsGuess', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [BALLET]);
      expect(capturedRows(mockUpsert)[0]).not.toHaveProperty('tags_guess');
    });
  });

  describe('multi-row: source_id is the same for all rows', () => {
    it('assigns SOURCE_ID to every row in the batch', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI, BALLET]);
      for (const row of capturedRows(mockUpsert)) {
        expect(row['source_id']).toBe(SOURCE_ID);
      }
    });
  });

  describe('idempotency — calling twice with the same data', () => {
    it('does not throw on the second call', async () => {
      const { client } = makeClient();
      await expect(upsertExternalEvents(client, SOURCE_ID, [MOGWAI])).resolves.not.toThrow();
      await expect(upsertExternalEvents(client, SOURCE_ID, [MOGWAI])).resolves.not.toThrow();
    });

    it('second call sends the same external_id (upsert target is stable)', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      const firstId = capturedRows(mockUpsert, 0)[0]!['external_id'];
      const secondId = capturedRows(mockUpsert, 1)[0]!['external_id'];
      expect(firstId).toBe(secondId);
    });
  });

  describe('update on change — mutated fields appear in the second upsert payload', () => {
    it('reflects an updated title', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      await upsertExternalEvents(client, SOURCE_ID, [{ ...MOGWAI, title: 'Mogwai (SOLD OUT)' }]);
      expect(capturedRows(mockUpsert, 1)[0]!['title']).toBe('Mogwai (SOLD OUT)');
    });

    it('reflects an updated availability_guess', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      await upsertExternalEvents(client, SOURCE_ID, [
        { ...MOGWAI, availabilityGuess: 'offsale' },
      ]);
      expect(capturedRows(mockUpsert, 1)[0]!['availability_guess']).toBe('offsale');
    });

    it('reflects updated price fields', async () => {
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      await upsertExternalEvents(client, SOURCE_ID, [
        { ...MOGWAI, priceMinGuess: 25, priceMaxGuess: 35 },
      ]);
      const row = capturedRows(mockUpsert, 1)[0]!;
      expect(row['price_min_guess']).toBe(25);
      expect(row['price_max_guess']).toBe(35);
    });

    it('reflects an updated image_url_guess', async () => {
      const newImage = 'https://s1.ticketimg.com/updated-image_EVENT_DETAIL_PAGE_16_9.jpg';
      const { client, mockUpsert } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI]);
      await upsertExternalEvents(client, SOURCE_ID, [
        { ...MOGWAI, imageUrlGuess: newImage },
      ]);
      expect(capturedRows(mockUpsert, 1)[0]!['image_url_guess']).toBe(newImage);
    });
  });

  describe('isolation — does not write to the canonical events table', () => {
    it('never calls .from("events")', async () => {
      const { client, mockFrom } = makeClient();
      await upsertExternalEvents(client, SOURCE_ID, [MOGWAI, BALLET]);
      const calledTables = (mockFrom.mock.calls as [string][]).map(([table]) => table);
      expect(calledTables).not.toContain('events');
    });
  });
});
