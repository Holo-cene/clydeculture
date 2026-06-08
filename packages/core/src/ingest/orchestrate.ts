export type RunStatus = 'success' | 'partial' | 'failed';
export type AlertType = 'count_drop' | 'cold_start_zero';
export type SourceType = 'api' | 'rss' | 'ical' | 'html' | 'apify' | 'manual';
export type SourceStatus = 'ok' | 'degraded' | 'broken' | 'disabled';

export interface Source {
  id: string;
  name: string;
  slug: string;
  source_type: SourceType;
  tier: number;
  config: Record<string, unknown>;
  status: SourceStatus;
  enabled: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawEvent {
  externalId: string;
  externalUrl: string;
  title: string;
  startAt?: string;
  raw: unknown;
}

export interface IngestResult {
  fetchedCount: number;
  parsedCount: number;
  items: RawEvent[];
  errors: string[];
}

export interface ConnectorLike {
  slug: string;
  type: Source['source_type'];
  run(): Promise<IngestResult>;
}

export interface HistoricalIngestRun {
  status: RunStatus;
  parsed_count: number;
  started_at: string;
}

export interface IngestRunDraft {
  source_id: string;
  status: RunStatus;
  fetched_count: number;
  parsed_count: number;
  upserted_external_count: number;
  errors_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}

export interface IngestAlertDraft {
  source_id: string;
  alert_type: AlertType;
  current_parsed_count: number;
  median_parsed_count: number | null;
  message: string;
}

export interface UpsertExternalEventsPayload {
  source_id: string;
  items: RawEvent[];
}

export interface RunEnabledConnectorsInput {
  sources: Source[];
  connectors: Record<string, ConnectorLike>;
  previousRunsBySourceId?: Record<string, HistoricalIngestRun[]>;
  upsertExternalEvents(payload: UpsertExternalEventsPayload): Promise<{
    upserted_count: number;
  }>;
  clock: {
    now(): string;
  };
}

export interface RunEnabledConnectorsResult {
  runs: IngestRunDraft[];
  alerts: IngestAlertDraft[];
}

export async function runEnabledConnectors(
  input: RunEnabledConnectorsInput,
): Promise<RunEnabledConnectorsResult> {
  const runs: IngestRunDraft[] = [];
  const alerts: IngestAlertDraft[] = [];

  for (const source of input.sources) {
    if (!source.enabled) continue;

    const startedAt = input.clock.now();
    const connector = input.connectors[source.slug];

    if (!connector) {
      const run = failedRun({
        sourceId: source.id,
        startedAt,
        finishedAt: input.clock.now(),
        errorMessage: `No connector registered for source ${source.slug}`,
      });
      runs.push(run);
      alerts.push(...alertsForRun(source, run, input.previousRunsBySourceId?.[source.id] ?? []));
      continue;
    }

    try {
      const result = await connector.run();
      const upsertedExternalCount =
        result.items.length > 0
          ? (await input.upsertExternalEvents({ source_id: source.id, items: result.items })).upserted_count
          : 0;
      const finishedAt = input.clock.now();
      const run = runDraftFromResult({
        sourceId: source.id,
        result,
        upsertedExternalCount,
        startedAt,
        finishedAt,
      });

      runs.push(run);
      alerts.push(...alertsForRun(source, run, input.previousRunsBySourceId?.[source.id] ?? []));
    } catch (error) {
      const run = failedRun({
        sourceId: source.id,
        startedAt,
        finishedAt: input.clock.now(),
        errorMessage: stringifyError(error),
      });

      runs.push(run);
      alerts.push(...alertsForRun(source, run, input.previousRunsBySourceId?.[source.id] ?? []));
    }
  }

  return { runs, alerts };
}

function runDraftFromResult(input: {
  sourceId: string;
  result: IngestResult;
  upsertedExternalCount: number;
  startedAt: string;
  finishedAt: string;
}): IngestRunDraft {
  const errorsCount = input.result.errors.length;

  return {
    source_id: input.sourceId,
    status: statusForResult(input.result),
    fetched_count: input.result.fetchedCount,
    parsed_count: input.result.parsedCount,
    upserted_external_count: input.upsertedExternalCount,
    errors_count: errorsCount,
    error_message: errorsCount > 0 ? input.result.errors.join('\n') : null,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  };
}

function statusForResult(result: IngestResult): RunStatus {
  if (result.parsedCount <= 0) return 'failed';
  if (result.errors.length > 0) return 'partial';
  return 'success';
}

function failedRun(input: {
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  errorMessage: string;
}): IngestRunDraft {
  return {
    source_id: input.sourceId,
    status: 'failed',
    fetched_count: 0,
    parsed_count: 0,
    upserted_external_count: 0,
    errors_count: 1,
    error_message: input.errorMessage,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  };
}

function alertsForRun(
  source: Source,
  run: IngestRunDraft,
  previousRuns: HistoricalIngestRun[],
): IngestAlertDraft[] {
  const previousNonFailedRuns = previousRuns.filter((previousRun) => previousRun.status !== 'failed');

  if (run.status === 'failed' && run.parsed_count === 0 && previousNonFailedRuns.length === 0) {
    return [
      {
        source_id: source.id,
        alert_type: 'cold_start_zero',
        current_parsed_count: run.parsed_count,
        median_parsed_count: null,
        message: `${source.slug} produced zero parsed events before a healthy baseline was established.`,
      },
    ];
  }

  if (run.status === 'failed' || previousNonFailedRuns.length === 0) {
    return [];
  }

  const medianParsedCount = median(previousNonFailedRuns.map((previousRun) => previousRun.parsed_count));
  if (medianParsedCount === null || run.parsed_count >= medianParsedCount * 0.3) {
    return [];
  }

  return [
    {
      source_id: source.id,
      alert_type: 'count_drop',
      current_parsed_count: run.parsed_count,
      median_parsed_count: medianParsedCount,
      message: `${source.slug} parsed ${run.parsed_count} events, below 30% of its 14-day median of ${medianParsedCount}.`,
    },
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) return null;

  return (lower + upper) / 2;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
