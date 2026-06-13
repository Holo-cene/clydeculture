import { deriveDedupeKey } from '../dedupe/dedupe.js';

export type SourceTier = 1 | 2 | 3 | 4;
export type TypeSource = 'map' | 'keyword' | 'fallback';

export interface SourceCategoryMapping {
  sourceSlug: string;
  sourceCategory: string;
  eventTypeSlug: string;
}

export interface EventTypeResolution {
  eventTypeSlug: string;
  typeSource: TypeSource;
  needsReview: boolean;
}

export interface ConfidenceInput {
  sourceTier: SourceTier;
  title: string;
  startAt?: string | null;
  timeTba?: boolean;
  sourceUrl?: string | null;
  ticketUrl?: string | null;
  venue?: { id: string; autoCreated?: boolean } | null;
  eventTypeSlug: string;
  typeSource: TypeSource;
  corroborated?: boolean;
}

export interface ConfidenceInputs {
  tier: SourceTier;
  base_score: number;
  has_start_at: boolean;
  venue_resolved: boolean;
  type_classified: boolean;
  type_source: TypeSource;
  title_quality: boolean;
  has_url: boolean;
  corroborated: boolean;
  total: number;
}

export interface ConfidenceResult {
  score: number;
  needsReview: boolean;
  reviewReasons: string[];
  inputs: ConfidenceInputs;
}

export interface ExternalEventDraft {
  sourceId: string;
  sourceSlug: string;
  sourceTier: SourceTier;
  externalId: string;
  externalUrl: string;
  title: string;
  startAt: string;
  venueId: string;
  eventTypeGuess: string;
  ticketUrlGuess?: string;
  ticketUrlLabelGuess?: string;
  imageUrlGuess?: string;
  summaryGuess?: string;
  descriptionGuess?: string;
  raw: unknown;
}

export interface CanonicalEventDraft {
  title: string;
  normalisedTitle: string;
  summary: string | null;
  description: string | null;
  sourceUrl: string;
  ticketUrl?: string;
  ticketUrlLabel?: string;
  imageUrl: string | null;
  startAt: string;
  timezone: string;
  timeTba: boolean;
  eventTypeSlug: string;
  venueId: string;
  primarySourceId: string;
  confidence: number;
  confidenceInputs: ConfidenceInputs;
  visibility: 'draft';
  needsReview: boolean;
  dedupeKey: string;
}

export function normaliseTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseVenueName(input: string): string {
  return normaliseTitle(input);
}

export function mapSourceCategoryToEventType(input: {
  sourceSlug: string;
  sourceCategory?: string | null;
  mappings: SourceCategoryMapping[];
}): EventTypeResolution {
  const sourceSlug = input.sourceSlug.trim().toLowerCase();
  const sourceCategory = input.sourceCategory?.trim().toLowerCase();

  if (sourceCategory) {
    const mapping = input.mappings.find(
      (candidate) =>
        candidate.sourceSlug.trim().toLowerCase() === sourceSlug &&
        candidate.sourceCategory.trim().toLowerCase() === sourceCategory,
    );

    if (mapping) {
      return {
        eventTypeSlug: mapping.eventTypeSlug,
        typeSource: 'map',
        needsReview: false,
      };
    }
  }

  return {
    eventTypeSlug: 'other',
    typeSource: 'fallback',
    needsReview: true,
  };
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const baseScoreByTier: Record<SourceTier, number> = {
    1: 50,
    2: 40,
    3: 30,
    4: 20,
  };
  const reviewReasons: string[] = [];
  const baseScore = baseScoreByTier[input.sourceTier];
  const hasStartAt = Boolean(input.startAt) && input.timeTba !== true;
  const venueResolved = Boolean(input.venue?.id) && input.venue?.autoCreated !== true;
  const typeClassified = input.eventTypeSlug !== 'other';
  const titleQuality = normaliseTitle(input.title).split(' ').filter(Boolean).length >= 3;
  const hasUrl = Boolean(input.sourceUrl?.trim() || input.ticketUrl?.trim());
  const corroborated = input.corroborated === true;

  let score = baseScore;
  if (hasStartAt) score += 10;
  if (venueResolved) score += 10;
  if (typeClassified) score += 10;
  if (titleQuality) score += 5;
  if (hasUrl) score += 5;
  if (corroborated) score += 10;

  if (!venueResolved) {
    reviewReasons.push(input.venue?.autoCreated === true ? 'venue_auto_created' : 'venue_unresolved');
  }
  if (!typeClassified || input.typeSource === 'fallback') reviewReasons.push('event_type_fallback');
  if (input.timeTba === true) reviewReasons.push('time_tba');
  if (input.sourceTier === 4) reviewReasons.push('tier_4_source');
  if (input.title.trim().length < 3) reviewReasons.push('title_too_short');
  if (score < 50) reviewReasons.push('low_confidence');

  const inputs: ConfidenceInputs = {
    tier: input.sourceTier,
    base_score: baseScore,
    has_start_at: hasStartAt,
    venue_resolved: venueResolved,
    type_classified: typeClassified,
    type_source: input.typeSource,
    title_quality: titleQuality,
    has_url: hasUrl,
    corroborated,
    total: score,
  };

  return {
    score,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    inputs,
  };
}

