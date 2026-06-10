import { describe, expect, it } from 'vitest';
import { normaliseTitle, normaliseVenueName, mapAvailabilityGuessToCanonical } from './normalise.js';

// normaliseTitle must produce identical output to the SQL normalise_title() function:
//   regexp_replace(lower(input), '[^[:alnum:][:space:]]', '', 'g') → collapse spaces
// The two implementations must agree exactly because deriveDedupeKey uses both
// the TypeScript normaliseTitle and the SQL compute_dedupe_key — cross-source
// deduplication only works if they produce the same string.

describe('normaliseTitle', () => {
  it('lowercases the input', () => {
    expect(normaliseTitle('Live Music')).toBe('live music');
  });

  it('strips non-alphanumeric, non-space characters', () => {
    expect(normaliseTitle('Live @ SWG3')).toBe('live swg3');
    expect(normaliseTitle('Test & Exhibition!')).toBe('test exhibition');
    expect(normaliseTitle("It's Alive")).toBe('its alive');
    expect(normaliseTitle('DJ Set — Optimo')).toBe('dj set optimo');
  });

  it('collapses multiple consecutive spaces to a single space', () => {
    expect(normaliseTitle('  Multiple   Spaces  ')).toBe('multiple spaces');
  });

  it('handles an empty string', () => {
    expect(normaliseTitle('')).toBe('');
  });

  it('handles a string that is only punctuation', () => {
    expect(normaliseTitle('!@#$%')).toBe('');
  });

  it('produces SQL-equivalent output for typical Glasgow event names', () => {
    // Pairs confirmed against the SQL function for dedup regression testing
    expect(normaliseTitle('SWG3 Presents: Soma Records Night')).toBe(
      'swg3 presents soma records night',
    );
    expect(normaliseTitle('Hogmanay Party (18+)')).toBe('hogmanay party 18');
    expect(normaliseTitle('Classical Music — City Halls')).toBe('classical music city halls');
  });

  it('is idempotent — normalising twice gives the same result', () => {
    const once = normaliseTitle('Live @ SWG3!');
    expect(normaliseTitle(once)).toBe(once);
  });
});

describe('mapAvailabilityGuessToCanonical', () => {
  it('maps upstream availability guesses to canonical availability values', () => {
    expect(mapAvailabilityGuessToCanonical('onsale')).toBe('on_sale');
    expect(mapAvailabilityGuessToCanonical('offsale')).toBe('not_on_sale');
    expect(mapAvailabilityGuessToCanonical('cancelled')).toBe('cancelled');
    expect(mapAvailabilityGuessToCanonical('canceled')).toBe('cancelled');
    expect(mapAvailabilityGuessToCanonical('rescheduled')).toBe('rescheduled');
    expect(mapAvailabilityGuessToCanonical('postponed')).toBe('postponed');
    expect(mapAvailabilityGuessToCanonical('soldout')).toBe('sold_out');
    expect(mapAvailabilityGuessToCanonical('sold_out')).toBe('sold_out');
  });

  it('returns undefined for unknown, empty, or absent values', () => {
    expect(mapAvailabilityGuessToCanonical('unknown_value')).toBeUndefined();
    expect(mapAvailabilityGuessToCanonical('')).toBeUndefined();
    expect(mapAvailabilityGuessToCanonical(null)).toBeUndefined();
    expect(mapAvailabilityGuessToCanonical(undefined)).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(mapAvailabilityGuessToCanonical('ONSALE')).toBe('on_sale');
    expect(mapAvailabilityGuessToCanonical('OnSale')).toBe('on_sale');
    expect(mapAvailabilityGuessToCanonical('SOLDOUT')).toBe('sold_out');
  });
});

describe('normaliseVenueName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normaliseVenueName('SWG3 (Glasgow)')).toBe('swg3 glasgow');
  });

  it('strips apostrophes', () => {
    expect(normaliseVenueName("St Luke's")).toBe('st lukes');
    expect(normaliseVenueName("The Flying Duck's Bar")).toBe('the flying ducks bar');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normaliseVenueName('  The Barrowlands  ')).toBe('the barrowlands');
  });

  it('collapses multiple spaces', () => {
    expect(normaliseVenueName('Mono   Bar')).toBe('mono bar');
  });

  it('handles an empty string', () => {
    expect(normaliseVenueName('')).toBe('');
  });

  it('is used for venue alias matching — must be consistent across runs', () => {
    const a = normaliseVenueName('The Barrowland Ballroom');
    const b = normaliseVenueName('The Barrowland Ballroom');
    expect(a).toBe(b);
  });
});
