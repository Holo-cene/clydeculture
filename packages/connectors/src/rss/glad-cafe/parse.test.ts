import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { RawEvent } from '../../connector.js';
import { validateIngestResult } from '../../validate.js';
import { parseGladCafeFeed } from './parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RAW_EVENT_KEYS: ReadonlyArray<keyof RawEvent> = [
  'externalId',
  'externalUrl',
  'title',
  'startAt',
  'endAt',
  'doorsAt',
  'venueName',
  'eventTypeGuess',
  'tagsGuess',
  'priceMinGuess',
  'priceMaxGuess',
  'isFreeGuess',
  'ticketUrlGuess',
  'ticketUrlLabelGuess',
  'imageUrlGuess',
  'availabilityGuess',
  'timeTba',
  'isAllDay',
  'raw',
];

function loadFeed(): string {
  return readFileSync(join(__dirname, 'fixtures', 'feed.xml'), 'utf-8');
}

describe('parseGladCafeFeed', () => {
  it('returns one RawEvent per parseable <item> and counts every <item> as fetched', () => {
    const result = parseGladCafeFeed(loadFeed());

    expect(result.fetchedCount).toBe(4);
    expect(result.items).toHaveLength(3);
  });

  it('emits required RawEvent fields (externalId, externalUrl https, title) for valid items', () => {
    const result = parseGladCafeFeed(loadFeed());

    for (const item of result.items) {
      expect(item.externalId.length).toBeGreaterThan(0);
      expect(item.externalUrl.startsWith('https://')).toBe(true);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('uses <guid> as externalId when present', () => {
    const result = parseGladCafeFeed(loadFeed());
    const jazz = result.items.find(i => i.title === 'Synthetic Jazz Quartet');

    expect(jazz?.externalId).toBe('glad-cafe:evt-0001');
  });

  it('falls back to sha256(link|title) for externalId when <guid> is absent', () => {
    const result = parseGladCafeFeed(loadFeed());
    const openMic = result.items.find(i => i.title === 'Synthetic Open Mic Night');

    const expected = createHash('sha256')
      .update(
        'https://example.test/glad-cafe/events/synthetic-open-mic-night|Synthetic Open Mic Night',
      )
      .digest('hex');
    expect(openMic?.externalId).toBe(expected);
  });

  it('parses RFC-822 <pubDate> as ISO 8601 startAt for Type A items', () => {
    const result = parseGladCafeFeed(loadFeed());
    const jazz = result.items.find(i => i.title === 'Synthetic Jazz Quartet');

    expect(jazz?.startAt).toBe('2026-07-06T18:30:00Z');
  });

  it('emits startAt: undefined when <pubDate> is absent — does not fabricate a date', () => {
    const result = parseGladCafeFeed(loadFeed());
    const spoken = result.items.find(i => i.title === 'Synthetic Spoken Word Evening');

    expect(spoken).toBeDefined();
    expect(spoken?.startAt).toBeUndefined();
    expect((spoken as unknown as Record<string, unknown>)?.startAt).not.toBe('undefined');
  });

  it('records items with no <link> as errors and does not emit them as RawEvents', () => {
    const result = parseGladCafeFeed(loadFeed());

    const titles = result.items.map(i => i.title);
    expect(titles).not.toContain('Synthetic Item Without Link');

    const linkError = result.errors.find(e => /link/i.test(e));
    expect(linkError).toBeDefined();
  });

  it('does not store the source <description> on the RawEvent (link-first rule)', () => {
    const result = parseGladCafeFeed(loadFeed());
    const jazz = result.items.find(i => i.title === 'Synthetic Jazz Quartet');

    expect((jazz as unknown as Record<string, unknown>)).not.toHaveProperty('description');
    expect((jazz as unknown as Record<string, unknown>)).not.toHaveProperty('summary');
  });

  it('emits only recognised RawEvent keys', () => {
    const result = parseGladCafeFeed(loadFeed());

    for (const item of result.items) {
      const unknownKeys = Object.keys(item).filter(
        key => !RAW_EVENT_KEYS.includes(key as keyof RawEvent),
      );
      expect(unknownKeys).toEqual([]);
    }
  });

  it('emitted RawEvents pass connector validation (https URLs, tz offsets on dates)', () => {
    const result = parseGladCafeFeed(loadFeed());
    const validated = validateIngestResult({
      fetchedCount: result.fetchedCount,
      parsedCount: result.items.length,
      items: result.items,
      errors: result.errors,
    });

    const newValidationErrors = validated.errors.slice(result.errors.length);
    expect(newValidationErrors).toEqual([]);
    expect(validated.items).toHaveLength(result.items.length);
  });
});
