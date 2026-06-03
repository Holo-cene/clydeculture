import { describe, expect, it } from 'vitest';
import { deriveDedupeKey } from './dedupe.js';

// deriveDedupeKey must produce identical output to the SQL compute_dedupe_key() function:
//
//   SHA-256(
//     COALESCE(venue_id::text, 'no-venue')
//     || '|'
//     || TO_CHAR(DATE_TRUNC('hour', start_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD-HH24')
//     || '|'
//     || normalise_title(title)
//   )
//
// Correctness here is critical: a mismatch between TS and SQL causes cross-source
// dedup to silently fail (two records for the same event, different keys).

describe('deriveDedupeKey', () => {
  describe('output format', () => {
    it('returns a 64-character lowercase hex string (SHA-256)', () => {
      const key = deriveDedupeKey('venue-uuid', '2026-07-15T20:00:00Z', 'A Show');
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — identical inputs always produce the same key', () => {
      const a = deriveDedupeKey('venue-uuid', '2026-07-15T20:00:00Z', 'A Show');
      const b = deriveDedupeKey('venue-uuid', '2026-07-15T20:00:00Z', 'A Show');
      expect(a).toBe(b);
    });
  });

  describe('UTC hour truncation', () => {
    it('truncates start time to the UTC hour — minutes within the hour do not change the key', () => {
      const onTheHour = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show');
      const thirtyPast = deriveDedupeKey('v', '2026-07-15T20:30:00Z', 'Show');
      const fiftyNine = deriveDedupeKey('v', '2026-07-15T20:59:59Z', 'Show');
      expect(onTheHour).toBe(thirtyPast);
      expect(onTheHour).toBe(fiftyNine);
    });

    it('different UTC hours produce different keys', () => {
      const hour20 = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show');
      const hour21 = deriveDedupeKey('v', '2026-07-15T21:00:00Z', 'Show');
      expect(hour20).not.toBe(hour21);
    });

    it('BST (+01:00) offset is converted to UTC — 21:00 BST === 20:00 UTC', () => {
      // This is the critical cross-source dedup case: a Ticketmaster record stored as BST
      // and an HTML-scraped record stored as UTC must resolve to the same dedupe key.
      const bst = deriveDedupeKey('v', '2026-07-15T21:00:00+01:00', 'Show');
      const utc = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show');
      expect(bst).toBe(utc);
    });

    it('23:00 BST is bucketed as hour 22 UTC, not hour 23', () => {
      const bst = deriveDedupeKey('v', '2026-07-15T23:00:00+01:00', 'Show');
      const utc22 = deriveDedupeKey('v', '2026-07-15T22:00:00Z', 'Show');
      const utc23 = deriveDedupeKey('v', '2026-07-15T23:00:00Z', 'Show');
      expect(bst).toBe(utc22);
      expect(bst).not.toBe(utc23);
    });
  });

  describe('null venue fallback', () => {
    it("uses the literal string 'no-venue' when venueId is null", () => {
      const withNull = deriveDedupeKey(null, '2026-07-15T20:00:00Z', 'Show');
      const withNoVenueString = deriveDedupeKey('no-venue', '2026-07-15T20:00:00Z', 'Show');
      // The null case must hash 'no-venue' — same as passing the string explicitly
      expect(withNull).toBe(withNoVenueString);
    });

    it('null and a real venueId produce different keys', () => {
      const withNull = deriveDedupeKey(null, '2026-07-15T20:00:00Z', 'Show');
      const withId = deriveDedupeKey('real-venue-id', '2026-07-15T20:00:00Z', 'Show');
      expect(withNull).not.toBe(withId);
    });
  });

  describe('title normalisation', () => {
    it('normalises the title before hashing — case insensitive', () => {
      const upper = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'LIVE AT SWG3');
      const lower = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'live at swg3');
      expect(upper).toBe(lower);
    });

    it('strips punctuation before hashing', () => {
      // 'Live @ SWG3' normalises to 'live swg3' — same key as the clean version
      const withPunctuation = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Live @ SWG3');
      const clean = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'live swg3');
      expect(withPunctuation).toBe(clean);
    });

    it('different normalised titles produce different keys', () => {
      const showA = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show A');
      const showB = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show B');
      expect(showA).not.toBe(showB);
    });
  });

  describe('component independence', () => {
    it('different venues produce different keys (all else equal)', () => {
      const a = deriveDedupeKey('venue-a', '2026-07-15T20:00:00Z', 'Show');
      const b = deriveDedupeKey('venue-b', '2026-07-15T20:00:00Z', 'Show');
      expect(a).not.toBe(b);
    });

    it('different days produce different keys (all else equal)', () => {
      const day1 = deriveDedupeKey('v', '2026-07-15T20:00:00Z', 'Show');
      const day2 = deriveDedupeKey('v', '2026-07-16T20:00:00Z', 'Show');
      expect(day1).not.toBe(day2);
    });
  });
});
