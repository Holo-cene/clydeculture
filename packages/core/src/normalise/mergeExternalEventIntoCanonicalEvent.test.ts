import { describe, expect, it } from 'vitest';
import { deriveDedupeKey } from '../dedupe/dedupe.js';
import {
  mergeExternalEventIntoCanonicalEvent,
  type MergeableCanonicalEvent,
} from './normalise.js';

// mergeExternalEventIntoCanonicalEvent is the pure field-by-field merge function
// invoked when a freshly-normalised external event collides (same dedupe_key) with
// an existing canonical event. The contract is `docs/NORMALISATION.md` Step 8's
// field-level merge priority table. Tests below pin that table.
//
// Rules under test (universal):
//   - Better tier (lower number) wins on a field-by-field basis.
//   - Null incoming never overwrites existing non-null.
//   - Same tier: latest `fetchedAt` wins per field.
//   - Worse tier: only availability / availability_note / updated_at may refresh.
//   - `availability = 'rescheduled'` (or a start_at change) forces `needs_review = true`.

const venueId = '11111111-1111-4111-8111-111111111111';
const tier1SourceId = '22222222-2222-4222-8222-222222222221';
const tier2SourceId = '22222222-2222-4222-8222-222222222222';
const tier2SourceIdOther = '22222222-2222-4222-8222-22222222222a';
const tier3SourceId = '22222222-2222-4222-8222-222222222223';

function baseTier2Canonical(): MergeableCanonicalEvent {
  return {
    title: 'Mogwai at Barrowland',
    normalisedTitle: 'mogwai at barrowland',
    summary: null,
    description: null,
    sourceUrl: 'https://www.skiddle.com/whats-on/Glasgow/123',
    ticketUrl: 'https://www.skiddle.com/whats-on/Glasgow/123/buy',
    ticketUrlLabel: 'Buy from Skiddle',
    imageUrl: 'https://images.skiddle.com/123.jpg',
    startAt: '2026-07-15T20:00:00.000Z',
    endAt: null,
    doorsAt: null,
    timezone: 'Europe/London',
    timeTba: false,
    availability: 'on_sale',
    availabilityNote: null,
    eventTypeSlug: 'live_music',
    venueId,
    primarySourceId: tier2SourceId,
    sourceTier: 2,
    fetchedAt: '2026-06-01T10:00:00.000Z',
    needsReview: false,
  };
}

