import { describe, expect, it } from 'vitest';

type FilterOp = 'eq' | 'gte' | 'lt' | 'in' | 'ilike' | 'or';

interface RecordedFilter {
  op: FilterOp;
  column: string;
  value: unknown;
}

interface RecordedQuery {
  table: string;
  select?: string;
  filters: RecordedFilter[];
  order?: { column: string; options?: Record<string, unknown> };
  single: boolean;
  maybeSingle: boolean;
}

interface DateRange {
  startAt: string;
  endAt: string;
}

interface PublicQueriesApi {
  getPublishedEvents(
    client: FakeSupabaseClient,
    filters?: {
      dateRange?: DateRange;
      eventTypeSlug?: string;
      venueSlug?: string;
      festivalSlug?: string;
      q?: string;
    },
  ): Promise<unknown[]>;
  getEventBySlug(client: FakeSupabaseClient, slug: string): Promise<unknown | null>;
  getVenueBySlug(client: FakeSupabaseClient, slug: string): Promise<unknown | null>;
  getTonightDateRange(now: Date): DateRange;
  getThisWeekendDateRange(now: Date): DateRange;
}

class FakeSupabaseClient {
  readonly queries: RecordedQuery[] = [];
  readonly rows: Record<string, Record<string, unknown>[]>;

