import { describe, expect, it } from 'vitest';
import { deriveDedupeKey } from '@clydeculture/core';

const TICKETMASTER_SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const VENUE_ID = '33333333-3333-4333-8333-333333333333';
const AUTO_CREATED_VENUE_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_TYPE_ID = 1;
const TICKETMASTER_MUSIC_SEGMENT_ID = 'kzfzniwnsyzfz7v7nj';
const EVENT_TITLE = '  Mogwai: Live at Barrowland!  ';
const EVENT_START_AT = '2026-07-15T20:45:00.000Z';
const EXPECTED_DEDUPE_KEY = deriveDedupeKey(VENUE_ID, EVENT_START_AT, EVENT_TITLE);
const FULL_UPSTREAM_DESCRIPTION =
  'This is the full upstream description and must never be copied into events.description.';

type Row = Record<string, unknown>;

interface QueryResult<T> {
  data: T;
  error: unknown;
}

interface QueryFilter {
  kind: 'eq' | 'is';
  column: string;
  value: unknown;
}

interface QueryCall {
  table: string;
  action: 'select' | 'upsert' | 'update';
  filters: QueryFilter[];
  values?: Row | Row[];
  options?: Row;
}

interface DbNormaliseApi {
  normaliseExternalEventsForSource(input: {
    client: FakeSupabaseClient;
    sourceId: string;
  }): Promise<void>;
}

class FakeSupabaseClient {
  readonly calls: QueryCall[] = [];
  readonly rpcCalls: { name: string; args: Row }[] = [];
  readonly rows: Record<string, Row[]>;
  readonly upsertShouldFailIf: ((table: string, row: Row) => boolean) | undefined;

  constructor(
    rows: Record<string, Row[]>,
    options?: { upsertShouldFailIf?: (table: string, row: Row) => boolean },
  ) {
    this.rows = rows;
    this.upsertShouldFailIf = options?.upsertShouldFailIf;
  }

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, table);
  }

  async rpc(name: string, args: Row): Promise<QueryResult<unknown>> {
    this.rpcCalls.push({ name, args });

    if (name === 'resolve_venue') {
      const venueName = String(args['p_venue_name'] ?? '');
      const venue = (this.rows['venues'] ?? []).find(
        (row) => normaliseVenueName(String(row['name'] ?? '')) === normaliseVenueName(venueName),
      );
      return { data: venue?.['id'] ?? null, error: null };
    }

    if (name === 'auto_create_venue') {
      const venueName = String(args['p_venue_name'] ?? '');
      const venue = {
        id: AUTO_CREATED_VENUE_ID,
        name: venueName,
        slug: normaliseVenueName(venueName).replace(/\s+/g, '-'),
        status: 'pending',
        needs_review: true,
      };
      this.rows['venues'] = [...(this.rows['venues'] ?? []), venue];
      return { data: AUTO_CREATED_VENUE_ID, error: null };
    }

    if (name === 'compute_dedupe_key') {
      return { data: EXPECTED_DEDUPE_KEY, error: null };
    }

    if (name === 'normalise_title') {
      return {
        data: String(args['p_title'] ?? args['input'] ?? '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, '')
          .replace(/\s+/g, ' ')
          .trim(),
        error: null,
      };
    }

    return { data: null, error: null };
  }
}