describe('mergeExternalEventIntoCanonicalEvent', () => {
  describe('better-tier source wins', () => {
    it('overwrites title when incoming is Tier 1 and canonical is Tier 2', () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        title: 'Mogwai — Live at Barrowland',
        normalisedTitle: 'mogwai live at barrowland',
        ticketUrl: 'https://www.ticketmaster.co.uk/event/abc',
        ticketUrlLabel: 'Book on Ticketmaster',
        primarySourceId: tier1SourceId,
        sourceTier: 1,
        fetchedAt: '2026-06-02T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.title).toBe('Mogwai — Live at Barrowland');
      expect(merged.normalisedTitle).toBe('mogwai live at barrowland');
      expect(merged.ticketUrl).toBe('https://www.ticketmaster.co.uk/event/abc');
      expect(merged.ticketUrlLabel).toBe('Book on Ticketmaster');
      expect(merged.primarySourceId).toBe(tier1SourceId);
      expect(merged.sourceTier).toBe(1);
    });

    it('keeps canonical title when incoming is a worse tier', () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        title: 'Worse scraper title',
        normalisedTitle: 'worse scraper title',
        primarySourceId: tier3SourceId,
        sourceTier: 3,
        fetchedAt: '2026-06-05T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.title).toBe(canonical.title);
      expect(merged.normalisedTitle).toBe(canonical.normalisedTitle);
      expect(merged.primarySourceId).toBe(tier2SourceId);
      expect(merged.sourceTier).toBe(2);
    });
  });

  describe('null incoming does not overwrite existing non-null', () => {
    it('keeps the existing ticket_url when incoming ticket_url is null, even from a better tier', () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        ticketUrl: null,
        ticketUrlLabel: null,
        imageUrl: null,
        primarySourceId: tier1SourceId,
        sourceTier: 1,
        fetchedAt: '2026-06-02T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.ticketUrl).toBe(canonical.ticketUrl);
      expect(merged.ticketUrlLabel).toBe(canonical.ticketUrlLabel);
      expect(merged.imageUrl).toBe(canonical.imageUrl);
    });
  });

  describe('rescheduled availability triggers needs_review', () => {
    it("sets needs_review = true and applies 'rescheduled' availability even at same tier", () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        availability: 'rescheduled',
        availabilityNote: 'Rescheduled to August',
        primarySourceId: tier2SourceIdOther,
        sourceTier: 2,
        fetchedAt: '2026-06-10T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.availability).toBe('rescheduled');
      expect(merged.availabilityNote).toBe('Rescheduled to August');
      expect(merged.needsReview).toBe(true);
      expect(merged.reviewReasons).toContain('availability_rescheduled');
    });

    it('still applies a rescheduled availability refresh from a worse-tier source', () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        availability: 'rescheduled',
        availabilityNote: 'New date pending',
        primarySourceId: tier3SourceId,
        sourceTier: 3,
        fetchedAt: '2026-06-10T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.availability).toBe('rescheduled');
      expect(merged.availabilityNote).toBe('New date pending');
      expect(merged.needsReview).toBe(true);
    });
  });

  describe('same-tier tiebreak: latest fetch wins', () => {
    it("prefers the later-fetched record's fields when both sources share a tier", () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        title: 'Mogwai — Updated Show Title',
        normalisedTitle: 'mogwai updated show title',
        ticketUrl: 'https://www.skiddle.com/whats-on/Glasgow/123/buy?v=2',
        ticketUrlLabel: 'Buy from Skiddle',
        primarySourceId: tier2SourceIdOther,
        sourceTier: 2,
        // strictly later than canonical.fetchedAt
        fetchedAt: '2026-06-05T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.title).toBe(incoming.title);
      expect(merged.normalisedTitle).toBe(incoming.normalisedTitle);
      expect(merged.ticketUrl).toBe(incoming.ticketUrl);
    });

    it("keeps the canonical's fields when its fetchedAt is the more recent one", () => {
      const canonical = baseTier2Canonical();
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        title: 'Stale duplicate title',
        normalisedTitle: 'stale duplicate title',
        primarySourceId: tier2SourceIdOther,
        sourceTier: 2,
        // strictly earlier than canonical.fetchedAt
        fetchedAt: '2026-05-15T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.title).toBe(canonical.title);
      expect(merged.normalisedTitle).toBe(canonical.normalisedTitle);
    });
  });

  describe('rescheduled event updates start_at and recomputes dedupe_key', () => {
    it('updates start_at and the dedupe_key when the rescheduled date changes', () => {
      const canonical = baseTier2Canonical();
      const newStartAt = '2026-08-15T20:00:00.000Z';
      const incoming: MergeableCanonicalEvent = {
        ...canonical,
        availability: 'rescheduled',
        availabilityNote: 'Rescheduled to August',
        startAt: newStartAt,
        primarySourceId: tier2SourceIdOther,
        sourceTier: 2,
        fetchedAt: '2026-06-10T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.startAt).toBe(newStartAt);
      expect(merged.availability).toBe('rescheduled');
      expect(merged.needsReview).toBe(true);
      expect(merged.dedupeKey).toBe(deriveDedupeKey(venueId, newStartAt, canonical.title));
      expect(merged.reviewReasons).toContain('start_at_changed');
    });
  });

  describe('multi-source: better-tier values are preserved across same-tier refreshes', () => {
    it('keeps Tier 1 title even when a later Tier 2 refresh arrives', () => {
      // Pretend canonical was already promoted to Tier 1 by an earlier Ticketmaster merge.
      const canonical: MergeableCanonicalEvent = {
        ...baseTier2Canonical(),
        title: 'Mogwai — Live at Barrowland (Ticketmaster)',
        normalisedTitle: 'mogwai live at barrowland ticketmaster',
        primarySourceId: tier1SourceId,
        sourceTier: 1,
        fetchedAt: '2026-06-02T10:00:00.000Z',
      };
      const incoming: MergeableCanonicalEvent = {
        ...baseTier2Canonical(),
        title: 'Mogwai at Barrowland (Skiddle)',
        normalisedTitle: 'mogwai at barrowland skiddle',
        primarySourceId: tier2SourceIdOther,
        sourceTier: 2,
        fetchedAt: '2026-06-10T10:00:00.000Z',
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.title).toBe(canonical.title);
      expect(merged.normalisedTitle).toBe(canonical.normalisedTitle);
      expect(merged.primarySourceId).toBe(tier1SourceId);
      expect(merged.sourceTier).toBe(1);
    });
  });

  describe('OR-merge for needs_review', () => {
    it('preserves an existing needs_review = true even when the incoming record is clean', () => {
      const canonical: MergeableCanonicalEvent = {
        ...baseTier2Canonical(),
        needsReview: true,
      };
      const incoming: MergeableCanonicalEvent = {
        ...baseTier2Canonical(),
        primarySourceId: tier2SourceIdOther,
        fetchedAt: '2026-06-10T10:00:00.000Z',
        needsReview: false,
      };

      const merged = mergeExternalEventIntoCanonicalEvent({
        canonical,
        incoming,
      });

      expect(merged.needsReview).toBe(true);
    });
  });
});
