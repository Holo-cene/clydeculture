// Internal-only ingestion-health helpers.
//
// These read from the v_recent_ingest_runs and v_open_ingest_alerts views,
// which are created with `security_invoker = on` so they inherit the
// underlying tables' RLS — both `ingest_runs` and `ingest_alerts` are
// default-deny for anon. Callers must use a service-role client.
//
// Intentionally NOT re-exported from packages/shared/src/index.ts: the public
// surface is what the anon-key Astro app consumes. The internalQueries.test.ts
// suite asserts that boundary.

const INGEST_RUN_COLUMNS = [
  'id',
  'source_id',
  'source_slug',
  'source_name',
  'status',
  'started_at',
  'finished_at',
  'fetched_count',
  'parsed_count',
  'upserted_external_count',
  'created_events_count',
  'updated_events_count',
  'errors_count',
  'error_message',
].join(',');

const INGEST_ALERT_COLUMNS = [
  'id',
  'source_id',
  'source_slug',
  'source_name',
  'run_id',
  'alert_type',
  'message',
  'created_at',
].join(',');

interface QueryResult<T> {
  data: T;
  error: unknown;
}

interface InternalQueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  eq(column: string, value: unknown): InternalQueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): InternalQueryBuilder<T>;
  limit(n: number): InternalQueryBuilder<T>;
}

interface InternalSelectBuilder {
  select(columns: string): InternalQueryBuilder;
}

export interface InternalQueryClient {
  from(table: string): InternalSelectBuilder;
}

export interface IngestRunSummary {
  id: string;
  source_id: string;
  source_slug: string;
  source_name: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  parsed_count: number;
  upserted_external_count: number;
  created_events_count: number;
  updated_events_count: number;
  errors_count: number;
  error_message: string | null;
}

export interface IngestAlertSummary {
  id: string;
  source_id: string;
  source_slug: string;
  source_name: string;
  run_id: string | null;
  alert_type: 'count_drop' | 'parse_failure' | 'timeout' | 'manual' | 'cold_start_zero';
  message: string | null;
  created_at: string;
}

export interface GetRecentIngestRunsOptions {
  limit?: number;
  sourceSlug?: string;
}

const DEFAULT_RECENT_RUNS_LIMIT = 50;

export async function getRecentIngestRuns(
  client: InternalQueryClient,
  options: GetRecentIngestRunsOptions = {},
): Promise<IngestRunSummary[]> {
  let query = client
    .from('v_recent_ingest_runs')
    .select(INGEST_RUN_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(options.limit ?? DEFAULT_RECENT_RUNS_LIMIT);

  if (options.sourceSlug) {
    query = query.eq('source_slug', options.sourceSlug);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IngestRunSummary[];
}

export async function getOpenIngestAlerts(
  client: InternalQueryClient,
): Promise<IngestAlertSummary[]> {
  const { data, error } = await client
    .from('v_open_ingest_alerts')
    .select(INGEST_ALERT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as IngestAlertSummary[];
}