class FakeQueryBuilder implements PromiseLike<QueryResult<Row[]>> {
  private readonly filters: QueryFilter[] = [];
  private action: QueryCall['action'] = 'select';
  private values: Row | Row[] | undefined;
  private options: Row | undefined;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: 'is', column, value });
    return this;
  }

  upsert(values: Row | Row[], options?: Row): this {
    this.action = 'upsert';
    this.values = values;
    this.options = options;
    return this;
  }

  update(values: Row): this {
    this.action = 'update';
    this.values = values;
    return this;
  }

  async single(): Promise<QueryResult<Row>> {
    const result = await this.execute();
    if (result.error) {
      return { data: {} as Row, error: result.error };
    }
    const first = result.data[0];
    if (!first) throw new Error(`Expected one row from ${this.table}`);
    return { data: first, error: null };
  }

  async maybeSingle(): Promise<QueryResult<Row | null>> {
    const result = await this.execute();
    return { data: result.data[0] ?? null, error: null };
  }

  then<TResult1 = QueryResult<Row[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<Row[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private async execute(): Promise<QueryResult<Row[]>> {
    this.client.calls.push({
      table: this.table,
      action: this.action,
      filters: [...this.filters],
      ...(this.values !== undefined && { values: this.values }),
      ...(this.options !== undefined && { options: this.options }),
    });

    if (this.action === 'upsert') {
      const failIf = this.client.upsertShouldFailIf;
      if (failIf) {
        const incomingRows = Array.isArray(this.values) ? this.values : [this.values];
        const shouldFail = incomingRows.some(
          (row): row is Row => !!row && failIf(this.table, row),
        );
        if (shouldFail) {
          return { data: [], error: { message: 'simulated upsert error' } };
        }
      }
      return { data: this.executeUpsert(), error: null };
    }

    if (this.action === 'update') {
      return { data: this.executeUpdate(), error: null };
    }

    return {
      data: this.tableRows().filter((row) =>
        this.filters.every((filter) => matchesFilter(row, filter)),
      ),
      error: null,
    };
  }

  private executeUpsert(): Row[] {
    const incomingRows = Array.isArray(this.values) ? this.values : [this.values];
    const rows = incomingRows.filter((row): row is Row => row !== undefined);

    if (this.table !== 'events') {
      this.tableRows().push(...rows);
      return rows;
    }

    const storedRows: Row[] = [];
    for (const row of rows) {
      const existing = this.tableRows().find(
        (candidate) => candidate['dedupe_key'] === row['dedupe_key'],
      );

      if (existing) {
        Object.assign(existing, row);
        storedRows.push(existing);
      } else {
        const stored = { id: `event-${this.tableRows().length + 1}`, ...row };
        this.tableRows().push(stored);
        storedRows.push(stored);
      }
    }

    return storedRows;
  }

  private executeUpdate(): Row[] {
    const values = this.values;
    if (Array.isArray(values) || values === undefined) return [];

    const matched = this.tableRows().filter((row) =>
      this.filters.every((filter) => matchesFilter(row, filter)),
    );
    for (const row of matched) {
      Object.assign(row, values);
    }
    return matched;
  }

  private tableRows(): Row[] {
    const rows = this.client.rows[this.table] ?? [];
    this.client.rows[this.table] = rows;
    return rows;
  }
}

function matchesFilter(row: Row, filter: QueryFilter): boolean {
  if (filter.kind === 'eq') return row[filter.column] === filter.value;
  if (filter.value === null) return row[filter.column] === null || row[filter.column] === undefined;
  return row[filter.column] === filter.value;
}

function makeThreeEventsClient(): FakeSupabaseClient {
  return new FakeSupabaseClient(
    {
      sources: [
        {
          id: TICKETMASTER_SOURCE_ID,
          slug: 'ticketmaster',
          source_type: 'api',
          tier: 1,
          config: { auto_publish: true, timezone: 'Europe/London' },
        },
      ],
      external_events: [
        {
          id: 'ext-1',
          source_id: TICKETMASTER_SOURCE_ID,
          external_id: 'event-1',
          external_url: 'https://www.ticketmaster.co.uk/event/1',
          title: 'Event One',
          start_at: '2026-07-15T19:00:00.000Z',
          venue_id_guess: VENUE_ID,
          event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
          raw: {},
          event_id: null,
        },
        {
          id: 'ext-2',
          source_id: TICKETMASTER_SOURCE_ID,
          external_id: 'event-2',
          external_url: 'https://www.ticketmaster.co.uk/event/2',
          title: 'Event Two',
          start_at: '2026-07-15T20:00:00.000Z',
          venue_id_guess: VENUE_ID,
          event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
          raw: {},
          event_id: null,
        },
        {
          id: 'ext-3',
          source_id: TICKETMASTER_SOURCE_ID,
          external_id: 'event-3',
          external_url: 'https://www.ticketmaster.co.uk/event/3',
          title: 'Event Three',
          start_at: '2026-07-15T21:00:00.000Z',
          venue_id_guess: VENUE_ID,
          event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
          raw: {},
          event_id: null,
        },
      ],
      event_types: [
        { id: EVENT_TYPE_ID, slug: 'live_music' },
        { id: 99, slug: 'other' },
      ],
      venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
      source_type_category_map: [
        {
          source_id: TICKETMASTER_SOURCE_ID,
          source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
          event_type_id: EVENT_TYPE_ID,
          event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
        },
      ],
      events: [],
    },
    {
      upsertShouldFailIf: (table, row) => table === 'events' && row['title'] === 'Event Two',
    },
  );
}

const UPDATED_START_AT = '2026-06-12T20:00:00.000Z';
const ORIGINAL_START_AT = '2026-06-12T19:00:00.000Z';
const LINKED_CANONICAL_ID = 'canonical-1';

function makeUpdateClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'external-rescheduled',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'G5vYZpYd1bujA',
        external_url: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
        title: 'Mogwai at Barrowland',
        start_at: UPDATED_START_AT,
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        ticket_url_guess: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
        ticket_url_label_guess: 'Book from Ticketmaster',
        image_url_guess: 'https://s1.ticketm.net/dam/a/image.jpg',
        raw: {},
        event_id: LINKED_CANONICAL_ID,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [
      {
        id: LINKED_CANONICAL_ID,
        title: 'Mogwai at Barrowland',
        start_at: ORIGINAL_START_AT,
        dedupe_key: deriveDedupeKey(VENUE_ID, ORIGINAL_START_AT, 'Mogwai at Barrowland'),
      },
    ],
  });
}

