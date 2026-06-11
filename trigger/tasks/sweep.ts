import { task } from '@trigger.dev/sdk/v3';
import { runSweepIntegration } from '@clydeculture/core';
import { normaliseExternalEventsForSource } from '@clydeculture/ingestion';
import {
  createDataThistleConnector,
  createTicketmasterConnector,
  dataThistleConfigFromEnv,
} from '@clydeculture/connectors';
import { createClient, upsertExternalEvents } from '@clydeculture/shared';
import type {
  ConnectorLike,
  HistoricalIngestRun,
  IngestAlertDraft,
  IngestRunDraft,
  Source,
  UpsertExternalEventsPayload,
} from '@clydeculture/core';
import type { NormaliseDbClient } from '@clydeculture/ingestion';

export const sweepTask = task({
  id: 'sweep',
  run: async () => {
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));

    const connectors: Record<string, ConnectorLike> = {
      ticketmaster: createTicketmasterConnector({
        apiKey: requiredEnv('TICKETMASTER_API_KEY'),
      }),
    };

    // Staging-only source: runs only when credentials are configured AND the
    // datathistle sources row is enabled. Public display stays gated by
    // sourcePolicy.ts regardless (productionEnabled = false).
    const dataThistleConfig = dataThistleConfigFromEnv(process.env);
    if (dataThistleConfig) {
      connectors['datathistle'] = createDataThistleConnector(dataThistleConfig);
    }

    return runSweepIntegration({
      connectors,
      loadSources: async () => loadSources(supabase),
      loadPreviousRunsBySourceId: async (sourceIds) => loadPreviousRunsBySourceId(supabase, sourceIds),
      upsertExternalEvents: async (payload) => upsertExternalEventsForSweep(supabase, payload),
      persistIngestRuns: async (runs) => persistIngestRuns(supabase, runs),
      persistIngestAlerts: async (alerts) => persistIngestAlerts(supabase, alerts),
      normaliseExternalEventsForSource: async (sourceId) =>
        normaliseExternalEventsForSource({ client: supabase as unknown as NormaliseDbClient, sourceId }),
      clock: {
        now: () => new Date().toISOString(),
      },
    });
  },
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function loadSources(client: ReturnType<typeof createClient>): Promise<Source[]> {
  const { data, error } = await client.from('sources').select('*').order('slug');
  if (error) throw error;
  return (data ?? []) as Source[];
}

async function loadPreviousRunsBySourceId(
  client: ReturnType<typeof createClient>,
  sourceIds: string[],
): Promise<Record<string, HistoricalIngestRun[]>> {
  if (sourceIds.length === 0) return {};

  const { data, error } = await client
    .from('ingest_runs')
    .select('source_id,status,parsed_count,started_at')
    .in('source_id', sourceIds)
    .gte('started_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false });
  if (error) throw error;

  const grouped: Record<string, HistoricalIngestRun[]> = {};
  for (const row of data ?? []) {
    const sourceId = String(row.source_id);
    grouped[sourceId] ??= [];
    grouped[sourceId].push({
      status: row.status,
      parsed_count: row.parsed_count,
      started_at: row.started_at,
    } as HistoricalIngestRun);
  }
  return grouped;
}

async function upsertExternalEventsForSweep(
  client: ReturnType<typeof createClient>,
  payload: UpsertExternalEventsPayload,
): Promise<{ upserted_count: number }> {
  await upsertExternalEvents(client, payload.source_id, payload.items);
  return { upserted_count: payload.items.length };
}

async function persistIngestRuns(
  client: ReturnType<typeof createClient>,
  runs: IngestRunDraft[],
): Promise<void> {
  if (runs.length === 0) return;
  const { error } = await client.from('ingest_runs').insert(runs);
  if (error) throw error;
}

async function persistIngestAlerts(
  client: ReturnType<typeof createClient>,
  alerts: IngestAlertDraft[],
): Promise<void> {
  if (alerts.length === 0) return;
  const { error } = await client.from('ingest_alerts').insert(alerts);
  if (error) throw error;
}
