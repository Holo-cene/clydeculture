import { describe, expect, it, vi } from 'vitest';
import type {
  ConnectorLike,
  HistoricalIngestRun,
  IngestAlertDraft,
  IngestRunDraft,
  Source,
  UpsertExternalEventsPayload,
} from './orchestrate.js';

interface SweepAdapterInput {
  connectors: Record<string, ConnectorLike>;
  loadSources(): Promise<Source[]>;
  loadPreviousRunsBySourceId(sourceIds: string[]): Promise<Record<string, HistoricalIngestRun[]>>;
  upsertExternalEvents(payload: UpsertExternalEventsPayload): Promise<{ upserted_count: number }>;
  persistIngestRuns(runs: IngestRunDraft[]): Promise<void>;
  persistIngestAlerts(alerts: IngestAlertDraft[]): Promise<void>;
  normaliseExternalEventsForSource(sourceId: string): Promise<void>;
  clock: {
    now(): string;
  };
}

interface SweepAdapterApi {
  runSweepIntegration(input: SweepAdapterInput): Promise<{
    runs: IngestRunDraft[];
    alerts: IngestAlertDraft[];
  }>;
}

async function loadApi(): Promise<SweepAdapterApi> {
  return (await import('./sweep.js')) as unknown as SweepAdapterApi;
}

const ticketmasterSourceId = '11111111-1111-4111-8111-111111111111';
const disabledSourceId = '22222222-2222-4222-8222-222222222222';
const brokenSourceId = '33333333-3333-4333-8333-333333333333';
const healthySourceId = '44444444-4444-4444-8444-444444444444';

function source(overrides: Partial<Source> & Pick<Source, 'id' | 'slug'>): Source {
  const { id, slug, ...rest } = overrides;

  return {
    id,
    name: slug,
    slug,
    source_type: 'api',
    tier: 1,
    config: {},
    status: 'ok',
    enabled: true,
    last_run_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...rest,
  };
}

function connector(
  slug: string,
  run: ConnectorLike['run'],
  type: ConnectorLike['type'] = 'api',
): ConnectorLike {
  return { slug, type, run };
}

function fixedClock(values: string[]): { now(): string } {
  let index = 0;
  return {
    now: () => values[index++] ?? values.at(-1) ?? '2026-06-08T00:00:00.000Z',
  };
}