function makeClient(input: {
  autoPublish: boolean;
  sourceTier?: number;
  eventTypeGuess?: string;
  linkedEventId?: string | null;
}): FakeSupabaseClient {
  const sourceTier = input.sourceTier ?? 1;
  const eventTypeGuess = input.eventTypeGuess ?? TICKETMASTER_MUSIC_SEGMENT_ID;

  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: sourceTier,
        config: { auto_publish: input.autoPublish, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'external-1',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'G5vYZpYd1bujA',
        external_url: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
        title: EVENT_TITLE,
        start_at: EVENT_START_AT,
        venue_id_guess: VENUE_ID,
        event_type_guess: eventTypeGuess,
        ticket_url_guess: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
        ticket_url_label_guess: 'Book from Ticketmaster',
        image_url_guess: 'https://s1.ticketm.net/dam/a/image.jpg',
        raw: {
          info: FULL_UPSTREAM_DESCRIPTION,
        },
        event_id: input.linkedEventId ?? null,
      },
      {
        id: 'external-linked',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'already-linked',
        external_url: 'https://www.ticketmaster.co.uk/event/already-linked',
        title: 'Already Linked',
        start_at: '2026-07-16T20:00:00.000Z',
        venue_id_guess: VENUE_ID,
        event_type_guess: eventTypeGuess,
        raw: {},
        event_id: 'existing-event-id',
      },
      {
        id: 'external-other-source',
        source_id: OTHER_SOURCE_ID,
        external_id: 'other-source',
        external_url: 'https://example.com/other-source',
        title: 'Other Source Event',
        start_at: '2026-07-17T20:00:00.000Z',
        venue_id_guess: VENUE_ID,
        event_type_guess: eventTypeGuess,
        raw: {},
        event_id: null,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [],
  });
}

const ALL_DAY_START_AT = '2026-08-10T23:00:00.000Z';

function makeAllDayClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'ext-allday',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'allday-event-001',
        external_url: 'https://example.com/event/allday-event-001',
        title: 'All Day Market at Barrowland',
        start_at: ALL_DAY_START_AT,
        is_all_day_guess: true,
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        raw: {},
        event_id: null,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [],
  });
}

function makeAllDayUpdateClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'ext-allday-linked',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'allday-linked-001',
        external_url: 'https://example.com/event/allday-linked-001',
        title: 'All Day Market Linked',
        start_at: ALL_DAY_START_AT,
        is_all_day_guess: true,
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        raw: {},
        event_id: LINKED_CANONICAL_ID,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [
      {
        id: LINKED_CANONICAL_ID,
        title: 'All Day Market Linked',
        start_at: ALL_DAY_START_AT,
        dedupe_key: deriveDedupeKey(VENUE_ID, ALL_DAY_START_AT, 'All Day Market Linked'),
      },
    ],
  });
}

// TBA placeholder: Europe/London midnight for 2026-07-10 → 2026-07-09T23:00:00.000Z
const TBA_PLACEHOLDER_START_AT = '2026-07-09T23:00:00.000Z';

function makeTimeTbaClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'ext-tba',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'tba-event-001',
        external_url: 'https://www.ticketmaster.co.uk/event/tba-event-001',
        title: 'TBA Time Concert at Barrowland',
        start_at: TBA_PLACEHOLDER_START_AT,
        time_tba_guess: true,
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        raw: {},
        event_id: null,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [],
  });
}

const OPTIONAL_FIELDS_END_AT = '2026-07-15T23:00:00.000Z';
const OPTIONAL_FIELDS_DOORS_AT = '2026-07-15T19:00:00.000Z';

function makeOptionalFieldsClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'ext-optional',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'optional-fields-event',
        external_url: 'https://www.ticketmaster.co.uk/event/optional',
        title: 'Optional Fields Event',
        start_at: EVENT_START_AT,
        end_at: OPTIONAL_FIELDS_END_AT,
        doors_at: OPTIONAL_FIELDS_DOORS_AT,
        price_min_guess: 22.5,
        price_max_guess: 35.0,
        is_free_guess: false,
        availability_guess: 'onsale',
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        raw: {},
        event_id: null,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [],
  });
}

function makeOptionalFieldsUpdateClient(): FakeSupabaseClient {
  return new FakeSupabaseClient({
    sources: [
      {
        id: TICKETMASTER_SOURCE_ID,
        slug: 'ticketmaster',
        source_type: 'api',
        tier: 1,
        config: { auto_publish: true, timezone: 'Europe/London' },
      },
    ],
    external_events: [
      {
        id: 'ext-optional-linked',
        source_id: TICKETMASTER_SOURCE_ID,
        external_id: 'optional-fields-linked',
        external_url: 'https://www.ticketmaster.co.uk/event/optional-linked',
        title: 'Optional Fields Linked Event',
        start_at: EVENT_START_AT,
        end_at: OPTIONAL_FIELDS_END_AT,
        doors_at: OPTIONAL_FIELDS_DOORS_AT,
        price_min_guess: 22.5,
        price_max_guess: 35.0,
        is_free_guess: false,
        availability_guess: 'onsale',
        venue_id_guess: VENUE_ID,
        event_type_guess: TICKETMASTER_MUSIC_SEGMENT_ID,
        raw: {},
        event_id: LINKED_CANONICAL_ID,
      },
    ],
    event_types: [
      { id: EVENT_TYPE_ID, slug: 'live_music' },
      { id: 99, slug: 'other' },
    ],
    venues: [{ id: VENUE_ID, name: 'Barrowland Ballroom', slug: 'barrowland-ballroom' }],
    source_type_category_map: [
      {
        source_id: TICKETMASTER_SOURCE_ID,
        source_category: TICKETMASTER_MUSIC_SEGMENT_ID,
        event_type_id: EVENT_TYPE_ID,
        event_types: { id: EVENT_TYPE_ID, slug: 'live_music' },
      },
    ],
    events: [
      {
        id: LINKED_CANONICAL_ID,
        title: 'Optional Fields Linked Event',
        start_at: EVENT_START_AT,
        dedupe_key: deriveDedupeKey(VENUE_ID, EVENT_START_AT, 'Optional Fields Linked Event'),
      },
    ],
  });
}

function eventRows(client: FakeSupabaseClient): Row[] {
  return client.rows['events'] ?? [];
}

function externalRows(client: FakeSupabaseClient): Row[] {
  return client.rows['external_events'] ?? [];
}

