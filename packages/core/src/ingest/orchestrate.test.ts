import { describe, expect, it, vi } from 'vitest';
import type { Source } from './orchestrate.js';
import * as orchestrateModule from './orchestrate.js';

type RunStatus = 'success' | 'partial' | 'failed';
type AlertType = 'count_drop' | 'cold_start_zero';

interface RawEvent {
  externalId: string;
  externalUrl: string;
  title: string;
  startAt?: string;
  raw: unknown;
}

interface IngestResult {
  fetchedCount: number;
  parsedCount: number;
  items: RawEvent[];
  errors: string[];
}

interface ConnectorLike {
  slug: string;
  type: Source['source_type'];
  run(): Promise<IngestResult>;
}

interface HistoricalIngestRun {
  status: 'success' | 'partial' | 'failed';
  parsed_count: number;
  started_at: string;
}

interface IngestRunDraft {
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

interface IngestAlertDraft {
  source_id: string;
  alert_type: AlertType;
  current_parsed_count: number;
  median_parsed_count: number | null;
  message: string;
}

interface RunEnabledConnectorsResult {
  runs: IngestRunDraft[];
  alerts: IngestAlertDraft[];
}

interface UpsertExternalEventsPayload {
  source_id: string;
  items: RawEvent[];
}

interface RunEnabledConnectorsInput {
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

interface OrchestrateApi {
  runEnabledConnectors(input: RunEnabledConnectorsInput): Promise<RunEnabledConnectorsResult>;
}

const orchestrateApi = orchestrateModule as unknown as OrchestrateApi;

const enabledSourceId = '11111111-1111-4111-8111-111111111111';
const disabledSourceId = '22222222-2222-4222-8222-222222222222';

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

function rawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    externalId: 'event-1',
    externalUrl: 'https://example.com/event-1',
    title: 'A Glasgow Event',
    startAt: '2026-07-15T20:00:00.000Z',
    raw: { id: 'event-1' },
    ...overrides,
  };
}

function connector(slug: string, run: () => Promise<IngestResult>): ConnectorLike {
  return {
    slug,
    type: 'api',
    run,
  };
}

function fixedClock(values: string[]): { now(): string } {
  let index = 0;

  return {
    now: () => values[index++] ?? values.at(-1) ?? '2026-06-08T00:00:00.000Z',
  };
}

