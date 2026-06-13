import { describe, expect, it } from 'vitest';
import {
  calculateTrust,
  calculateCompleteness,
  isEligibleForPublic,
  DEFAULT_TRUST_BAR,
  DEFAULT_COMPLETENESS_BAR,
  type TrustInput,
  type CompletenessInput,
} from './normalise.js';

// ADR 0006: confidence is split into two signals.
//   trust        — "is this event real?"   (drives the trust bar)
//   completeness — "is it complete enough to display?" (minimum viable public event)
// The public gate is `trust >= T AND completeness >= C` — never a single threshold.
// These tests pin the contract so that hard rule #7 ("a free zine fair sits at the same
// visual and editorial weight as a ticketed opera") cannot regress.

const venueId = '11111111-1111-4111-8111-111111111111';

function tierOneTrustInput(): TrustInput {
  return {
    sourceTier: 1,
    title: 'Mogwai Live at Barrowland',
    corroborated: false,
  };
}

function mvpCompletenessInput(): CompletenessInput {
  return {
    title: 'Mogwai Live at Barrowland',
    startAt: '2026-07-15T20:00:00.000Z',
    timeTba: false,
    sourceUrl: 'https://www.ticketmaster.co.uk/event/abc',
    venue: { id: venueId, autoCreated: false },
    isOnline: false,
    locationTba: false,
  };
}

describe('calculateTrust', () => {
  it('places a Tier 1 source above the default trust bar without corroboration', () => {
    const result = calculateTrust(tierOneTrustInput());

    expect(result.score).toBeGreaterThanOrEqual(DEFAULT_TRUST_BAR);
    expect(result.inputs.tier).toBe(1);
    expect(result.inputs.tier_base).toBeGreaterThan(0);
    expect(result.inputs.corroborated).toBe(false);
  });

  it('scores Tier 1 > Tier 2 > Tier 3 > Tier 4 on a like-for-like input', () => {
    const t1 = calculateTrust({ ...tierOneTrustInput(), sourceTier: 1 }).score;
    const t2 = calculateTrust({ ...tierOneTrustInput(), sourceTier: 2 }).score;
    const t3 = calculateTrust({ ...tierOneTrustInput(), sourceTier: 3 }).score;
    const t4 = calculateTrust({ ...tierOneTrustInput(), sourceTier: 4 }).score;

    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(t3);
    expect(t3).toBeGreaterThan(t4);
  });

  it('raises a Tier 3 grassroots scrape above the trust bar when corroborated', () => {
    const uncorroborated = calculateTrust({ ...tierOneTrustInput(), sourceTier: 3, corroborated: false });
    const corroborated = calculateTrust({ ...tierOneTrustInput(), sourceTier: 3, corroborated: true });

    expect(corroborated.score).toBeGreaterThan(uncorroborated.score);
    expect(corroborated.score).toBeGreaterThanOrEqual(DEFAULT_TRUST_BAR);
    expect(corroborated.inputs.corroborated).toBe(true);
  });

  it('does NOT reward completeness fields — venue resolution and ticket URLs are irrelevant to trust', () => {
    // Two Tier-3 DIY events: one fully described, one minimal. Trust must be identical.
    const richTrust = calculateTrust({ sourceTier: 3, title: 'DIY Show at Mono', corroborated: false });
    const sparseTrust = calculateTrust({ sourceTier: 3, title: 'DIY Show at Mono', corroborated: false });

    expect(richTrust.score).toBe(sparseTrust.score);
  });

  it('caps the score at 100', () => {
    const maxed = calculateTrust({ sourceTier: 1, title: 'Mogwai Live', corroborated: true });

    expect(maxed.score).toBeLessThanOrEqual(100);
  });

  it('returns 0 when the title is shorter than 3 characters (extraction failure)', () => {
    const result = calculateTrust({ sourceTier: 1, title: 'X', corroborated: true });

    expect(result.score).toBe(0);
    expect(result.inputs.title_too_short).toBe(true);
  });
});

