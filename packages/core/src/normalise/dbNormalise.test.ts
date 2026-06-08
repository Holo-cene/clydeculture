import { describe, expect, it } from 'vitest';
import { deriveDedupeKey } from '../dedupe/dedupe.js';

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
  error: null;
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

  constructor(rows: Record<string, Row[]>) {
    this.rows = rows;
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
        { kind: 'is', column: 'event_id', value: null },
      ]),
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
});
