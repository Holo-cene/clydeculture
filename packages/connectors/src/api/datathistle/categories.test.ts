import { describe, it, expect } from 'vitest';
import {
  mapDataThistleTags,
  type DataThistleCategoryMapping,
} from './categories.js';

describe('mapDataThistleTags', () => {
  describe('maps one representative tag per category', () => {
    it.each([
      ['gigs', 'live_music'],
      ['clubbing', 'club_night'],
      ['comedy', 'comedy'],
      ['drama', 'theatre'],
      ['exhibitions', 'arts_exhibition'],
      ['classes', 'workshop'],
      ['lectures', 'talk_lecture'],
      ['cinema', 'film'],
      ['children', 'family'],
      ['running', 'sport'],
      ['local groups', 'community_meetup'],
      ['markets', 'food_drink'],
    ])('%s -> %s', (tag, expectedSlug) => {
      const result = mapDataThistleTags([tag]);
      expect(result.eventTypeSlug).toBe(expectedSlug);
      expect(result.mappingSource).toBe('datathistle-tag-map');
      expect(result.matchedTag).toBe(tag);
      expect(result.sourceTags).toEqual([tag]);
    });
  });

  it('matches case-insensitively and trims whitespace while preserving original source text', () => {
    const result = mapDataThistleTags(['  Comedy ']);
    expect(result.eventTypeSlug).toBe('comedy');
    expect(result.mappingSource).toBe('datathistle-tag-map');
    expect(result.sourceTags).toEqual(['  Comedy ']);
  });

  it('returns the original source text for matchedTag, not a normalised form', () => {
    const result = mapDataThistleTags(['Stand-Up']);
    expect(result.eventTypeSlug).toBe('comedy');
    expect(result.matchedTag).toBe('Stand-Up');
  });

  describe('priority determinism', () => {
    it('resolves [food, music] to live_music because live_music outranks food_drink', () => {
      const result = mapDataThistleTags(['food', 'music']);
      expect(result.eventTypeSlug).toBe('live_music');
      expect(result.matchedTag).toBe('music');
    });

    it('returns the same result on repeated calls', () => {
      const first = mapDataThistleTags(['food', 'music']);
      const second = mapDataThistleTags(['food', 'music']);
      const third = mapDataThistleTags(['food', 'music']);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });
  });

  describe('opera ambiguity rule', () => {
    it('maps opera alone to live_music', () => {
      const result = mapDataThistleTags(['opera']);
      expect(result.eventTypeSlug).toBe('live_music');
      expect(result.mappingSource).toBe('datathistle-tag-map');
      expect(result.matchedTag).toBe('opera');
    });

    it('maps opera with theatre-ish tags to theatre', () => {
      const result = mapDataThistleTags(['opera', 'musicals']);
      expect(result.eventTypeSlug).toBe('theatre');
      expect(result.mappingSource).toBe('datathistle-tag-map');
    });

    it('maps opera with a stage tag to theatre', () => {
      const result = mapDataThistleTags(['opera', 'stage']);
      expect(result.eventTypeSlug).toBe('theatre');
      expect(result.mappingSource).toBe('datathistle-tag-map');
    });
  });

  describe('fallback behaviour', () => {
    it('returns fallback with no eventTypeSlug for unknown tags', () => {
      const result = mapDataThistleTags(['shopping', 'fairs']);
      expect(result.mappingSource).toBe('fallback');
      expect(result.eventTypeSlug).toBeUndefined();
      expect(result.matchedTag).toBeUndefined();
      expect(result.sourceTags).toEqual(['shopping', 'fairs']);
    });

    it('returns fallback for an empty array', () => {
      const result = mapDataThistleTags([]);
      expect(result.mappingSource).toBe('fallback');
      expect(result.eventTypeSlug).toBeUndefined();
      expect(result.sourceTags).toEqual([]);
    });

    it('ignores empty and whitespace-only tags', () => {
      const result = mapDataThistleTags(['', '   ']);
      expect(result.mappingSource).toBe('fallback');
      expect(result.eventTypeSlug).toBeUndefined();
      expect(result.sourceTags).toEqual([]);
    });
  });

  it('deduplicates sourceTags case-insensitively, preserving the first occurrence', () => {
    const result = mapDataThistleTags(['Music', 'music', ' MUSIC ', 'jazz']);
    expect(result.sourceTags).toEqual(['Music', 'jazz']);
    expect(result.matchedTag).toBe('Music');
  });

  it('sets mappingSource to datathistle-tag-map on any successful match', () => {
    const matched: DataThistleCategoryMapping = mapDataThistleTags(['film']);
    expect(matched.mappingSource).toBe('datathistle-tag-map');
  });

  describe('compatibility with parse.ts mapTagsToEventType', () => {
    // Every tag the existing private parse.ts helper maps must map to the same
    // slug here, so the later integration step cannot change behaviour.
    const legacyMap: ReadonlyArray<[string, string]> = [
      ...(['music', 'gigs', 'concerts', 'classical', 'jazz', 'folk'] as const).map(
        (tag): [string, string] => [tag, 'live_music']
      ),
      ...(['club', 'clubs', 'clubbing', 'dj', 'dance music', 'nightlife'] as const).map(
        (tag): [string, string] => [tag, 'club_night']
      ),
      ...(['comedy', 'stand-up', 'standup'] as const).map(
        (tag): [string, string] => [tag, 'comedy']
      ),
      ...(['theatre', 'drama', 'musicals', 'performance'] as const).map(
        (tag): [string, string] => [tag, 'theatre']
      ),
      ...(['art', 'visual art', 'exhibitions', 'galleries', 'museums'] as const).map(
        (tag): [string, string] => [tag, 'arts_exhibition']
      ),
      ...(['workshop', 'workshops', 'classes', 'courses', 'learning'] as const).map(
        (tag): [string, string] => [tag, 'workshop']
      ),
      ...(['talk', 'talks', 'lectures', 'books', 'literature', 'spoken word'] as const).map(
        (tag): [string, string] => [tag, 'talk_lecture']
      ),
      ...(['film', 'cinema', 'screenings', 'event cinema'] as const).map(
        (tag): [string, string] => [tag, 'film']
      ),
      ...(['family', 'children', 'kids'] as const).map(
        (tag): [string, string] => [tag, 'family']
      ),
      ...(['sport', 'running', 'cycling'] as const).map(
        (tag): [string, string] => [tag, 'sport']
      ),
      ...(['community', 'local groups', 'social events'] as const).map(
        (tag): [string, string] => [tag, 'community_meetup']
      ),
      ...(['food', 'drink', 'markets', 'tasting', 'beer', 'wine'] as const).map(
        (tag): [string, string] => [tag, 'food_drink']
      ),
    ];

    it.each(legacyMap)('legacy tag %s -> %s', (tag, expectedSlug) => {
      expect(mapDataThistleTags([tag]).eventTypeSlug).toBe(expectedSlug);
    });
  });

  describe('extended SPEC.md section 12 coverage', () => {
    it.each([
      ['gig', 'live_music'],
      ['concert', 'live_music'],
      ['classical music', 'live_music'],
      ['live music', 'live_music'],
      ['djs', 'club_night'],
      ['club night', 'club_night'],
      ['stand up', 'comedy'],
      ['theater', 'theatre'],
      ['musical', 'theatre'],
      ['plays', 'theatre'],
      ['dance', 'theatre'],
      ['cabaret', 'theatre'],
      ['circus', 'theatre'],
      ['exhibition', 'arts_exhibition'],
      ['gallery', 'arts_exhibition'],
      ['museum', 'arts_exhibition'],
      ['class', 'workshop'],
      ['course', 'workshop'],
      ['craft', 'workshop'],
      ['lecture', 'talk_lecture'],
      ['poetry', 'talk_lecture'],
      ['author event', 'talk_lecture'],
      ['films', 'film'],
      ['screening', 'film'],
      ['movie', 'film'],
      ['movies', 'film'],
      ["children's", 'family'],
      ['schools', 'family'],
      ['sports', 'sport'],
      ['swimming', 'sport'],
      ['football', 'sport'],
      ['fitness', 'sport'],
      ['social', 'community_meetup'],
      ['meetup', 'community_meetup'],
      ['heritage', 'community_meetup'],
      ['food and drink', 'food_drink'],
      ['market', 'food_drink'],
      ['street food', 'food_drink'],
    ])('%s -> %s', (tag, expectedSlug) => {
      expect(mapDataThistleTags([tag]).eventTypeSlug).toBe(expectedSlug);
    });
  });
});