describe('calculateCompleteness', () => {
  it('clears the minimum-viable bar when title, start, link, and a location signal are present', () => {
    const result = calculateCompleteness(mvpCompletenessInput());

    expect(result.score).toBeGreaterThanOrEqual(DEFAULT_COMPLETENESS_BAR);
    expect(result.meetsMinimum).toBe(true);
    expect(result.inputs.has_title).toBe(true);
    expect(result.inputs.has_start_signal).toBe(true);
    expect(result.inputs.has_link).toBe(true);
    expect(result.inputs.has_location_signal).toBe(true);
  });

  it('accepts an auto-created venue stub as a location signal (hard rule #7)', () => {
    // A grassroots gig at a new venue: venue.id is set but auto_created = true.
    // This MUST NOT suppress publication — auto-created venues are still a location.
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      venue: { id: venueId, autoCreated: true },
    });

    expect(result.meetsMinimum).toBe(true);
    expect(result.inputs.has_location_signal).toBe(true);
  });

  it('accepts an online event with no venue as a location signal', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      venue: null,
      isOnline: true,
    });

    expect(result.meetsMinimum).toBe(true);
    expect(result.inputs.has_location_signal).toBe(true);
  });

  it('accepts an explicit "location TBA" event with no venue as a location signal', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      venue: null,
      locationTba: true,
    });

    expect(result.meetsMinimum).toBe(true);
    expect(result.inputs.has_location_signal).toBe(true);
  });

  it('accepts a TBA start time as a start signal (date-only / TBA event)', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      timeTba: true,
    });

    expect(result.meetsMinimum).toBe(true);
    expect(result.inputs.has_start_signal).toBe(true);
  });

  it('does NOT require a ticket URL, image, classified type, or resolved venue (ADR 0006)', () => {
    // A real DIY event with: no ticket URL, no image, fallback type, auto-created venue.
    // It still has the MVP fields and must clear the completeness bar.
    const result = calculateCompleteness({
      title: 'Free zine fair at Mono',
      startAt: '2026-07-15T14:00:00.000Z',
      timeTba: false,
      sourceUrl: 'https://example.com/event/zine-fair',
      venue: { id: venueId, autoCreated: true },
      isOnline: false,
      locationTba: false,
    });

    expect(result.meetsMinimum).toBe(true);
  });

  it('fails minimum-viable when the link is missing', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      sourceUrl: null,
    });

    expect(result.meetsMinimum).toBe(false);
    expect(result.inputs.has_link).toBe(false);
    expect(result.score).toBeLessThan(DEFAULT_COMPLETENESS_BAR);
  });

  it('fails minimum-viable when there is no location signal at all', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      venue: null,
      isOnline: false,
      locationTba: false,
    });

    expect(result.meetsMinimum).toBe(false);
    expect(result.inputs.has_location_signal).toBe(false);
  });

  it('fails minimum-viable when the title is shorter than 3 characters', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      title: 'X',
    });

    expect(result.meetsMinimum).toBe(false);
    expect(result.inputs.has_title).toBe(false);
  });

  it('fails minimum-viable when the start signal is missing entirely', () => {
    const result = calculateCompleteness({
      ...mvpCompletenessInput(),
      startAt: null,
      timeTba: false,
    });

    expect(result.meetsMinimum).toBe(false);
    expect(result.inputs.has_start_signal).toBe(false);
  });

  it('records bonus richness inputs even though they do not affect the gate', () => {
    const sparse = calculateCompleteness(mvpCompletenessInput());
    const rich = calculateCompleteness({
      ...mvpCompletenessInput(),
      ticketUrl: 'https://www.ticketmaster.co.uk/event/abc',
      hasImage: true,
      typeClassified: true,
      venue: { id: venueId, autoCreated: false },
    });

    // Both clear the bar identically — bonus inputs are informational only.
    expect(sparse.meetsMinimum).toBe(true);
    expect(rich.meetsMinimum).toBe(true);
    // But bonus information IS captured in inputs for analytics.
    expect(rich.inputs.has_ticket_url).toBe(true);
    expect(rich.inputs.has_image).toBe(true);
    expect(rich.inputs.type_classified).toBe(true);
    expect(rich.inputs.venue_resolved).toBe(true);
  });
});

describe('isEligibleForPublic', () => {
  it('returns true when trust and completeness both clear their bars', () => {
    expect(
      isEligibleForPublic({
        trust: DEFAULT_TRUST_BAR,
        completeness: DEFAULT_COMPLETENESS_BAR,
      }),
    ).toBe(true);
  });

  it('returns false when trust is below the bar — even if completeness is perfect', () => {
    expect(
      isEligibleForPublic({
        trust: DEFAULT_TRUST_BAR - 1,
        completeness: DEFAULT_COMPLETENESS_BAR,
      }),
    ).toBe(false);
  });

  it('returns false when completeness is below the bar — even if trust is high', () => {
    expect(
      isEligibleForPublic({
        trust: 100,
        completeness: DEFAULT_COMPLETENESS_BAR - 1,
      }),
    ).toBe(false);
  });

  it('publishes a real grassroots DIY gig at an auto-created venue (regression for hard rule #7)', () => {
    // Worked example from ADR 0006: Tier-3 scrape, start time, URL, sensible title,
    // newly auto-created venue, fallback category. The single-score gate hid it at 50.
    // The split gate MUST publish it: it is real and minimum-viable.
    const trust = calculateTrust({ sourceTier: 3, title: 'Free zine fair', corroborated: false });
    const completeness = calculateCompleteness({
      title: 'Free zine fair at Mono',
      startAt: '2026-07-15T14:00:00.000Z',
      timeTba: false,
      sourceUrl: 'https://example.com/event/zine-fair',
      venue: { id: venueId, autoCreated: true },
      isOnline: false,
      locationTba: false,
      // No ticket URL, no image, type fell back to 'other'.
    });

    expect(
      isEligibleForPublic({ trust: trust.score, completeness: completeness.score }),
    ).toBe(true);
  });

  it('allows overriding the bars per call for per-source threshold experiments', () => {
    // Stricter trust bar (e.g. for an experimental source class)
    expect(
      isEligibleForPublic({
        trust: 50,
        completeness: 100,
        trustBar: 70,
        completenessBar: 100,
      }),
    ).toBe(false);

    // Relaxed completeness bar (e.g. partner source with allowance for sparse listings)
    expect(
      isEligibleForPublic({
        trust: 100,
        completeness: 75,
        trustBar: 40,
        completenessBar: 75,
      }),
    ).toBe(true);
  });
});
