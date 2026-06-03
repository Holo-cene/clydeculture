export interface RawEvent {
  externalId: string;
  sourceId: string;
  title: string;
  startAt: string;
  endAt?: string;
  venueId?: string;
  rawPayload: Record<string, unknown>;
}

export interface CanonicalEvent {
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  normalisedTitle: string;
  startAt: string;
  endAt?: string;
  venueId?: string;
  confidence: number;
  visibility: 'draft' | 'published' | 'archived';
  dedupeKey?: string;
}
