# ADR 0004: Ticketmaster Image URL Handling Policy

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** Clyde Culture collective

## Context

The Ticketmaster Discovery API returns image objects with CDN URLs
(`https://s1.ticketimg.com/...`). The schema stores `events.image_url` as a
text URL; `has_image` is a generated boolean column. SEC-10 required a formal
decision on whether to store, normalise, or omit these URLs before any
Ticketmaster-sourced events are published.

Four risks were identified in SEC-10:

1. Attribution may be required (Ticketmaster trademark alongside listings).
2. CDN URLs may be ephemeral, silently breaking stored values.
3. Hot-linking may be explicitly prohibited, requiring a proxy or omission.
4. Binary caching may constitute storing a copy of Ticketmaster content.

Research was conducted as part of the E1 Ticketmaster pre-flight
(`packages/connectors/src/api/ticketmaster/SPEC.md`, §5 and §8) against the
Ticketmaster Developer API Terms of Use
(`https://developer.ticketmaster.com/support/terms-of-use/`).

Key findings from E1 pre-flight:

- **Display permitted:** "Applications must include a 'Buy' button or equivalent
  linking to the Ticketmaster URL for all ticketed events listed. The Ticketmaster
  name and trademark must be displayed in association with any event listings
  sourced from the API." Displaying event images alongside a link to the
  Ticketmaster event page is within permitted use.
- **CDN stability:** CDN URLs are stable within an event's lifecycle but may
  change across sweeps. Re-checking on each ingest run (not caching) is
  acceptable.
- **Binary caching:** Storing only the URL and hot-linking to the Ticketmaster
  CDN at render time does not constitute storing a copy of their content.

## Options considered

1. **Do not store image URLs.** Omit `imageUrlGuess`; set `image_url = null` for
   all Ticketmaster events. Pros: zero legal risk. Cons: unnecessary — ToS
   explicitly permits display; loses a useful UX signal with no benefit.

2. **Store URL in raw payload only, never normalised or published.** `raw`
   always carries the full API response; strip `imageUrlGuess` before
   normalisation. Pros: raw payload remains complete for debugging. Cons: same
   UX loss as Option 1; ToS permits the display; adds complexity to the
   normaliser for no legal gain.

3. **Store source-hosted CDN URL; hot-link with attribution (chosen).** Store
   the CDN URL in `imageUrlGuess` → `events.image_url`. Render directly from
   the Ticketmaster CDN. Attribution (`"Buy on Ticketmaster"` label) must be
   rendered adjacent to any Ticketmaster-sourced image on the frontend.
   Pros: UX benefit; ToS compliant; no binary copy stored. Cons: frontend must
   enforce attribution rendering; CDN URL may change between sweeps (managed by
   re-ingest).

## Decision

**Store the Ticketmaster CDN image URL in `imageUrlGuess` and normalise it into
`events.image_url`.** Hot-link to the Ticketmaster CDN at render time. Do not
download or cache image binaries.

Attribution is required by the Ticketmaster API Terms and is already satisfied:
`ticket_url_label = "Buy on Ticketmaster"` is hardcoded in the parser, and
`externalUrl = event.url` always points to the Ticketmaster event page. The
frontend must render this label adjacent to any Ticketmaster-sourced image.

## Consequences

**Easier:** UX — link cards can display event images for Ticketmaster events.
`has_image` is a reliable signal for the frontend layout.

**Required:**
- The frontend template must render Ticketmaster attribution (the "Buy on
  Ticketmaster" label or the source name) adjacent to any image whose source
  is Ticketmaster. This is a frontend implementation requirement, not a backend
  one.
- The normaliser must validate `image_url` as a valid absolute HTTPS URL before
  writing it (specified in C7 / `docs/NORMALISATION.md`).

**Prohibited:**
- Do not download or proxy-cache Ticketmaster image binaries.
- Do not store `image_url` for Ticketmaster events without an accompanying
  `externalUrl` linking back to the Ticketmaster event page.

**Deferred:** If Clyde Culture gains significant traffic or Ticketmaster raises
concerns about image usage, revisit this decision and consider switching to
Option 1 (omit images) as the lowest-risk fallback. No additional proxy
infrastructure is planned for Phase 1.

**CDN URL stability:** Re-ingest CDN URLs on every sweep rather than caching
them. The connector is already structured to do this. No monitoring check is
added in Phase 1; if broken image rates become observable, add a sweep-level
check then.
