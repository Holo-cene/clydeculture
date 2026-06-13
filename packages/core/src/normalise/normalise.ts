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

export interface TrustInput {
  sourceTier: SourceTier;
  title: string;
  corroborated?: boolean;
}

export interface TrustInputs {
  tier: SourceTier;
  tier_base: number;
  corroborated: boolean;
  title_too_short: boolean;
  total: number;
}

export interface TrustResult {
  score: number;
  inputs: TrustInputs;
}

export interface CompletenessInput {
  title: string;
  startAt?: string | null;
  timeTba?: boolean;
  sourceUrl?: string | null;
  ticketUrl?: string | null;
  venue?: { id: string; autoCreated?: boolean } | null;
  isOnline?: boolean;
  locationTba?: boolean;
  hasImage?: boolean;
  typeClassified?: boolean;
}

export interface CompletenessInputs {
  has_title: boolean;
  has_start_signal: boolean;
  has_link: boolean;
  has_location_signal: boolean;
  has_ticket_url: boolean;
  has_image: boolean;
  type_classified: boolean;
  venue_resolved: boolean;
  total: number;
}

export interface CompletenessResult {
  score: number;
  meetsMinimum: boolean;
  inputs: CompletenessInputs;
}

// ADR 0006: trust/completeness bars. T1/T2/T3 sources clear the trust bar by tier alone;
// T4 (enrichment/manual) must be corroborated. The completeness bar enforces the
// Minimum Viable Public Event — title, start signal, link, and a location signal.
export const DEFAULT_TRUST_BAR = 40;
export const DEFAULT_COMPLETENESS_BAR = 100;

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

// ADR 0006: trust signal — "is this event real?". Driven by source tier and
// cross-source corroboration. MUST NOT reward presentation fields (ticket URL,
// image, resolved venue) — those belong on completeness.
export function calculateTrust(input: TrustInput): TrustResult {
  const tierBaseByTier: Record<SourceTier, number> = {
    1: 70,
    2: 55,
    3: 40,
    4: 25,
  };
  const tierBase = tierBaseByTier[input.sourceTier];
  const corroborated = input.corroborated === true;
  const titleTooShort = input.title.trim().length < 3;

  let score = tierBase;
  if (corroborated) score += 20;
  if (score > 100) score = 100;
  if (titleTooShort) score = 0;

  return {
    score,
    inputs: {
      tier: input.sourceTier,
      tier_base: tierBase,
      corroborated,
      title_too_short: titleTooShort,
      total: score,
    },
  };
}

// ADR 0006: completeness signal — "is it complete enough to display?". The
// Minimum Viable Public Event requires: title, start signal (or explicit TBA),
// a link, and a location signal (a venue, online, or explicit "location TBA").
// Lacking a ticket URL, image, classified type, or resolved venue MUST NOT
// suppress publication (hard rule #7).
export function calculateCompleteness(input: CompletenessInput): CompletenessResult {
  const hasTitle = input.title.trim().length >= 3;
  const hasStartSignal = Boolean(input.startAt) || input.timeTba === true;
  const hasLink = Boolean(input.sourceUrl?.trim());
  const hasLocationSignal =
    Boolean(input.venue?.id) || input.isOnline === true || input.locationTba === true;

  const hasTicketUrl = Boolean(input.ticketUrl?.trim());
  const hasImage = input.hasImage === true;
  const typeClassified = input.typeClassified === true;
  const venueResolved = Boolean(input.venue?.id) && input.venue?.autoCreated !== true;

  let score = 0;
  if (hasTitle) score += 25;
  if (hasStartSignal) score += 25;
  if (hasLink) score += 25;
  if (hasLocationSignal) score += 25;

  const meetsMinimum =
    hasTitle && hasStartSignal && hasLink && hasLocationSignal;

  return {
    score,
    meetsMinimum,
    inputs: {
      has_title: hasTitle,
      has_start_signal: hasStartSignal,
      has_link: hasLink,
      has_location_signal: hasLocationSignal,
      has_ticket_url: hasTicketUrl,
      has_image: hasImage,
      type_classified: typeClassified,
      venue_resolved: venueResolved,
      total: score,
    },
  };
}

// ADR 0006: public-display gate. Replaces the single `confidence >= 60` check.
// Both bars must be cleared independently — a high-trust event without the MVP
// fields is not eligible; a complete event from an untrusted source is not eligible.
export function isEligibleForPublic(input: {
  trust: number;
  completeness: number;
  trustBar?: number;
  completenessBar?: number;
}): boolean {
  const trustBar = input.trustBar ?? DEFAULT_TRUST_BAR;
  const completenessBar = input.completenessBar ?? DEFAULT_COMPLETENESS_BAR;
  return input.trust >= trustBar && input.completeness >= completenessBar;
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
