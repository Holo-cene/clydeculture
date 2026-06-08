import { describe, expect, it } from 'vitest';
import { deriveDedupeKey } from '../dedupe/dedupe.js';
import * as normaliseModule from './normalise.js';

type SourceTier = 1 | 2 | 3 | 4;
type TypeSource = 'map' | 'keyword' | 'fallback';

interface SourceCategoryMapping {
  sourceSlug: string;
  sourceCategory: string;
  eventTypeSlug: string;
}

interface EventTypeResolution {
  eventTypeSlug: string;
  typeSource: TypeSource;
  needsReview: boolean;
}

interface ConfidenceInput {
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

interface ConfidenceResult {
  score: number;
  needsReview: boolean;
  reviewReasons: string[];
  inputs: {
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
  };
}

interface ExternalEventDraft {
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

interface CanonicalEventDraft {
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
  confidenceInputs: ConfidenceResult['inputs'];
  visibility: 'draft';
  needsReview: boolean;
  dedupeKey: string;
}

interface NormaliseApi {
  mapSourceCategoryToEventType(input: {
    sourceSlug: string;
    sourceCategory?: string | null;
    mappings: SourceCategoryMapping[];
  }): EventTypeResolution;
  calculateConfidence(input: ConfidenceInput): ConfidenceResult;
  normaliseImageUrl(input?: string | null): string | null;
  buildCanonicalEventDraft(input: {
    externalEvent: ExternalEventDraft;
    sourceCategoryMappings: SourceCategoryMapping[];
    timezone?: string;
    corroborated?: boolean;
  }): CanonicalEventDraft;
}

const normaliseApi = normaliseModule as unknown as NormaliseApi;

const ticketmasterMappings: SourceCategoryMapping[] = [
  {
    sourceSlug: 'ticketmaster',
    sourceCategory: 'kzfzniwnsyzfz7v7nj',
    eventTypeSlug: 'live_music',
  },
];

const venueId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';

function completeTierOneConfidenceInput(): ConfidenceInput {
  return {
    sourceTier: 1,
    title: 'Mogwai Live at Barrowland',
    startAt: '2026-07-15T20:00:00.000Z',
    sourceUrl: 'https://www.ticketmaster.co.uk/event/abc',
    venue: { id: venueId },
    eventTypeSlug: 'live_music',
    typeSource: 'map',
  };
}

describe('mapSourceCategoryToEventType', () => {
  it('maps the corrected Ticketmaster Music segment ID to live_music', () => {
    expect(
      normaliseApi.mapSourceCategoryToEventType({
        sourceSlug: 'ticketmaster',
        sourceCategory: ' KZFzniwnSyZfZ7v7nJ ',
        mappings: ticketmasterMappings,
      }),
    ).toEqual({
      eventTypeSlug: 'live_music',
      typeSource: 'map',
      needsReview: false,
    });
  });

  it('falls back to other and marks review when no source-category mapping exists', () => {
    expect(
      normaliseApi.mapSourceCategoryToEventType({
        sourceSlug: 'ticketmaster',
        sourceCategory: 'unknown-segment',
        mappings: ticketmasterMappings,
      }),
    ).toEqual({
      eventTypeSlug: 'other',
      typeSource: 'fallback',
      needsReview: true,
    });
  });
});

describe('calculateConfidence', () => {
  it('scores a complete Tier 1 Ticketmaster event above the publish threshold and records inputs', () => {
    const result = normaliseApi.calculateConfidence(completeTierOneConfidenceInput());

    expect(result.score).toBe(90);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.needsReview).toBe(false);
    expect(result.reviewReasons).toEqual([]);
    expect(result.inputs).toEqual({
      tier: 1,
      base_score: 50,
      has_start_at: true,
      venue_resolved: true,
      type_classified: true,
      type_source: 'map',
      title_quality: true,
      has_url: true,
      corroborated: false,
      total: 90,
    });
  });

  it('reduces confidence and marks review when the venue is missing', () => {
    const complete = normaliseApi.calculateConfidence(completeTierOneConfidenceInput());
    const missingVenue = normaliseApi.calculateConfidence({
      ...completeTierOneConfidenceInput(),
      venue: null,
    });

    expect(missingVenue.score).toBe(complete.score - 10);
    expect(missingVenue.inputs.venue_resolved).toBe(false);
    expect(missingVenue.needsReview).toBe(true);
    expect(missingVenue.reviewReasons).toContain('venue_unresolved');
  });

  it('reduces confidence and marks review when event type falls back to other', () => {
    const complete = normaliseApi.calculateConfidence(completeTierOneConfidenceInput());
    const fallbackType = normaliseApi.calculateConfidence({
      ...completeTierOneConfidenceInput(),
      eventTypeSlug: 'other',
      typeSource: 'fallback',
    });

    expect(fallbackType.score).toBe(complete.score - 10);
    expect(fallbackType.inputs.type_classified).toBe(false);
    expect(fallbackType.inputs.type_source).toBe('fallback');
    expect(fallbackType.needsReview).toBe(true);
    expect(fallbackType.reviewReasons).toContain('event_type_fallback');
  });
});

describe('normaliseImageUrl', () => {
  it('keeps trimmed absolute HTTPS image URLs', () => {
    expect(normaliseApi.normaliseImageUrl(' https://s1.ticketm.net/dam/a/image.jpg ')).toBe(
      'https://s1.ticketm.net/dam/a/image.jpg',
    );
  });

  it.each([
    ['non-HTTPS URL', 'http://s1.ticketm.net/dam/a/image.jpg'],
    ['empty string', ''],
    ['placeholder N/A', 'N/A'],
    ['placeholder undefined', 'undefined'],
    ['bare HTTPS prefix', 'https://'],
  ])('rejects %s', (_label, input) => {
    expect(normaliseApi.normaliseImageUrl(input)).toBeNull();
  });
});

describe('buildCanonicalEventDraft', () => {
  it('builds the minimal canonical draft without copied descriptions and with the UTC dedupe key', () => {
    const externalEvent: ExternalEventDraft = {
      sourceId,
      sourceSlug: 'ticketmaster',
      sourceTier: 1,
      externalId: 'ticketmaster-event-1',
      externalUrl: 'https://www.ticketmaster.co.uk/event/ticketmaster-event-1',
      title: '  Mogwai: Live at Barrowland!  ',
      startAt: '2026-07-15T20:45:00.000Z',
      venueId,
      eventTypeGuess: 'kzfzniwnsyzfz7v7nj',
      ticketUrlGuess: 'https://www.ticketmaster.co.uk/event/ticketmaster-event-1',
      ticketUrlLabelGuess: 'Buy on Ticketmaster',
      imageUrlGuess: 'https://s1.ticketm.net/dam/a/image.jpg',
      summaryGuess: 'Do not copy this source summary.',
      descriptionGuess: 'Do not copy this source description.',
      raw: {
        info: 'Do not copy the full upstream description either.',
      },
    };

    const canonical = normaliseApi.buildCanonicalEventDraft({
      externalEvent,
      sourceCategoryMappings: ticketmasterMappings,
    });

    expect(canonical).toMatchObject({
      title: 'Mogwai: Live at Barrowland!',
      normalisedTitle: 'mogwai live at barrowland',
      summary: null,
      description: null,
      sourceUrl: externalEvent.externalUrl,
      ticketUrl: externalEvent.ticketUrlGuess,
      ticketUrlLabel: externalEvent.ticketUrlLabelGuess,
      imageUrl: externalEvent.imageUrlGuess,
      startAt: externalEvent.startAt,
      timezone: 'Europe/London',
      timeTba: false,
      eventTypeSlug: 'live_music',
      venueId,
      primarySourceId: sourceId,
      confidence: 90,
      confidenceInputs: {
        tier: 1,
        base_score: 50,
        has_start_at: true,
        venue_resolved: true,
        type_classified: true,
        type_source: 'map',
        title_quality: true,
        has_url: true,
        corroborated: false,
        total: 90,
      },
      visibility: 'draft',
      needsReview: false,
    });
    expect(canonical.dedupeKey).toBe(
      deriveDedupeKey(venueId, externalEvent.startAt, externalEvent.title),
    );
    expect(Object.values(canonical)).not.toContain(externalEvent.summaryGuess);
    expect(Object.values(canonical)).not.toContain(externalEvent.descriptionGuess);
    expect(Object.values(canonical)).not.toContain(externalEvent.raw);
  });
});