describe('runSweepIntegration', () => {
  it('loads sources, skips disabled sources, persists runs and alerts, and normalises after external upsert', async () => {
    const callOrder: string[] = [];
    const ticketmasterItem = {
      externalId: 'tm-1',
      externalUrl: 'https://www.ticketmaster.co.uk/event/tm-1',
      title: 'Mogwai',
      startAt: '2026-07-15T20:00:00.000Z',
      raw: { id: 'tm-1' },
    };
    const ticketmasterRun = vi.fn(async () => {
      callOrder.push('connector:ticketmaster');
      return {
        fetchedCount: 1,
        parsedCount: 1,
        items: [ticketmasterItem],
        errors: [],
      };
    });
    const disabledRun = vi.fn(async () => {
      callOrder.push('connector:disabled');
      return {
        fetchedCount: 1,
        parsedCount: 1,
        items: [],
        errors: [],
      };
    });
    const upsertExternalEvents = vi.fn(async () => {
      callOrder.push('upsertExternalEvents');
      return { upserted_count: 1 };
    });
    const persistIngestRuns = vi.fn(async () => {
      callOrder.push('persistIngestRuns');
    });
    const persistIngestAlerts = vi.fn(async () => {
      callOrder.push('persistIngestAlerts');
    });
    const normaliseExternalEventsForSource = vi.fn(async () => {
      callOrder.push('normalise');
    });
    const { runSweepIntegration } = await loadApi();

    const result = await runSweepIntegration({
      connectors: {
        ticketmaster: connector('ticketmaster', ticketmasterRun),
        'disabled-api': connector('disabled-api', disabledRun),
      },
      loadSources: async () => [
        source({ id: ticketmasterSourceId, slug: 'ticketmaster', enabled: true }),
        source({ id: disabledSourceId, slug: 'disabled-api', enabled: false }),
      ],
      loadPreviousRunsBySourceId: async (sourceIds) => {
        expect(sourceIds).toEqual([ticketmasterSourceId]);
        return {
          [ticketmasterSourceId]: [
            { status: 'success', parsed_count: 10, started_at: '2026-06-01T10:00:00.000Z' },
            { status: 'partial', parsed_count: 10, started_at: '2026-06-02T10:00:00.000Z' },
            { status: 'success', parsed_count: 10, started_at: '2026-06-03T10:00:00.000Z' },
          ],
        };
      },
      upsertExternalEvents,
      persistIngestRuns,
      persistIngestAlerts,
      normaliseExternalEventsForSource,
      clock: fixedClock(['2026-06-08T09:00:00.000Z', '2026-06-08T09:00:01.000Z']),
    });

    expect(ticketmasterRun).toHaveBeenCalledOnce();
    expect(disabledRun).not.toHaveBeenCalled();
    expect(upsertExternalEvents).toHaveBeenCalledWith({
      source_id: ticketmasterSourceId,
      items: [ticketmasterItem],
    });
    expect(normaliseExternalEventsForSource).toHaveBeenCalledWith(ticketmasterSourceId);
    expect(persistIngestRuns).toHaveBeenCalledWith(result.runs);
    expect(persistIngestAlerts).toHaveBeenCalledWith(result.alerts);
    expect(result.runs).toEqual([
      expect.objectContaining({
        source_id: ticketmasterSourceId,
        status: 'success',
        upserted_external_count: 1,
      }),
    ]);
    expect(result.alerts).toEqual([
      expect.objectContaining({
        source_id: ticketmasterSourceId,
        alert_type: 'count_drop',
        current_parsed_count: 1,
        median_parsed_count: 10,
      }),
    ]);
    expect(callOrder).toEqual([
      'connector:ticketmaster',
      'upsertExternalEvents',
      'persistIngestRuns',
      'normalise',
      'persistIngestAlerts',
    ]);
  });

  it('records one connector failure while continuing to run, persist, and normalise a later source', async () => {
    const brokenRun = vi.fn(async () => {
      throw new Error('upstream timeout');
    });
    const healthyItem = {
      externalId: 'healthy-1',
      externalUrl: 'https://example.com/healthy-1',
      title: 'Healthy Event',
      startAt: '2026-07-16T19:00:00.000Z',
      raw: { id: 'healthy-1' },
    };
    const healthyRun = vi.fn(async () => ({
      fetchedCount: 1,
      parsedCount: 1,
      items: [healthyItem],
      errors: [],
    }));
    const upsertExternalEvents = vi.fn(async () => ({ upserted_count: 1 }));
    const persistIngestRuns = vi.fn(async () => undefined);
    const persistIngestAlerts = vi.fn(async () => undefined);
    const normaliseExternalEventsForSource = vi.fn(async () => undefined);
    const { runSweepIntegration } = await loadApi();

    const result = await runSweepIntegration({
      connectors: {
        'broken-api': connector('broken-api', brokenRun),
        'healthy-api': connector('healthy-api', healthyRun),
      },
      loadSources: async () => [
        source({ id: brokenSourceId, slug: 'broken-api', enabled: true }),
        source({ id: healthySourceId, slug: 'healthy-api', enabled: true }),
      ],
      loadPreviousRunsBySourceId: async () => ({}),
      upsertExternalEvents,
      persistIngestRuns,
      persistIngestAlerts,
      normaliseExternalEventsForSource,
      clock: fixedClock([
        '2026-06-08T10:00:00.000Z',
        '2026-06-08T10:00:01.000Z',
        '2026-06-08T10:00:02.000Z',
        '2026-06-08T10:00:03.000Z',
      ]),
    });

    expect(brokenRun).toHaveBeenCalledOnce();
    expect(healthyRun).toHaveBeenCalledOnce();
    expect(upsertExternalEvents).toHaveBeenCalledTimes(1);
    expect(upsertExternalEvents).toHaveBeenCalledWith({
      source_id: healthySourceId,
      items: [healthyItem],
    });
    expect(normaliseExternalEventsForSource).toHaveBeenCalledTimes(1);
    expect(normaliseExternalEventsForSource).toHaveBeenCalledWith(healthySourceId);
    expect(persistIngestRuns).toHaveBeenCalledWith(result.runs);
    expect(persistIngestAlerts).toHaveBeenCalledWith(result.alerts);
    expect(result.runs).toEqual([
      expect.objectContaining({
        source_id: brokenSourceId,
        status: 'failed',
        error_message: 'upstream timeout',
        upserted_external_count: 0,
      }),
      expect.objectContaining({
        source_id: healthySourceId,
        status: 'success',
        upserted_external_count: 1,
      }),
    ]);
  });
});
