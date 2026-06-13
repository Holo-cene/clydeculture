// @clydeculture/core — pure normalisation, deduplication, and orchestration logic
export { deriveDedupeKey } from './dedupe/dedupe.js';
export {
  normaliseTitle,
  normaliseVenueName,
  calculateConfidence,
  normaliseImageUrl,
  mapSourceCategoryToEventType,
  buildCanonicalEventDraft,
  mapAvailabilityGuessToCanonical,
  mergeExternalEventIntoCanonicalEvent,
  type SourceTier,
  type TypeSource,
  type CanonicalAvailability,
  type SourceCategoryMapping,
  type EventTypeResolution,
  type ConfidenceInput,
  type ConfidenceInputs,
  type ConfidenceResult,
  type ExternalEventDraft,
  type CanonicalEventDraft,
  type MergeableCanonicalEvent,
  type MergeResult,
} from './normalise/normalise.js';
export { runSweepIntegration } from './ingest/sweep.js';
export type { SweepIntegrationInput } from './ingest/sweep.js';
export { SWEEP_TASK_ID, SWEEP_DAILY_SCHEDULE } from './ingest/sweepSchedule.js';
export type { SweepSchedule } from './ingest/sweepSchedule.js';
export type {
  ConnectorLike,
  HistoricalIngestRun,
  IngestAlertDraft,
  IngestRunDraft,
  Source,
  UpsertExternalEventsPayload,
} from './ingest/orchestrate.js';
