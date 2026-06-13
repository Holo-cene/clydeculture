import { describe, expect, it } from 'vitest';
import { detectFestival, type FestivalRecord, type FestivalEventOverride } from './festivals.js';

// Festival detection contract — see docs/FESTIVALS.md.
//
// The detector takes an event candidate and a list of known festivals (plus any
// manual overrides) and decides:
//   - whether the event is a festival event,
//   - which festival_id to attach,
//   - which detection rule fired,
//   - and whether a window-mismatch alert must be logged (event matched a
//     festival but start_at fell outside its [start_date, end_date] window).
//
// Detection rules (priority order, per FESTIVALS.md):
//   1. Manual override (festival_event_overrides) — highest priority; bypasses
//      automated rules AND the window check. Operators take responsibility.
//   2. Source domain match (festival.match_domains).
//   3. Title contains a known festival term (festival.match_title_terms).
//   4. Source URL contains a known festival slug (festival.match_url_slugs).
//
// Window validation:
//   - Applies to all automated rules (domain, title, url_slug).
//   - Only enforced when BOTH start_date and end_date are set on the festival
//     (schema permits nullable dates for early announcements).
//   - On failure: festival_id is NOT set; the result carries a
//     windowMismatch payload the caller writes to ingest_alerts.

const CELTIC_CONNECTIONS: FestivalRecord = {
  id: 'fest-celtic',
  slug: 'celtic-connections-2027',
  name: 'Celtic Connections',
  startDate: '2027-01-14',
  endDate: '2027-02-04',
  matchDomains: ['celticconnections.com'],
  matchTitleTerms: ['Celtic Connections'],
  matchUrlSlugs: ['/celtic-connections/', '/celtic-connections-2027/'],
};

const GLASGOW_FILM_FESTIVAL: FestivalRecord = {
  id: 'fest-gff',
  slug: 'glasgow-film-festival-2027',
  name: 'Glasgow Film Festival',
  startDate: '2027-02-25',
  endDate: '2027-03-07',
  matchDomains: ['glasgowfilm.org'],
  matchTitleTerms: ['Glasgow Film Festival'],
  matchUrlSlugs: ['/glasgow-film-festival/'],
};

const ANNOUNCED_NO_DATES: FestivalRecord = {
  id: 'fest-tba',
  slug: 'celtic-connections-2028',
  name: 'Celtic Connections',
  startDate: null,
  endDate: null,
  matchDomains: ['celticconnections.com'],
  matchTitleTerms: ['Celtic Connections'],
  matchUrlSlugs: ['/celtic-connections-2028/'],
};

function inputBase() {
  return {
    sourceId: 'src-1',
    externalId: 'ext-1',
    title: 'Some Event',
    startAt: '2027-01-20T20:00:00Z',
    sourceDomain: 'venue-example.com',
    externalUrl: 'https://venue-example.com/event/1',
    festivals: [],
    overrides: [],
  };
}