  constructor(rows: Record<string, Record<string, unknown>[]> = {}) {
    this.rows = rows;
  }

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, table);
  }
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown[]; error: null }> {
  private readonly query: RecordedQuery;

  constructor(
    private readonly client: FakeSupabaseClient,
    table: string,
  ) {
    this.query = {
      table,
      filters: [],
      single: false,
      maybeSingle: false,
    };
  }

  select(columns?: string): this {
    if (columns !== undefined) {
      this.query.select = columns;
    }
    return this;
  }

  eq(column: string, value: unknown): this {
    this.query.filters.push({ op: 'eq', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.query.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.query.filters.push({ op: 'lt', column, value });
    return this;
  }

  or(value: string): this {
    this.query.filters.push({ op: 'or', column: 'or', value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.query.filters.push({ op: 'in', column, value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.query.filters.push({ op: 'ilike', column, value });
    return this;
  }

  order(column: string, options?: Record<string, unknown>): this {
    this.query.order =
      options === undefined
        ? { column }
        : { column, options };
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown | null; error: null }> {
    this.query.maybeSingle = true;
    this.client.queries.push(this.query);
    return { data: this.filteredRows()[0] ?? null, error: null };
  }

  async single(): Promise<{ data: unknown | null; error: null }> {
    this.query.single = true;
    this.client.queries.push(this.query);
    return { data: this.filteredRows()[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.client.queries.push(this.query);
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }

  private filteredRows(): Record<string, unknown>[] {
    const rows = this.client.rows[this.query.table] ?? [];
    return rows.filter((row) =>
      this.query.filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.column] === filter.value;
        if (filter.op === 'in' && Array.isArray(filter.value)) {
          return filter.value.includes(row[filter.column]);
        }
        if (filter.op === 'ilike' && typeof filter.value === 'string') {
          const needle = filter.value.replaceAll('%', '').toLowerCase();
          return String(row[filter.column] ?? '').toLowerCase().includes(needle);
        }
        return true;
      }),
    );
  }
}

async function loadApi(): Promise<PublicQueriesApi> {
  return (await import('./publicQueries.js')) as unknown as PublicQueriesApi;
}

function lastQuery(client: FakeSupabaseClient): RecordedQuery {
  const query = client.queries.at(-1);
  if (!query) throw new Error('Expected a Supabase query to be recorded');
  return query;
}

function expectFilter(query: RecordedQuery, op: FilterOp, column: string, value: unknown): void {
  expect(query.filters).toContainEqual({ op, column, value });
}

describe('public Supabase query helpers', () => {
  it('getPublishedEvents constrains the public event boundary and date range', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient();

    await getPublishedEvents(client, {
      dateRange: {
        startAt: '2026-06-08T18:00:00.000Z',
        endAt: '2026-06-09T02:00:00.000Z',
      },
    });

    const query = lastQuery(client);
    expect(query.table).toBe('events');
    expectFilter(query, 'eq', 'visibility', 'published');
    expectFilter(query, 'gte', 'confidence', 60);
    expectFilter(query, 'gte', 'start_at', '2026-06-08T18:00:00.000Z');
    expectFilter(query, 'lt', 'start_at', '2026-06-09T02:00:00.000Z');
    expect(query.order).toMatchObject({ column: 'start_at' });
  });

  it('getPublishedEvents filters by canonical event type, venue, and festival joins', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient({
      event_types: [{ id: 1, slug: 'live_music' }],
      venues: [{ id: 'venue-1', slug: 'barrowland-ballroom', status: 'active' }],
      festivals: [{ id: 'festival-1', slug: 'celtic-connections' }],
    });

    await getPublishedEvents(client, {
      eventTypeSlug: 'live_music',
      venueSlug: 'barrowland-ballroom',
      festivalSlug: 'celtic-connections',
    });

    const query = lastQuery(client);
    expect(query.select).toEqual(expect.stringContaining('event_types'));
    expect(query.select).toEqual(expect.stringContaining('venues'));
    expect(query.select).toEqual(expect.stringContaining('festivals'));
    expectFilter(query, 'eq', 'event_type_id', 1);
    expectFilter(query, 'eq', 'venue_id', 'venue-1');
    expectFilter(query, 'eq', 'festival_id', 'festival-1');
  });

  it('getPublishedEvents searches by title and source-facing label', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient();

    await getPublishedEvents(client, { q: 'jazz' });

    const query = lastQuery(client);
    expectFilter(
      query,
      'or',
      'or',
      [
        'title.ilike.%jazz%',
        'normalised_title.ilike.%jazz%',
        'ticket_url_label.ilike.%jazz%',
      ].join(','),
    );
  });

  it('getPublishedEvents searches by venue name through matching public venue ids', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient({
      venues: [{ id: 'venue-jazz', name: 'Jazz Rooms' }],
    });

    await getPublishedEvents(client, { q: 'jazz' });

    const venueQuery = client.queries.find((query) => query.table === 'venues');
    expect(venueQuery).toBeTruthy();
    expectFilter(venueQuery as RecordedQuery, 'ilike', 'name', '%jazz%');

    const query = lastQuery(client);
    expectFilter(
      query,
      'or',
      'or',
      [
        'title.ilike.%jazz%',
        'normalised_title.ilike.%jazz%',
        'ticket_url_label.ilike.%jazz%',
        'venue_id.in.(venue-jazz)',
      ].join(','),
    );
  });

  it('getPublishedEvents combines search with event type filters', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient({
      event_types: [{ id: 8, slug: 'film' }],
    });

    await getPublishedEvents(client, {
      q: 'film',
      eventTypeSlug: 'film',
    });

    const query = lastQuery(client);
    expectFilter(query, 'eq', 'event_type_id', 8);
    expect(query.filters.some((filter) => filter.op === 'or')).toBe(true);
  });

  it('getPublishedEvents ignores empty search terms', async () => {
    const { getPublishedEvents } = await loadApi();
    const client = new FakeSupabaseClient();

    await getPublishedEvents(client, { q: '   ' });

    const query = lastQuery(client);
    expect(query.filters.some((filter) => filter.op === 'or')).toBe(false);
    expectFilter(query, 'eq', 'visibility', 'published');
  });

  it('tonight and this-weekend helpers produce date ranges, not database states', async () => {
    const { getPublishedEvents, getThisWeekendDateRange, getTonightDateRange } = await loadApi();
    const client = new FakeSupabaseClient();
    const tonight = getTonightDateRange(new Date('2026-06-08T12:00:00.000Z'));
    const weekend = getThisWeekendDateRange(new Date('2026-06-08T12:00:00.000Z'));

    expect(tonight).toEqual({
      startAt: expect.any(String),
      endAt: expect.any(String),
    });
    expect(weekend).toEqual({
      startAt: expect.any(String),
      endAt: expect.any(String),
    });

    await getPublishedEvents(client, { dateRange: tonight });
    await getPublishedEvents(client, { dateRange: weekend });

    for (const query of client.queries) {
      expect(query.filters.map((filter) => filter.column)).toEqual(
        expect.arrayContaining(['start_at']),
      );
      expect(query.filters.map((filter) => filter.column)).not.toEqual(
        expect.arrayContaining(['is_tonight', 'is_this_weekend', 'feed_state', 'view']),
      );
    }
  });

  it('getEventBySlug returns one published event by slug', async () => {
    const { getEventBySlug } = await loadApi();
    const client = new FakeSupabaseClient();

    await getEventBySlug(client, 'mogwai-live-at-barrowland-2026-07-15');

    const query = lastQuery(client);
    expect(query.table).toBe('events');
    expectFilter(query, 'eq', 'slug', 'mogwai-live-at-barrowland-2026-07-15');
    expectFilter(query, 'eq', 'visibility', 'published');
    expectFilter(query, 'gte', 'confidence', 60);
    expect(query.maybeSingle || query.single).toBe(true);
  });

  it('getVenueBySlug reads only active or temporary public venues', async () => {
    const { getVenueBySlug } = await loadApi();
    const client = new FakeSupabaseClient();

    await getVenueBySlug(client, 'barrowland-ballroom');

    const query = lastQuery(client);
    expect(query.table).toBe('venues');
    expectFilter(query, 'eq', 'slug', 'barrowland-ballroom');
    expectFilter(query, 'in', 'status', ['active', 'temporary']);
    expect(query.maybeSingle || query.single).toBe(true);
  });

  it('query helpers take an anon-style client and never mention a service role key', async () => {
    const api = await loadApi();
    const client = new FakeSupabaseClient();

    await api.getPublishedEvents(client);
    await api.getEventBySlug(client, 'published-event');
    await api.getVenueBySlug(client, 'active-venue');

    const queryText = JSON.stringify(client.queries).toLowerCase();
    expect(queryText).not.toContain('service_role');
    expect(queryText).not.toContain('service-role');
    expect(queryText).not.toContain('supabase_service_role_key');
  });
});