function normaliseVenueName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadApi(): Promise<DbNormaliseApi> {
  return (await import('./dbNormalise.js')) as unknown as DbNormaliseApi;
}

describe('normaliseExternalEventsForSource', () => {
  it('reads unlinked external_events for one source, upserts a canonical event by dedupe_key, and links the source row', async () => {
    const client = makeClient({ autoPublish: true });
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const externalEventsSelect = client.calls.find(
      (call) => call.table === 'external_events' && call.action === 'select',
    );
    expect(externalEventsSelect?.filters).toEqual(
      expect.arrayContaining([
        { kind: 'eq', column: 'source_id', value: TICKETMASTER_SOURCE_ID },
      ]),
    );
    expect(externalEventsSelect?.filters).not.toContainEqual(
      { kind: 'is', column: 'event_id', value: null },
    );

    const eventUpsert = client.calls.find(
      (call) => call.table === 'events' && call.action === 'upsert',
    );
    expect(eventUpsert?.options).toMatchObject({ onConflict: 'dedupe_key' });
    expect(eventRows(client)).toHaveLength(1);
    expect(externalRows(client).find((row) => row['id'] === 'external-1')).toMatchObject({
      event_id: 'event-1',
    });
    expect(externalRows(client).find((row) => row['id'] === 'external-linked')).toMatchObject({
      event_id: 'existing-event-id',
    });
    expect(externalRows(client).find((row) => row['id'] === 'external-other-source')).toMatchObject({
      event_id: null,
    });
  });

  it('maps source_type_category_map semantics into event_type_id, writes canonical fields, and preserves link-first descriptions', async () => {
    const client = makeClient({ autoPublish: true });
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toMatchObject({
      title: 'Mogwai: Live at Barrowland!',
      normalised_title: 'mogwai live at barrowland',
      source_url: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
      ticket_url: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
      ticket_url_label: 'Book from Ticketmaster',
      image_url: 'https://s1.ticketm.net/dam/a/image.jpg',
      start_at: '2026-07-15T20:45:00.000Z',
      timezone: 'Europe/London',
      venue_id: VENUE_ID,
      event_type_id: EVENT_TYPE_ID,
      primary_source_id: TICKETMASTER_SOURCE_ID,
      confidence: 90,
      confidence_inputs: {
        tier: 1,
        base_score: 50,
        has_start_at: true,
        venue_resolved: true,
        type_classified: true,
        type_source: 'map',
        title_quality: true,
        has_url: true,
        corroborated: false,
        total: 90,
      },
      needs_review: false,
      visibility: 'published',
      dedupe_key: EXPECTED_DEDUPE_KEY,
    });
    expect(event?.['description']).toBeNull();
    expect(JSON.stringify(event)).not.toContain(FULL_UPSTREAM_DESCRIPTION);
  });

  it('writes ADR 0006 trust/completeness signals alongside the legacy confidence score', async () => {
    // ADR 0006: the normalisation pipeline must populate the split signals on every
    // canonical event row so the RLS gate can be swapped atomically in a follow-on
    // migration. Until then both `confidence` (legacy) and trust/completeness are
    // written; the legacy gate stays in force.
    const client = makeClient({ autoPublish: true });
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toMatchObject({
      // Tier 1 (base 70) + no corroboration = 70
      trust: 70,
      // Title + start + link + location all present = 100
      completeness: 100,
      trust_inputs: {
        tier: 1,
        tier_base: 70,
        corroborated: false,
        title_too_short: false,
        total: 70,
      },
      completeness_inputs: {
        has_title: true,
        has_start_signal: true,
        has_link: true,
        has_location_signal: true,
        has_ticket_url: true,
        has_image: true,
        type_classified: true,
        venue_resolved: true,
        total: 100,
      },
    });
  });

  it('writes lower trust + still-MVP completeness for a Tier 3 grassroots scrape at an auto-created venue (hard rule #7 regression)', async () => {
    // The ADR 0006 worked example: a Tier-3 DIY gig with a known time, a URL, and
    // an auto-created venue stub. Legacy single-score gate hid it at 50; the split
    // signals must show high completeness (MVP fields all present) and trust at the
    // Tier-3 base (40), proving the engine is wired through correctly even when the
    // RLS swap is still pending.
    const client = makeClient({
      autoPublish: false,
      sourceTier: 3,
      eventTypeGuess: 'unknown-grassroots-category',
    });
    const external = externalRows(client).find((row) => row['id'] === 'external-1');
    if (!external) throw new Error('Expected fixture external event');
    delete external['venue_id_guess'];
    external['venue_name'] = 'New DIY Space';
    // Strip presentation fields that the engine MUST NOT need for publication.
    delete external['ticket_url_guess'];
    delete external['ticket_url_label_guess'];
    delete external['image_url_guess'];

    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toBeDefined();
    expect(event?.['trust']).toBe(40);
    expect(event?.['completeness']).toBe(100);
    expect(event?.['trust_inputs']).toMatchObject({
      tier: 3,
      tier_base: 40,
      corroborated: false,
      total: 40,
    });
    expect(event?.['completeness_inputs']).toMatchObject({
      has_title: true,
      has_start_signal: true,
      has_link: true,
      has_location_signal: true,
      // Bonus richness inputs all false — but the MVP gate is still met.
      has_ticket_url: false,
      has_image: false,
      type_classified: false,
      venue_resolved: false,
      total: 100,
    });
  });

  it.each([
    ['source auto_publish is false', makeClient({ autoPublish: false }), 'draft'],
    [
      'confidence is below 60',
      makeClient({
        autoPublish: true,
        sourceTier: 4,
        eventTypeGuess: 'unknown-ticketmaster-category',
      }),
      'draft',
    ],
  ])('leaves the canonical event as %s when auto-publish requirements are not met', async (
    _label,
    client,
    expectedVisibility,
  ) => {
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    expect(eventRows(client)[0]).toMatchObject({
      visibility: expectedVisibility,
    });
  });

  it('resolves a connector row that only has a venue name and links the canonical event', async () => {
    const client = makeClient({ autoPublish: true });
    const external = externalRows(client).find((row) => row['id'] === 'external-1');
    if (!external) throw new Error('Expected fixture external event');
    delete external['venue_id_guess'];
    external['venue_name'] = 'Barrowland Ballroom';

    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    expect(client.rpcCalls).toContainEqual({
      name: 'resolve_venue',
      args: { p_venue_name: 'Barrowland Ballroom' },
    });
    expect(eventRows(client)[0]).toMatchObject({
      venue_id: VENUE_ID,
      visibility: 'published',
    });
    expect(externalRows(client).find((row) => row['id'] === 'external-1')).toMatchObject({
      event_id: 'event-1',
    });
  });

  it('auto-creates a review-only venue for unknown venue names instead of dropping the row', async () => {
    const client = makeClient({ autoPublish: true });
    const external = externalRows(client).find((row) => row['id'] === 'external-1');
    if (!external) throw new Error('Expected fixture external event');
    delete external['venue_id_guess'];
    external['venue_name'] = 'New Demo Room';

    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    expect(client.rpcCalls).toContainEqual({
      name: 'auto_create_venue',
      args: {
        p_venue_name: 'New Demo Room',
        p_source_url: 'https://www.ticketmaster.co.uk/event/G5vYZpYd1bujA',
      },
    });
    expect(eventRows(client)[0]).toMatchObject({
      venue_id: AUTO_CREATED_VENUE_ID,
      needs_review: true,
      visibility: 'draft',
    });
    expect(externalRows(client).find((row) => row['id'] === 'external-1')).toMatchObject({
      event_id: 'event-1',
    });
  });

  it('marks unusable venue data with an explicit normalisation skip reason', async () => {
    const client = makeClient({ autoPublish: true });
    const external = externalRows(client).find((row) => row['id'] === 'external-1');
    if (!external) throw new Error('Expected fixture external event');
    delete external['venue_id_guess'];
    external['venue_name'] = '   ';

    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    expect(eventRows(client)).toHaveLength(0);
    expect(externalRows(client).find((row) => row['id'] === 'external-1')).toMatchObject({
      raw: expect.objectContaining({
        normalisation_skip: expect.objectContaining({
          reason: 'missing_venue',
        }),
      }),
    });
  });

  it('updates existing canonical event when linked external event changes', async () => {
    const client = makeUpdateClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    // Exactly one canonical event row — no new row was inserted
    const events = eventRows(client);
    expect(events).toHaveLength(1);

    // The existing canonical row is updated in place with the new start_at
    expect(events[0]).toMatchObject({
      id: LINKED_CANONICAL_ID,
      start_at: UPDATED_START_AT,
    });

    // No upsert was performed against events (only an update)
    const eventUpserts = client.calls.filter(
      (call) => call.table === 'events' && call.action === 'upsert',
    );
    expect(eventUpserts).toHaveLength(0);

    // An update was performed targeting the linked canonical id
    const eventUpdates = client.calls.filter(
      (call) => call.table === 'events' && call.action === 'update',
    );
    expect(eventUpdates).toHaveLength(1);
    expect(eventUpdates[0]?.filters).toContainEqual({
      kind: 'eq',
      column: 'id',
      value: LINKED_CANONICAL_ID,
    });

    // External row remains linked to the same canonical id
    expect(externalRows(client).find((row) => row['id'] === 'external-rescheduled')).toMatchObject({
      event_id: LINKED_CANONICAL_ID,
    });
  });

  it('continues normalising remaining events when canonical upsert fails', async () => {
    const client = makeThreeEventsClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await expect(
      normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID }),
    ).resolves.toBeUndefined();

    // Events 1 and 3 were created and linked; event 2 failed and was skipped
    const events = eventRows(client);
    expect(events).toHaveLength(2);
    expect(externalRows(client).find((r) => r['id'] === 'ext-1')).toMatchObject({
      event_id: expect.any(String),
    });
    expect(externalRows(client).find((r) => r['id'] === 'ext-3')).toMatchObject({
      event_id: expect.any(String),
    });

    // Event 2 was skipped with a canonical_upsert_failed reason
    expect(externalRows(client).find((r) => r['id'] === 'ext-2')).toMatchObject({
      event_id: null,
      raw: expect.objectContaining({
        normalisation_skip: expect.objectContaining({
          reason: 'canonical_upsert_failed',
        }),
      }),
    });
  });

  it('writes optional external event fields to canonical event (unlinked create path)', async () => {
    const client = makeOptionalFieldsClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toMatchObject({
      end_at: OPTIONAL_FIELDS_END_AT,
      doors_at: OPTIONAL_FIELDS_DOORS_AT,
      price_min: 22.5,
      price_max: 35.0,
      is_free: false,
      availability: 'on_sale',
    });
  });

  it('writes optional external event fields to canonical event (linked update path)', async () => {
    const client = makeOptionalFieldsUpdateClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toMatchObject({
      end_at: OPTIONAL_FIELDS_END_AT,
      doors_at: OPTIONAL_FIELDS_DOORS_AT,
      price_min: 22.5,
      price_max: 35.0,
      is_free: false,
      availability: 'on_sale',
    });
  });

  it('suppresses positive prices when is_free_guess is true', async () => {
    const client = makeOptionalFieldsClient();
    const ext = (client.rows['external_events'] ?? [])[0];
    if (!ext) throw new Error('Expected fixture external event');
    ext['is_free_guess'] = true;
    ext['price_min_guess'] = 15;
    ext['price_max_guess'] = 20;

    const { normaliseExternalEventsForSource } = await loadApi();
    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event?.['is_free']).toBe(true);
    expect(event?.['price_min']).toBeUndefined();
    expect(event?.['price_max']).toBeUndefined();
  });

  it('writes time_tba true to canonical event when external event has time_tba_guess = true', async () => {
    // Arrange: external event with time_tba_guess:true and a midnight placeholder start_at.
    // The placeholder timestamp is deterministic (Europe/London midnight for the local date)
    // but the flag is required to prevent this from being treated as a real midnight event.
    const client = makeTimeTbaClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toBeDefined();
    expect(event?.['time_tba']).toBe(true);
    expect(event?.['start_at']).toBe(TBA_PLACEHOLDER_START_AT);
  });

  it('sets needs_review=true and has_start_at=false in confidence inputs when time_tba_guess is true', async () => {
    // calculateConfidence treats timeTba:true as "no reliable start time" (has_start_at=false)
    // and always adds 'time_tba' to reviewReasons → needs_review=true regardless of other signals.
    const client = makeTimeTbaClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event?.['needs_review']).toBe(true);
    expect((event?.['confidence_inputs'] as Record<string, unknown>)?.['has_start_at']).toBe(false);
  });

  it('writes is_all_day true to canonical event when external event has is_all_day_guess = true (unlinked create path)', async () => {
    const client = makeAllDayClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toBeDefined();
    expect(event?.['is_all_day']).toBe(true);
    expect(event?.['start_at']).toBe(ALL_DAY_START_AT);
  });

  it('writes is_all_day true to canonical event when external event has is_all_day_guess = true (linked update path)', async () => {
    const client = makeAllDayUpdateClient();
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event).toBeDefined();
    expect(event?.['is_all_day']).toBe(true);
  });

  it('writes is_all_day false to canonical event when is_all_day_guess is absent (default)', async () => {
    const client = makeClient({ autoPublish: true });
    client.rows['external_events'] = (client.rows['external_events'] ?? []).filter(
      (row) => row['id'] === 'external-1',
    );
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event?.['is_all_day']).toBe(false);
  });

  it('derives dedupe key from stored canonical title, not raw title', async () => {
    // Arrange: raw title is 501 chars; stored canonical title is trimmed to 500.
    // Bug: current code passes externalEvent.title (raw) to deriveDedupeKey, so the
    // hash input diverges from events.title when title.length > 500.
    const longRawTitle = 'A'.repeat(501);
    const storedTitle = 'A'.repeat(500);

    const client = makeClient({ autoPublish: true });
    const ext = (client.rows['external_events'] ?? []).find((r) => r['id'] === 'external-1');
    if (!ext) throw new Error('Expected fixture external event');
    ext['title'] = longRawTitle;
    client.rows['external_events'] = (client.rows['external_events'] ?? []).filter(
      (r) => r['id'] === 'external-1',
    );

    const { normaliseExternalEventsForSource } = await loadApi();
    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    const event = eventRows(client)[0];
    expect(event?.['title']).toBe(storedTitle);

    const keyFromStoredTitle = deriveDedupeKey(VENUE_ID, EVENT_START_AT, storedTitle);
    const keyFromRawTitle = deriveDedupeKey(VENUE_ID, EVENT_START_AT, longRawTitle);
    // Sanity: the two keys must differ (otherwise this test proves nothing)
    expect(keyFromStoredTitle).not.toBe(keyFromRawTitle);
    // The stored dedupe key must match the stored canonical title, not the raw title
    expect(event?.['dedupe_key']).toBe(keyFromStoredTitle);
  });

  it('unlinked external event still creates and links a canonical event after M-1 changes', async () => {
    const client = makeClient({ autoPublish: true });
    // Use only the clearly-unlinked row for this test
    client.rows['external_events'] = (client.rows['external_events'] ?? []).filter(
      (row) => row['id'] === 'external-1',
    );
    const { normaliseExternalEventsForSource } = await loadApi();

    await normaliseExternalEventsForSource({ client, sourceId: TICKETMASTER_SOURCE_ID });

    // A new canonical event is created
    expect(eventRows(client)).toHaveLength(1);
    // The external row is linked back to the new canonical event
    expect(externalRows(client).find((row) => row['id'] === 'external-1')).toMatchObject({
      event_id: expect.any(String),
    });
    // The canonical event is created via upsert (dedupe_key conflict target)
    const eventUpserts = client.calls.filter(
      (call) => call.table === 'events' && call.action === 'upsert',
    );
    expect(eventUpserts).toHaveLength(1);
    expect(eventUpserts[0]?.options).toMatchObject({ onConflict: 'dedupe_key' });
  });
});