describe('detectFestival', () => {
  describe('rule 1 — source domain match', () => {
    it('tags the event when the connector domain matches festival.match_domains', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceDomain: 'celticconnections.com',
        title: 'Friday night session',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBe('fest-celtic');
      expect(result.isFestivalEvent).toBe(true);
      expect(result.matchRule).toBe('domain');
      expect(result.windowMismatch).toBeNull();
    });

    it('treats domain matching as case-insensitive', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceDomain: 'CelticConnections.com',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBe('domain');
      expect(result.festivalId).toBe('fest-celtic');
    });

    it('skips lower-priority rules when domain has matched', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceDomain: 'celticconnections.com',
        title: 'Glasgow Film Festival presents Celtic Connections',
        externalUrl: 'https://celticconnections.com/glasgow-film-festival/',
        festivals: [CELTIC_CONNECTIONS, GLASGOW_FILM_FESTIVAL],
      });

      // Domain match on Celtic Connections wins outright; we do not also evaluate
      // title/url-slug for Glasgow Film Festival.
      expect(result.matchRule).toBe('domain');
      expect(result.festivalId).toBe('fest-celtic');
    });
  });

  describe('rule 2 — title term match', () => {
    it('tags the event when the title contains a known festival term (case-insensitive)', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'celtic connections: An evening with Karine Polwart',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBe('title');
      expect(result.festivalId).toBe('fest-celtic');
      expect(result.isFestivalEvent).toBe(true);
    });

    it('uses normaliseTitle so punctuation does not block the match', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Celtic-Connections!! 2027 — Late Night Folk',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBe('title');
      expect(result.festivalId).toBe('fest-celtic');
    });

    it('does not match when the title does not contain any festival term', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Just a regular gig',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBeNull();
      expect(result.festivalId).toBeNull();
    });
  });

  describe('rule 3 — source URL slug match', () => {
    it('tags the event when external_url contains a known festival slug', () => {
      const result = detectFestival({
        ...inputBase(),
        externalUrl: 'https://venue-example.com/events/celtic-connections/123',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBe('url_slug');
      expect(result.festivalId).toBe('fest-celtic');
    });

    it('does not match when neither domain, title, nor url contain festival signals', () => {
      const result = detectFestival({
        ...inputBase(),
        externalUrl: 'https://venue-example.com/events/jazz-night/123',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.matchRule).toBeNull();
      expect(result.festivalId).toBeNull();
      expect(result.isFestivalEvent).toBe(false);
    });
  });

  describe('rule 4 — manual override', () => {
    it('attaches festival_id when a (source_id, external_id) override exists', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceId: 'src-ticketmaster',
        externalId: 'tm-12345',
        title: 'Some headliner',
        festivals: [CELTIC_CONNECTIONS],
        overrides: [
          {
            sourceId: 'src-ticketmaster',
            externalId: 'tm-12345',
            festivalId: 'fest-celtic',
          },
        ],
      });

      expect(result.matchRule).toBe('manual');
      expect(result.festivalId).toBe('fest-celtic');
      expect(result.isFestivalEvent).toBe(true);
    });

    it('overrides any automated rule that would otherwise fire', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceId: 'src-1',
        externalId: 'ext-1',
        title: 'Glasgow Film Festival presents…',
        festivals: [GLASGOW_FILM_FESTIVAL, CELTIC_CONNECTIONS],
        overrides: [
          { sourceId: 'src-1', externalId: 'ext-1', festivalId: 'fest-celtic' },
        ],
      });

      expect(result.matchRule).toBe('manual');
      expect(result.festivalId).toBe('fest-celtic');
    });

    it('bypasses the date-window check (operator takes responsibility)', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceId: 'src-1',
        externalId: 'ext-1',
        startAt: '2030-08-01T20:00:00Z', // far outside Celtic Connections 2027 window
        festivals: [CELTIC_CONNECTIONS],
        overrides: [
          { sourceId: 'src-1', externalId: 'ext-1', festivalId: 'fest-celtic' },
        ],
      });

      expect(result.matchRule).toBe('manual');
      expect(result.festivalId).toBe('fest-celtic');
      expect(result.windowMismatch).toBeNull();
    });
  });

  describe('date-window validation (critical — only guard against false tagging)', () => {
    it('refuses to tag when start_at is outside the festival window — even when title matches', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Celtic Connections retrospective screening',
        startAt: '2027-10-15T19:00:00Z', // outside Jan window
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBeNull();
      expect(result.isFestivalEvent).toBe(false);
      expect(result.matchRule).toBeNull();
      expect(result.windowMismatch).not.toBeNull();
      expect(result.windowMismatch?.festivalId).toBe('fest-celtic');
      expect(result.windowMismatch?.festivalSlug).toBe('celtic-connections-2027');
      expect(result.windowMismatch?.matchRule).toBe('title');
    });

    it('refuses to tag when start_at is outside the festival window — even when URL slug matches', () => {
      const result = detectFestival({
        ...inputBase(),
        externalUrl: 'https://venue.example.com/celtic-connections/old-show',
        startAt: '2027-08-01T19:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBeNull();
      expect(result.windowMismatch?.matchRule).toBe('url_slug');
    });

    it('refuses to tag domain matches that fall outside the window (connector left running off-season)', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceDomain: 'celticconnections.com',
        startAt: '2027-06-01T19:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBeNull();
      expect(result.windowMismatch?.matchRule).toBe('domain');
    });

    it('tags when start_at falls on the inclusive start_date boundary', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Celtic Connections opening night',
        startAt: '2027-01-14T19:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBe('fest-celtic');
      expect(result.windowMismatch).toBeNull();
    });

    it('tags when start_at falls on the inclusive end_date boundary', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Celtic Connections closing set',
        startAt: '2027-02-04T22:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.festivalId).toBe('fest-celtic');
      expect(result.windowMismatch).toBeNull();
    });

    it('skips window validation when the festival has no dates yet (announced before scheduled)', () => {
      const result = detectFestival({
        ...inputBase(),
        title: 'Celtic Connections 2028 sneak preview',
        startAt: '2030-08-01T19:00:00Z',
        festivals: [ANNOUNCED_NO_DATES],
      });

      expect(result.festivalId).toBe('fest-tba');
      expect(result.matchRule).toBe('title');
      expect(result.windowMismatch).toBeNull();
    });
  });

  describe('window-mismatch alert payload', () => {
    it('carries enough context for the caller to write an ingest_alerts row', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceId: 'src-ticketmaster',
        externalId: 'tm-99',
        title: 'Celtic Connections retrospective',
        startAt: '2027-10-15T19:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });

      expect(result.windowMismatch).toMatchObject({
        festivalId: 'fest-celtic',
        festivalSlug: 'celtic-connections-2027',
        sourceId: 'src-ticketmaster',
        externalId: 'tm-99',
        matchRule: 'title',
      });
      // message follows the format documented in docs/FESTIVALS.md
      expect(result.windowMismatch?.message).toContain('celtic-connections-2027');
      expect(result.windowMismatch?.message).toContain('2027-10-15');
      expect(result.windowMismatch?.message).toContain('2027-01-14');
      expect(result.windowMismatch?.message).toContain('2027-02-04');
    });
  });

  describe('multi-festival priority', () => {
    it('evaluates festivals in the order given and stops at the first match within window', () => {
      // Two festivals could match by title; we should pick the first one whose
      // window also accepts the date. Caller controls priority by ordering.
      const result = detectFestival({
        ...inputBase(),
        title: 'Glasgow Film Festival x Celtic Connections crossover gig',
        startAt: '2027-02-26T20:00:00Z', // inside GFF, outside CC
        festivals: [CELTIC_CONNECTIONS, GLASGOW_FILM_FESTIVAL],
      });

      expect(result.festivalId).toBe('fest-gff');
      expect(result.matchRule).toBe('title');
    });

    it('manual overrides still win against any number of automated matches', () => {
      const result = detectFestival({
        ...inputBase(),
        sourceId: 's',
        externalId: 'e',
        title: 'Celtic Connections finale',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS, GLASGOW_FILM_FESTIVAL],
        overrides: [{ sourceId: 's', externalId: 'e', festivalId: 'fest-gff' }],
      });

      expect(result.festivalId).toBe('fest-gff');
      expect(result.matchRule).toBe('manual');
    });
  });

  describe('isFestivalEvent invariant', () => {
    it('is true iff festivalId is non-null', () => {
      const tagged = detectFestival({
        ...inputBase(),
        title: 'Celtic Connections gig',
        startAt: '2027-01-20T20:00:00Z',
        festivals: [CELTIC_CONNECTIONS],
      });
      expect(tagged.isFestivalEvent).toBe(tagged.festivalId !== null);

      const untagged = detectFestival({
        ...inputBase(),
        title: 'A jazz gig',
        festivals: [CELTIC_CONNECTIONS],
      });
      expect(untagged.isFestivalEvent).toBe(false);
      expect(untagged.festivalId).toBeNull();
    });
  });
});

// Silence "unused" type-export warnings.
type _T1 = FestivalRecord;
type _T2 = FestivalEventOverride;
