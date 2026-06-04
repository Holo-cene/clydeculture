import { describe, expect, it } from 'vitest';
import { EventCategory } from './taxonomy.js';

// Canonical event type slugs from the SQL event_types seed data.
// These 13 values are the single source of truth — old broad values such as
// 'music', 'arts', 'community', 'food', 'talk', 'festival' must not remain
// as canonical event type slugs.
const SQL_EVENT_TYPE_SLUGS = new Set([
  'live_music',
  'club_night',
  'comedy',
  'theatre',
  'arts_exhibition',
  'workshop',
  'talk_lecture',
  'film',
  'family',
  'sport',
  'community_meetup',
  'food_drink',
  'other',
]);

describe('EventCategory taxonomy alignment with SQL event_types slugs', () => {
  it('has exactly the 13 canonical SQL event_types slugs as values — no more, no fewer', () => {
    const actualValues = new Set(Object.values(EventCategory));
    expect(actualValues).toEqual(SQL_EVENT_TYPE_SLUGS);
  });
});
