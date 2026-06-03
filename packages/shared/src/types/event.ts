/** Mirrors a row in the external_events table — raw connector output stored in the DB. */
export interface ExternalEventRow {
  id?: string;
  sourceId: string;
  externalId: string;
  externalUrl?: string;
  raw: unknown;
  title?: string;
  startAt?: string;
  endAt?: string;
  doorsAt?: string;
  venueName?: string;
  eventTypeGuess?: string;
  tagsGuess?: string[];
  priceMinGuess?: number;
  priceMaxGuess?: number;
  isFreeGuess?: boolean;
  ticketUrlGuess?: string;
  imageUrlGuess?: string;
  availabilityGuess?: string;
  venueIdGuess?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  isDeleted?: boolean;
}

/** Mirrors a row in the events table — the canonical, deduplicated event record. */
export interface CanonicalEvent {
  id?: string;
  title: string;
  normalisedTitle: string;
  slug?: string;
  startAt: string;
  endAt?: string;
  timezone: string;
  eventTypeId?: number;
  venueId?: string;
  festivalId?: string;
  primarySourceId?: string;
  confidence: number;
  confidenceInputs: Record<string, unknown>;
  visibility: 'draft' | 'published' | 'hidden' | 'archived';
  needsReview: boolean;
  dedupeKey: string;
}
