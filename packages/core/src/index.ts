// @clydeculture/core — normalisation, deduplication, and festival detection
export { normaliseExternalEventsForSource } from './normalise/dbNormalise.js';
export { runSweepIntegration } from './ingest/sweep.js';
export type {
  NormaliseDbClient,
  NormaliseExternalEventsForSourceInput,
} from './normalise/dbNormalise.js';
export type { SweepIntegrationInput } from './ingest/sweep.js';
export type {
  HistoricalIngestRun,
  IngestAlertDraft,
  IngestRunDraft,
  Source,
  UpsertExternalEventsPayload,
} from './ingest/orchestrate.js';