describe('runEnabledConnectors', () => {
  it('skips disabled sources without connector execution, run rows, or upserts', async () => {
    const enabledItem = rawEvent({ externalId: 'enabled-event' });
    const disabledItem = rawEvent({ externalId: 'disabled-event' });
    const enabledRun = vi.fn(async () => ({
      fetchedCount: 1,
      parsedCount: 1,
      items: [enabledItem],
      errors: [],
    }));
    const disabledRun = vi.fn(async () => ({
      fetchedCount: 1,
      parsedCount: 1,
      items: [disabledItem],
      errors: [],
    }));
    const upsertExternalEvents = vi.fn(async () => ({ upserted_count: 1 }));

    const result = await orchestrateApi.runEnabledConnectors({
      sources: [
        source({ id: enabledSourceId, slug: 'ticketmaster' }),
        source({ id: disabledSourceId, slug: 'disabled-api', enabled: false }),
      ],
      connectors: {
        ticketmaster: connector('ticketmaster', enabledRun),
        'disabled-api': connector('disabled-api', disabledRun),
      },
      upsertExternalEvents,
      clock: fixedClock(['2026-06-08T09:00:00.000Z', '2026-06-08T09:00:01.000Z']),
    });

    expect(enabledRun).toHaveBeenCalledTimes(1);
    expect(disabledRun).not.toHaveBeenCalled();
    expect(upsertExternalEvents).toHaveBeenCalledTimes(1);
    expect(upsertExternalEvents).toHaveBeenCalledWith({
      source_id: enabledSourceId,
      items: [enabledItem],
    });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      source_id: enabledSourceId,
      status: 'success',
      upserted_external_count: 1,
    });
    expect(result.alerts).toEqual([]);
  });

  it('records a failed run for a throwing connector and continues remaining connectors', async () => {
    const survivingItem = rawEvent({ externalId: 'survives' });
    const throwingRun = vi.fn(async (): Promise<IngestResult> => {
      throw new Error('upstream timeout');
    });
    const survivingRun = vi.fn(async () => ({
      fetchedCount: 1,
      parsedCount: 1,
      items: [survivingItem],
      errors: [],
    }));
    const upsertExternalEvents = vi.fn(async () => ({ upserted_count: 1 }));

    const result = await orchestrateApi.runEnabledConnectors({
      sources: [
        source({ id: '33333333-3333-4333-8333-333333333333', slug: 'broken-api' }),
        source({ id: '44444444-4444-4444-8444-444444444444', slug: 'healthy-api' }),
      ],
      connectors: {
        'broken-api': connector('broken-api', throwingRun),
        'healthy-api': connector('healthy-api', survivingRun),
      },
      upsertExternalEvents,
      clock: fixedClock([
        '2026-06-08T10:00:00.000Z',
        '2026-06-08T10:00:01.000Z',
        '2026-06-08T10:00:02.000Z',
        '2026-06-08T10:00:03.000Z',
      ]),
    });

    expect(throwingRun).toHaveBeenCalledTimes(1);
    expect(survivingRun).toHaveBeenCalledTimes(1);
    expect(upsertExternalEvents).toHaveBeenCalledTimes(1);
    expect(upsertExternalEvents).toHaveBeenCalledWith({
      source_id: '44444444-4444-4444-8444-444444444444',
      items: [survivingItem],
    });
    expect(result.runs).toEqual([
      {
        source_id: '33333333-3333-4333-8333-333333333333',
        status: 'failed',
        fetched_count: 0,
        parsed_count: 0,
        upserted_external_count: 0,
        errors_count: 1,
        error_message: 'upstream timeout',
        started_at: '2026-06-08T10:00:00.000Z',
        finished_at: '2026-06-08T10:00:01.000Z',
      },
      {
        source_id: '44444444-4444-4444-8444-444444444444',
        status: 'success',
        fetched_count: 1,
        parsed_count: 1,
        upserted_external_count: 1,
        errors_count: 0,
        error_message: null,
        started_at: '2026-06-08T10:00:02.000Z',
        finished_at: '2026-06-08T10:00:03.000Z',
      },
    ]);
  });

  it('classifies clean, partial, and cold-start zero runs from connector results', async () => {
    const cleanItem = rawEvent({ externalId: 'clean' });
    const partialItem = rawEvent({ externalId: 'partial' });
    const upsertExternalEvents = vi.fn(async (payload: UpsertExternalEventsPayload) => ({
      upserted_count: payload.items.length,
    }));

    const result = await orchestrateApi.runEnabledConnectors({
      sources: [
        source({ id: '55555555-5555-4555-8555-555555555555', slug: 'clean-api' }),
        source({ id: '66666666-6666-4666-8666-666666666666', slug: 'partial-api' }),
        source({ id: '77777777-7777-4777-8777-777777777777', slug: 'cold-api' }),
      ],
      connectors: {
        'clean-api': connector('clean-api', async () => ({
          fetchedCount: 1,
          parsedCount: 1,
          items: [cleanItem],
          errors: [],
        })),
        'partial-api': connector('partial-api', async () => ({
          fetchedCount: 2,
          parsedCount: 1,
          items: [partialItem],
          errors: ['skipped one item without a valid date'],
        })),
        'cold-api': connector('cold-api', async () => ({
          fetchedCount: 0,
          parsedCount: 0,
          items: [],
          errors: [],
        })),
      },
      previousRunsBySourceId: {},
      upsertExternalEvents,
      clock: fixedClock([
        '2026-06-08T11:00:00.000Z',
        '2026-06-08T11:00:01.000Z',
        '2026-06-08T11:00:02.000Z',
        '2026-06-08T11:00:03.000Z',
        '2026-06-08T11:00:04.000Z',
        '2026-06-08T11:00:05.000Z',
      ]),
    });

    expect(result.runs).toMatchObject([
      {
        source_id: '55555555-5555-4555-8555-555555555555',
        status: 'success',
        fetched_count: 1,
        parsed_count: 1,
        errors_count: 0,
        upserted_external_count: 1,
      },
      {
        source_id: '66666666-6666-4666-8666-666666666666',
        status: 'partial',
        fetched_count: 2,
        parsed_count: 1,
        errors_count: 1,
        upserted_external_count: 1,
      },
      {
        source_id: '77777777-7777-4777-8777-777777777777',
        status: 'failed',
        fetched_count: 0,
        parsed_count: 0,
        errors_count: 0,
        upserted_external_count: 0,
      },
    ]);
    expect(result.alerts).toEqual([
      expect.objectContaining({
        source_id: '77777777-7777-4777-8777-777777777777',
        alert_type: 'cold_start_zero',
        current_parsed_count: 0,
        median_parsed_count: null,
      }),
    ]);
  });

  it('creates a count_drop alert when parsed_count drops below 30 percent of the 14-day median', async () => {
    const sourceId = '88888888-8888-4888-8888-888888888888';

    const result = await orchestrateApi.runEnabledConnectors({
      sources: [source({ id: sourceId, slug: 'established-api' })],
      connectors: {
        'established-api': connector('established-api', async () => ({
          fetchedCount: 8,
          parsedCount: 8,
          items: [rawEvent({ externalId: 'one' })],
          errors: [],
        })),
      },
      previousRunsBySourceId: {
        [sourceId]: [
          {
            status: 'success',
            parsed_count: 20,
            started_at: '2026-06-01T10:00:00.000Z',
          },
          {
            status: 'partial',
            parsed_count: 30,
            started_at: '2026-06-02T10:00:00.000Z',
          },
          {
            status: 'failed',
            parsed_count: 1000,
            started_at: '2026-06-03T10:00:00.000Z',
          },
          {
            status: 'success',
            parsed_count: 40,
            started_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      upsertExternalEvents: vi.fn(async () => ({ upserted_count: 1 })),
      clock: fixedClock(['2026-06-08T12:00:00.000Z', '2026-06-08T12:00:01.000Z']),
    });

    expect(result.runs[0]).toMatchObject({
      source_id: sourceId,
      status: 'success',
      parsed_count: 8,
    });
    expect(result.alerts).toEqual([
      expect.objectContaining({
        source_id: sourceId,
        alert_type: 'count_drop',
        current_parsed_count: 8,
        median_parsed_count: 30,
      }),
    ]);
  });

  it('does not create a count_drop alert for failed current runs', async () => {
    const sourceId = '99999999-9999-4999-8999-999999999999';

    const result = await orchestrateApi.runEnabledConnectors({
      sources: [source({ id: sourceId, slug: 'throwing-established-api' })],
      connectors: {
        'throwing-established-api': connector('throwing-established-api', async () => {
          throw new Error('network unavailable');
        }),
      },
      previousRunsBySourceId: {
        [sourceId]: [
          {
            status: 'success',
            parsed_count: 40,
            started_at: '2026-06-01T10:00:00.000Z',
          },
          {
            status: 'partial',
            parsed_count: 50,
            started_at: '2026-06-02T10:00:00.000Z',
          },
        ],
      },
      upsertExternalEvents: vi.fn(async () => ({ upserted_count: 0 })),
      clock: fixedClock(['2026-06-08T13:00:00.000Z', '2026-06-08T13:00:01.000Z']),
    });

    expect(result.runs[0]).toMatchObject({
      source_id: sourceId,
      status: 'failed',
      parsed_count: 0,
      errors_count: 1,
    });
    expect(result.alerts).toEqual([]);
  });
});

describe('ingest_alerts schema contract', () => {
  // Sourced from the current applied schema — two migrations define this:
  //   20260531000000_schema_v5_initial.sql (original, missing cold_start_zero)
  //   20260603000000_cc_new_1_schema_corrections.sql BLOCK 4 (adds cold_start_zero)
  // The effective constraint is: check (alert_type in ('count_drop', 'parse_failure',
  //   'timeout', 'manual', 'cold_start_zero'))
  const DB_ACCEPTED_ALERT_TYPES: readonly string[] = [
    'count_drop',
    'parse_failure',
    'timeout',
    'manual',
    'cold_start_zero',
  ];

  it('cold_start_zero alert_type is accepted by the ingest_alerts.alert_type CHECK constraint', async () => {
    const sourceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    // Trigger the cold_start_zero code path: first-ever run, zero events, no prior runs.
    const result = await orchestrateApi.runEnabledConnectors({
      sources: [source({ id: sourceId, slug: 'cold-start-api' })],
      connectors: {
        'cold-start-api': connector('cold-start-api', async () => ({
          fetchedCount: 0,
          parsedCount: 0,
          items: [],
          errors: [],
        })),
      },
      previousRunsBySourceId: {},
      upsertExternalEvents: vi.fn(async () => ({ upserted_count: 0 })),
      clock: fixedClock(['2026-06-08T14:00:00.000Z', '2026-06-08T14:00:01.000Z']),
    });

    expect(result.alerts).toHaveLength(1);
    for (const alert of result.alerts) {
      expect(DB_ACCEPTED_ALERT_TYPES).toContain(alert.alert_type);
    }
  });
});
