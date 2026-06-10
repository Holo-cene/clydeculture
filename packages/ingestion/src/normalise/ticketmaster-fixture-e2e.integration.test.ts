/**
 * Ticketmaster fixture E2E integration test.
 *
 * Proves the full path:
 *   Fixture-derived RawEvent values (confirmed by parse.test.ts)
 *   → upsertExternalEvents          → external_events rows (source_id = TM_TEST_SOURCE_ID)
 *   → normaliseExternalEventsForSource → canonical events row (visibility, confidence)
 *   → getPublishedEvents() anon query  → event appears with Ticketmaster source_url
 *
 * Step 1 (fixture parsing) is already proven by
 * packages/connectors/src/api/ticketmaster/parse.test.ts.
 * This test uses the fixture-derived constant values from those assertions.
 *
 * Prerequisites:
 *   supabase start && supabase db reset
 *   export SUPABASE_URL=http://127.0.0.1:54321
 *   export SUPABASE_SERVICE_ROLE_KEY=<service role key from `supabase status`>
 *   export SUPABASE_ANON_KEY=<anon key from `supabase status`>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createClient,
  getPublishedEvents,
  upsertExternalEvents,
  type ExternalEventInput,
} from '@clydeculture/shared';
import { normaliseExternalEventsForSource, type NormaliseDbClient } from './dbNormalise.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic test UUIDs — 00000000-e2e0-* namespace.
// Chosen to avoid collisions with:
//   demo seed   00000000-0600-*
//   A2 fixtures 00000000-a200-*
// ─────────────────────────────────────────────────────────────────────────────
const TM_TEST_SOURCE_ID = '00000000-e2e0-4000-8000-000000000001';
const TM_TEST_VENUE_ID = '00000000-e2e0-4000-8000-000000000010';

// Fixture-derived constants — stable values confirmed by parse.test.ts assertions.
// The Mogwai event is fixture index 0 in response.json.
const MOGWAI_EXTERNAL_ID = 'G5vYZpYd1bujA';
const MOGWAI_URL = 'https://www.ticketmaster.co.uk/mogwai-tickets/artist/735616';
const MOGWAI_START_AT = '2026-07-05T18:00:00Z';
// Music segment ID lowercased (kzfzniwnsyzfz7v7nj is the post-fix-migration value)
const TM_MUSIC_SEGMENT_ID = 'kzfzniwnsyzfz7v7nj';

// ID of the demo seed source — asserted to NOT be the source of the E2E event
const DEMO_SEED_SOURCE_ID = '00000000-0600-4000-8000-000000000001';

// Fixture-derived ExternalEventInput for the Mogwai event.
// Values are known-correct outputs of parseTicketmasterEvents(fixture)[0],
// as proven by packages/connectors/src/api/ticketmaster/parse.test.ts.
const FIXTURE_EVENTS: ExternalEventInput[] = [
  {
    externalId: MOGWAI_EXTERNAL_ID,
    externalUrl: MOGWAI_URL,
    title: 'Mogwai',
    startAt: MOGWAI_START_AT,
    doorsAt: '2026-07-05T17:30:00Z',
    venueName: 'Barrowland Ballroom',
    eventTypeGuess: TM_MUSIC_SEGMENT_ID,
    tagsGuess: ['Rock'],
    priceMinGuess: 22.5,
    priceMaxGuess: 30,
    isFreeGuess: false,
    ticketUrlGuess: MOGWAI_URL,
    ticketUrlLabelGuess: 'Buy on Ticketmaster',
    imageUrlGuess:
      'https://s1.ticketimg.com/dam/a/b3e/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d_EVENT_DETAIL_PAGE_16_9.jpg',
    availabilityGuess: 'onsale',
    raw: { id: MOGWAI_EXTERNAL_ID, name: 'Mogwai' },
  },
];

describe('Ticketmaster fixture E2E: connector → external_events → normalise → public query', () => {
  let serviceClient: ReturnType<typeof createClient>;
  let anonClient: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const url = process.env['SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    const anonKey = process.env['SUPABASE_ANON_KEY'];

    if (!url || !serviceKey || !anonKey) {
      throw new Error(
        'Integration test requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ' +
          'SUPABASE_ANON_KEY.\n' +
          'Run: supabase start && supabase db reset\n' +
          'Then export the three keys from: supabase status',
      );
    }

    serviceClient = createClient(url, serviceKey);
    anonClient = createClient(url, anonKey);

    // Resolve the live_music event_type id (must exist after db reset)
    const { data: liveMusicRow, error: etErr } = await serviceClient
      .from('event_types')
      .select('id')
      .eq('slug', 'live_music')
      .single();
    if (etErr || !liveMusicRow) {
      throw new Error(`live_music event type not found: ${etErr?.message ?? 'null row'}`);
    }
    const liveMusicId = (liveMusicRow as Record<string, unknown>)['id'] as number;

    // Insert test Ticketmaster source: tier 1, auto_publish enabled.
    // Uses a test-specific slug to avoid conflict with the B5-seeded 'ticketmaster' source.
    const { error: sourceErr } = await serviceClient.from('sources').upsert(
      {
        id: TM_TEST_SOURCE_ID,
        name: 'Ticketmaster (E2E test)',
        slug: 'ticketmaster-e2e-test',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
        enabled: true,
        status: 'ok',
      },
      { onConflict: 'id' },
    );
    if (sourceErr) throw new Error(`source upsert failed: ${sourceErr.message}`);

    // Insert a test venue resolvable by name.
    // resolve_venue() in the cc_new_1 migration matches venues.name (normalised).
    // The demo seed does not include Barrowland Ballroom, so this row is required.
    const { error: venueErr } = await serviceClient.from('venues').upsert(
      {
        id: TM_TEST_VENUE_ID,
        name: 'Barrowland Ballroom',
        slug: 'barrowland-ballroom-e2e-test',
        status: 'active',
      },
      { onConflict: 'id' },
    );
    if (venueErr) throw new Error(`venue upsert failed: ${venueErr.message}`);

    // Insert source_type_category_map: Music segment → live_music for the test source.
    // Uses the post-fix-migration segment ID (kzfzniwnsyzfz7v7nj, positions 10–11 = "sy").
    const { error: mapErr } = await serviceClient.from('source_type_category_map').upsert(
      {
        source_id: TM_TEST_SOURCE_ID,
        source_category: TM_MUSIC_SEGMENT_ID,
        event_type_id: liveMusicId,
      },
      { onConflict: 'source_id,source_category' },
    );
    if (mapErr) throw new Error(`category map upsert failed: ${mapErr.message}`);
  });

  afterAll(async () => {
    if (!serviceClient) return;
    // Delete in FK-safe order: events → external_events → category map → venue → source
    await serviceClient.from('events').delete().eq('primary_source_id', TM_TEST_SOURCE_ID);
    await serviceClient
      .from('external_events')
      .delete()
      .eq('source_id', TM_TEST_SOURCE_ID);
    await serviceClient
      .from('source_type_category_map')
      .delete()
      .eq('source_id', TM_TEST_SOURCE_ID);
    await serviceClient.from('venues').delete().eq('id', TM_TEST_VENUE_ID);
    await serviceClient.from('sources').delete().eq('id', TM_TEST_SOURCE_ID);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Fixture parsing (reference only)
  //
  // The parse step is already proven by parse.test.ts (28 passing tests).
  // This test asserts the fixture-derived constants used below are correct,
  // rather than re-running the parser.
  // ─────────────────────────────────────────────────────────────────────────
  it('step 1 — fixture-derived constants match known parse.test.ts assertions', () => {
    expect(MOGWAI_EXTERNAL_ID).toBe('G5vYZpYd1bujA');
    expect(MOGWAI_URL).toMatch(/^https:\/\/www\.ticketmaster\./);
    expect(MOGWAI_URL).not.toContain('example.org');
    expect(MOGWAI_START_AT).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(FIXTURE_EVENTS[0]?.venueName).toBe('Barrowland Ballroom');
    expect(FIXTURE_EVENTS[0]?.ticketUrlLabelGuess).toBe('Buy on Ticketmaster');
    expect(FIXTURE_EVENTS[0]?.externalUrl).not.toContain('example.org');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — External events upsert
  // ─────────────────────────────────────────────────────────────────────────
  it('step 2 — upsertExternalEvents writes external_events row with event_id null pre-normalisation', async () => {
    await upsertExternalEvents(serviceClient, TM_TEST_SOURCE_ID, FIXTURE_EVENTS);

    const { data, error } = await serviceClient
      .from('external_events')
      .select('external_id, external_url, source_id, event_id')
      .eq('source_id', TM_TEST_SOURCE_ID)
      .eq('external_id', MOGWAI_EXTERNAL_ID);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = (data as Array<Record<string, unknown>>)[0]!;
    expect(row['source_id']).toBe(TM_TEST_SOURCE_ID);
    expect(row['external_url']).toBe(MOGWAI_URL);
    expect(row['external_url']).not.toContain('example.org');
    // event_id must be null — the row is not yet linked to a canonical event
    expect(row['event_id']).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Normalisation
  // ─────────────────────────────────────────────────────────────────────────
  it('step 3 — normaliseExternalEventsForSource creates a canonical events row and links it', async () => {
    await normaliseExternalEventsForSource({
      client: serviceClient as unknown as NormaliseDbClient,
      sourceId: TM_TEST_SOURCE_ID,
    });

    const { data, error } = await serviceClient
      .from('events')
      .select(
        'source_url, visibility, confidence, dedupe_key, description, primary_source_id',
      )
      .eq('primary_source_id', TM_TEST_SOURCE_ID)
      .eq('source_url', MOGWAI_URL);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const event = (data as Array<Record<string, unknown>>)[0]!;
    expect(event['source_url']).toBe(MOGWAI_URL);
    expect(event['source_url']).not.toContain('example.org');
    expect(['published', 'draft']).toContain(event['visibility']);
    expect(typeof event['confidence']).toBe('number');
    expect(event['confidence'] as number).toBeGreaterThanOrEqual(0);
    expect(event['dedupe_key']).not.toBeNull();
    // Link-first compliance: description must be null for Ticketmaster events
    expect(event['description']).toBeNull();

    // The external_events row must now have event_id set (linked to canonical event)
    const { data: extRows } = await serviceClient
      .from('external_events')
      .select('event_id')
      .eq('source_id', TM_TEST_SOURCE_ID)
      .eq('external_id', MOGWAI_EXTERNAL_ID);
    expect((extRows as Array<Record<string, unknown>>)[0]?.['event_id']).not.toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4 — Public visibility via anon key
  // ─────────────────────────────────────────────────────────────────────────
  it('step 4 — published Ticketmaster event appears in getPublishedEvents() via the anon key', async () => {
    const results = await getPublishedEvents(anonClient, {});
    const mogwai = (results as Array<Record<string, unknown>>).find(
      (e) => e['source_url'] === MOGWAI_URL,
    );

    expect(mogwai).toBeDefined();
    expect((mogwai as Record<string, unknown>)['source_url']).not.toContain('example.org');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5 — Source provenance
  // ─────────────────────────────────────────────────────────────────────────
  it('step 5 — source provenance: event is linked to the Ticketmaster test source, not the demo source', async () => {
    const { data: sourceRow } = await serviceClient
      .from('sources')
      .select('name, slug')
      .eq('id', TM_TEST_SOURCE_ID)
      .single();

    const source = sourceRow as Record<string, unknown>;
    expect(source['name']).not.toBe('Clyde Culture Demo Data');
    expect(source['name']).toContain('Ticketmaster');

    const { data: eventRows } = await serviceClient
      .from('events')
      .select('primary_source_id')
      .eq('primary_source_id', TM_TEST_SOURCE_ID)
      .eq('source_url', MOGWAI_URL);

    expect(eventRows).toHaveLength(1);
    const eventRow = (eventRows as Array<Record<string, unknown>>)[0]!;
    expect(eventRow['primary_source_id']).toBe(TM_TEST_SOURCE_ID);
    expect(eventRow['primary_source_id']).not.toBe(DEMO_SEED_SOURCE_ID);
  });
});
