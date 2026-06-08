import {
  runEnabledConnectors,
  type ConnectorLike,
  type HistoricalIngestRun,
  type IngestAlertDraft,
  type IngestRunDraft,
  type RunEnabledConnectorsResult,
  type Source,
  type UpsertExternalEventsPayload,
} from './orchestrate.js';

export interface SweepIntegrationInput {
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

export async function runSweepIntegration(
  input: SweepIntegrationInput,
): Promise<RunEnabledConnectorsResult> {
  const sources = await input.loadSources();
  const enabledSourceIds = sources
    .filter((source) => source.enabled)
    .map((source) => source.id);
  const previousRunsBySourceId = await input.loadPreviousRunsBySourceId(enabledSourceIds);
  const sourcesToNormalise: string[] = [];

  const result = await runEnabledConnectors({
    sources,
    connectors: input.connectors,
    previousRunsBySourceId,
    upsertExternalEvents: async (payload) => {
      const upsertResult = await input.upsertExternalEvents(payload);
      if (upsertResult.upserted_count > 0) {
        sourcesToNormalise.push(payload.source_id);
      }
      return upsertResult;
    },
    clock: input.clock,
  });

  await input.persistIngestRuns(result.runs);

  for (const sourceId of sourcesToNormalise) {
    await input.normaliseExternalEventsForSource(sourceId);
  }

  await input.persistIngestAlerts(result.alerts);

  return result;
}
