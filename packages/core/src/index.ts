// @clydeculture/core — pure normalisation, deduplication, and orchestration logic
export { deriveDedupeKey } from './dedupe/dedupe.js';
export {
  normaliseTitle,
  normaliseVenueName,
  calculateConfidence,
  normaliseImageUrl,
  mapSourceCategoryToEventType,
  buildCanonicalEventDraft,
  type SourceTier,
  type TypeSource,
  type SourceCategoryMapping,
  type EventTypeResolution,
  type ConfidenceInput,
  type ConfidenceInputs,
  type ConfidenceResult,
  type ExternalEventDraft,
  type CanonicalEventDraft,
} from './normalise/normalise.js';
export { runSweepIntegration } from './ingest/sweep.js';
export type { SweepIntegrationInput } from './ingest/sweep.js';
export type {
  HistoricalIngestRun,
  IngestAlertDraft,
  IngestRunDraft,
  Source,
  UpsertExternalEventsPayload,
} from './ingest/orchestrate.js';
