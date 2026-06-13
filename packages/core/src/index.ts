// @clydeculture/core — pure normalisation, deduplication, and orchestration logic
export { deriveDedupeKey } from './dedupe/dedupe.js';
export {
  normaliseTitle,
  normaliseVenueName,
  calculateConfidence,
  calculateTrust,
  calculateCompleteness,
  isEligibleForPublic,
  DEFAULT_TRUST_BAR,
  DEFAULT_COMPLETENESS_BAR,
  normaliseImageUrl,
  mapSourceCategoryToEventType,
  buildCanonicalEventDraft,
  mapAvailabilityGuessToCanonical,
  type SourceTier,
  type TypeSource,
  type CanonicalAvailability,
  type SourceCategoryMapping,
  type EventTypeResolution,
  type ConfidenceInput,
  type ConfidenceInputs,
  type ConfidenceResult,
  type TrustInput,
  type TrustInputs,
  type TrustResult,
  type CompletenessInput,
  type CompletenessInputs,
  type CompletenessResult,
  type ExternalEventDraft,
  type CanonicalEventDraft,
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