export type CanonicalAvailability =
  | 'on_sale'
  | 'sold_out'
  | 'low_stock'
  | 'postponed'
  | 'rescheduled'
  | 'cancelled'
  | 'not_on_sale';

const AVAILABILITY_MAP: Record<string, CanonicalAvailability> = {
  onsale: 'on_sale',
  offsale: 'not_on_sale',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  rescheduled: 'rescheduled',
  postponed: 'postponed',
  soldout: 'sold_out',
  sold_out: 'sold_out',
};

export function mapAvailabilityGuessToCanonical(
  guess: string | null | undefined,
): CanonicalAvailability | undefined {
  if (!guess) return undefined;
  return AVAILABILITY_MAP[guess.trim().toLowerCase()];
}

export function normaliseImageUrl(input?: string | null): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  const placeholder = trimmed.toLowerCase();
  if (placeholder === 'n/a' || placeholder === 'undefined' || placeholder === 'null') {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !url.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function buildCanonicalEventDraft(input: {
  externalEvent: ExternalEventDraft;
  sourceCategoryMappings: SourceCategoryMapping[];
  timezone?: string;
  corroborated?: boolean;
}): CanonicalEventDraft {
  const title = input.externalEvent.title.trim().slice(0, 500);
  const eventTypeResolution = mapSourceCategoryToEventType({
    sourceSlug: input.externalEvent.sourceSlug,
    sourceCategory: input.externalEvent.eventTypeGuess,
    mappings: input.sourceCategoryMappings,
  });
  const confidenceInput: ConfidenceInput = {
    sourceTier: input.externalEvent.sourceTier,
    title,
    startAt: input.externalEvent.startAt,
    timeTba: false,
    sourceUrl: input.externalEvent.externalUrl,
    venue: { id: input.externalEvent.venueId },
    eventTypeSlug: eventTypeResolution.eventTypeSlug,
    typeSource: eventTypeResolution.typeSource,
  };
  if (input.externalEvent.ticketUrlGuess) {
    confidenceInput.ticketUrl = input.externalEvent.ticketUrlGuess;
  }
  if (input.corroborated !== undefined) {
    confidenceInput.corroborated = input.corroborated;
  }
  const confidence = calculateConfidence(confidenceInput);

  const draft: CanonicalEventDraft = {
    title,
    normalisedTitle: normaliseTitle(title),
    summary: null,
    description: null,
    sourceUrl: input.externalEvent.externalUrl,
    imageUrl: normaliseImageUrl(input.externalEvent.imageUrlGuess),
    startAt: input.externalEvent.startAt,
    timezone: input.timezone ?? 'Europe/London',
    timeTba: false,
    eventTypeSlug: eventTypeResolution.eventTypeSlug,
    venueId: input.externalEvent.venueId,
    primarySourceId: input.externalEvent.sourceId,
    confidence: confidence.score,
    confidenceInputs: confidence.inputs,
    visibility: 'draft',
    needsReview: eventTypeResolution.needsReview || confidence.needsReview,
    dedupeKey: deriveDedupeKey(
      input.externalEvent.venueId,
      input.externalEvent.startAt,
      title,
    ),
  };

  if (input.externalEvent.ticketUrlGuess) {
    draft.ticketUrl = input.externalEvent.ticketUrlGuess;
  }
  if (input.externalEvent.ticketUrlLabelGuess) {
    draft.ticketUrlLabel = input.externalEvent.ticketUrlLabelGuess;
  }

  return draft;
}

export interface MergeableCanonicalEvent {
  title: string;
  normalisedTitle: string;
  summary: string | null;
  description: string | null;
  sourceUrl: string;
  ticketUrl: string | null;
  ticketUrlLabel: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  doorsAt: string | null;
  timezone: string;
  timeTba: boolean;
  availability: CanonicalAvailability | null;
  availabilityNote: string | null;
  eventTypeSlug: string;
  venueId: string | null;
  primarySourceId: string;
  sourceTier: SourceTier;
  fetchedAt: string;
  needsReview: boolean;
}

export interface MergeResult extends MergeableCanonicalEvent {
  reviewReasons: string[];
  dedupeKey: string;
}

// mergeExternalEventIntoCanonicalEvent applies docs/NORMALISATION.md Step 8's
// field-level merge priority table. Pure: no I/O.
//
// Picks the per-field winner using tier (lower = better) and fetchedAt as the
// same-tier tiebreaker. Never lets null overwrite non-null. Treats availability
// specially: 'rescheduled' / 'postponed' always force needs_review and may
// refresh from a worse-tier source.
export function mergeExternalEventIntoCanonicalEvent(input: {
  canonical: MergeableCanonicalEvent;
  incoming: MergeableCanonicalEvent;
}): MergeResult {
  const { canonical, incoming } = input;
  const incomingIsBetterTier = incoming.sourceTier < canonical.sourceTier;
  const incomingIsSameTier = incoming.sourceTier === canonical.sourceTier;
  const incomingFetchedLater =
    Date.parse(incoming.fetchedAt) > Date.parse(canonical.fetchedAt);
  const incomingWinsContent =
    incomingIsBetterTier || (incomingIsSameTier && incomingFetchedLater);

  const pickContent = <T>(
    incomingValue: T | null,
    canonicalValue: T | null,
  ): T | null => {
    if (!incomingWinsContent) return canonicalValue;
    if (incomingValue === null || incomingValue === undefined) {
      return canonicalValue;
    }
    return incomingValue;
  };

  const title = pickContent(incoming.title, canonical.title) ?? canonical.title;
  const normalisedTitle =
    title === incoming.title
      ? incoming.normalisedTitle
      : canonical.normalisedTitle;

  const startAt = incomingWinsContent ? incoming.startAt : canonical.startAt;
  const startAtChanged = startAt !== canonical.startAt;

  const venueId = pickContent(incoming.venueId, canonical.venueId);

  // Availability is most-recently-verified: incoming wins if it's non-null and
  // either better-or-same tier, OR it's a state-change signal ('rescheduled' /
  // 'postponed' / 'cancelled') which always refreshes regardless of tier.
  const stateChangeIncoming =
    incoming.availability === 'rescheduled' ||
    incoming.availability === 'postponed' ||
    incoming.availability === 'cancelled';
  let availability: CanonicalAvailability | null = canonical.availability;
  let availabilityNote: string | null = canonical.availabilityNote;
  if (incoming.availability !== null) {
    const availabilityIncomingWins =
      incomingIsBetterTier ||
      incomingIsSameTier ||
      stateChangeIncoming ||
      incomingFetchedLater;
    if (availabilityIncomingWins) {
      availability = incoming.availability;
      availabilityNote = incoming.availabilityNote;
    }
  }

  const reviewReasons: string[] = [];
  if (canonical.needsReview) reviewReasons.push('canonical_needs_review');
  if (incoming.needsReview) reviewReasons.push('incoming_needs_review');
  if (availability === 'rescheduled') reviewReasons.push('availability_rescheduled');
  if (availability === 'postponed') reviewReasons.push('availability_postponed');
  if (startAtChanged) reviewReasons.push('start_at_changed');

  const result: MergeResult = {
    title,
    normalisedTitle,
    summary: pickContent(incoming.summary, canonical.summary),
    description: pickContent(incoming.description, canonical.description),
    sourceUrl: pickContent(incoming.sourceUrl, canonical.sourceUrl) ?? canonical.sourceUrl,
    ticketUrl: pickContent(incoming.ticketUrl, canonical.ticketUrl),
    ticketUrlLabel: pickContent(incoming.ticketUrlLabel, canonical.ticketUrlLabel),
    imageUrl: pickContent(incoming.imageUrl, canonical.imageUrl),
    startAt,
    endAt: pickContent(incoming.endAt, canonical.endAt),
    doorsAt: pickContent(incoming.doorsAt, canonical.doorsAt),
    timezone: incomingWinsContent ? incoming.timezone : canonical.timezone,
    timeTba: incomingWinsContent ? incoming.timeTba : canonical.timeTba,
    availability,
    availabilityNote,
    eventTypeSlug:
      incomingWinsContent && incoming.eventTypeSlug !== 'other'
        ? incoming.eventTypeSlug
        : canonical.eventTypeSlug,
    venueId,
    primarySourceId: incomingWinsContent
      ? incoming.primarySourceId
      : canonical.primarySourceId,
    sourceTier: incomingWinsContent ? incoming.sourceTier : canonical.sourceTier,
    fetchedAt: incomingFetchedLater ? incoming.fetchedAt : canonical.fetchedAt,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    dedupeKey: deriveDedupeKey(venueId, startAt, title),
  };

  return result;
}
