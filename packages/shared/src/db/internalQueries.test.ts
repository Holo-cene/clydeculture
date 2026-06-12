import { describe, expect, it } from 'vitest';

// FakeSupabaseClient mirrors the pattern in publicQueries.test.ts, extended with
// .limit() since the internal-queries helpers cap result sizes for the weekly
// review surface.

type FilterOp = 'eq' | 'gte' | 'lt' | 'in' | 'ilike';

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
  limit?: number;
}

interface InternalQueriesApi {
  getRecentIngestRuns(
    client: FakeSupabaseClient,
    options?: { limit?: number; sourceSlug?: string },
  ): Promise<unknown[]>;
  getOpenIngestAlerts(client: FakeSupabaseClient): Promise<unknown[]>;
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
    this.query = { table, filters: [] };
  }

  select(columns: string): this {
    this.query.select = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.query.filters.push({ op: 'eq', column, value });
    return this;
  }

  order(column: string, options?: Record<string, unknown>): this {
    this.query.order = options === undefined ? { column } : { column, options };
    return this;
  }

  limit(n: number): this {
    this.query.limit = n;
    return this;
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.client.queries.push(this.query);
    const rows = this.client.rows[this.query.table] ?? [];
    return Promise.resolve({ data: rows, error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

async function loadApi(): Promise<InternalQueriesApi> {
  return (await import('./internalQueries.js')) as unknown as InternalQueriesApi;
}

function lastQuery(client: FakeSupabaseClient): RecordedQuery {
  const query = client.queries.at(-1);
  if (!query) throw new Error('Expected a Supabase query to be recorded');
  return query;
}

describe('internal ingestion-health query helpers', () => {
  it('getRecentIngestRuns selects from the v_recent_ingest_runs view with default ordering and limit', async () => {
    const { getRecentIngestRuns } = await loadApi();
    const client = new FakeSupabaseClient();

    await getRecentIngestRuns(client);

    const query = lastQuery(client);
    expect(query.table).toBe('v_recent_ingest_runs');
    expect(query.select).toEqual(expect.stringContaining('status'));
    expect(query.select).toEqual(expect.stringContaining('started_at'));
    expect(query.select).toEqual(expect.stringContaining('parsed_count'));
    expect(query.select).toEqual(expect.stringContaining('source_slug'));
    expect(query.order).toEqual({
      column: 'started_at',
      options: { ascending: false },
    });
    expect(query.limit).toBe(50);
  });

  it('getRecentIngestRuns honours a caller-supplied limit', async () => {
    const { getRecentIngestRuns } = await loadApi();
    const client = new FakeSupabaseClient();

    await getRecentIngestRuns(client, { limit: 10 });

    expect(lastQuery(client).limit).toBe(10);
  });

  it('getRecentIngestRuns filters by source slug when provided', async () => {
    const { getRecentIngestRuns } = await loadApi();
    const client = new FakeSupabaseClient();

    await getRecentIngestRuns(client, { sourceSlug: 'ticketmaster' });

    expect(lastQuery(client).filters).toContainEqual({
      op: 'eq',
      column: 'source_slug',
      value: 'ticketmaster',
    });
  });

  it('getRecentIngestRuns returns rows from the view unchanged', async () => {
    const { getRecentIngestRuns } = await loadApi();
    const client = new FakeSupabaseClient({
      v_recent_ingest_runs: [
        {
          id: 'run-1',
          source_id: 'src-1',
          source_slug: 'ticketmaster',
          status: 'success',
          parsed_count: 42,
          started_at: '2026-06-12T06:00:00.000Z',
          finished_at: '2026-06-12T06:01:00.000Z',
          errors_count: 0,
        },
      ],
    });

    const rows = await getRecentIngestRuns(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_slug: 'ticketmaster',
      status: 'success',
      parsed_count: 42,
    });
  });

  it('getOpenIngestAlerts selects from the v_open_ingest_alerts view ordered by created_at desc', async () => {
    const { getOpenIngestAlerts } = await loadApi();
    const client = new FakeSupabaseClient();

    await getOpenIngestAlerts(client);

    const query = lastQuery(client);
    expect(query.table).toBe('v_open_ingest_alerts');
    expect(query.select).toEqual(expect.stringContaining('alert_type'));
    expect(query.select).toEqual(expect.stringContaining('message'));
    expect(query.select).toEqual(expect.stringContaining('source_slug'));
    expect(query.select).toEqual(expect.stringContaining('created_at'));
    expect(query.order).toEqual({
      column: 'created_at',
      options: { ascending: false },
    });
  });

  it('getOpenIngestAlerts surfaces the rows the view returns', async () => {
    const { getOpenIngestAlerts } = await loadApi();
    const client = new FakeSupabaseClient({
      v_open_ingest_alerts: [
        {
          id: 'alert-1',
          source_id: 'src-1',
          source_slug: 'ticketmaster',
          alert_type: 'count_drop',
          message: 'ticketmaster parsed 1 event, below 30% of its 14-day median of 40.',
          created_at: '2026-06-12T06:02:00.000Z',
        },
      ],
    });

    const rows = await getOpenIngestAlerts(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      alert_type: 'count_drop',
      source_slug: 'ticketmaster',
    });
  });
});

describe('internal-only export boundary', () => {
  it('does not re-export the internal helpers from the public @clydeculture/shared surface', async () => {
    const publicIndex = (await import('../index.js')) as Record<string, unknown>;
    expect(publicIndex.getRecentIngestRuns).toBeUndefined();
    expect(publicIndex.getOpenIngestAlerts).toBeUndefined();
  });
});
