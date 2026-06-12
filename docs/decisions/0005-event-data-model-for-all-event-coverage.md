# ADR 0005: Event data model for all-event coverage

- **Status:** accepted
- **Date:** 2026-06-11
- **Deciders:** Clyde Culture core

## Context

The v5 schema (ADR-era) is well-built for one shape of event: **ticketed,
single-venue, single-category, API-sourced** listings (the Ticketmaster shape). It
also carries denormalisation designed for the now-retired Webflow publisher
(ADR 0001).

The product goal is broader: an easily searchable index of **all** Glasgow events —
DIY gigs, community-group events, markets, galleries, performances, festivals — later
expandable to Scotland. A review on 2026-06-11 (see `docs/LESSONS.md` and the audits
in `docs/reviews/`) measured the live schema against that goal and found structural
limits. Verified against `docs/reference/SCHEMA_v5.sql` and the migrations:

1. **One link per event.** `events.source_url` / `events.ticket_url` are single
   columns; cross-source dedup *merges* sources into one canonical row; the per-source
   links in `external_events` have **no public RLS** and the frontend never reads them
   (`packages/shared/src/db/publicQueries.ts`). So "see every way to get to this event"
   — the purest expression of link-first — is impossible today.
2. **One category per event.** `events.event_type_id` is a single NOT-NULL FK; tags
   are many-to-many but each tag has a single parent. A "market + workshop + live
   music" community day, or a gallery-cafe-gig venue, cannot be properly classed.
3. **No work/occurrence separation.** Each `events` row is a single dated instance,
   grouped only loosely by `series_id` (venue-locked) or `festival_id`. There is no
   "one work, many occurrences" concept.
4. **No people layer.** No artists / performers / organisers / promoters entities;
   Ticketmaster lineup data is discarded at normalise.
5. **Thin geography.** `venues` has lat/lng + free-text `city` default 'Glasgow'; no
   neighbourhood / region hierarchy for area browse or the Scotland expansion.
6. **A quality gate that can suppress grassroots.** Public reads require
   `confidence >= 60`. A Tier-3 scraped DIY gig at an unknown venue with a fuzzy type
   scores ~50 and is hidden, while a ticketed opera clears easily — in tension with
   hard rule #7 ("a free zine fair sits at the same weight as a ticketed opera").

**The cinema case crystallises #1 and #3.** Glasgow cinema listings — Glasgow Film
Theatre (direct connector) plus Cineworld / Vue / Odeon (via Data Thistle) — mean
*one film shown many times per day across several venues*, each showing with its own
booking link. Ingested into the flat `events` table, "Dune" becomes hundreds of
near-identical rows that flood the listing and have no shared identity. Cinema is the
highest-volume proof that the work/occurrence structure is required.

These are cheaper to fix **now**: pre-launch, greenfield, no production data to
migrate. Every connector added against the current shape bakes the single-link /
single-category assumptions deeper.

### The reframe: a cultural graph, not an events table

The underlying problem is a modelling assumption: that **an event has one source, one
venue, one category, and one ticket link.** That shape is too thin for Glasgow's
cultural ecosystem. The target is a **cultural graph**:

```
canonical events / listings
  → occurrences / performances / work-level groupings (a film, a run, a residency)
  → source links (every way to read, book, RSVP, or support)
  → venues and places (neighbourhood → city → region → country)
  → organisers, promoters, collectives, artists, companies, festivals, venue groups
  → event types, tags, and discovery dimensions (mood / format / scene / participation)
  → submissions and moderation (community as a core source)
  → provenance, trust, completeness, and field-locking
  → media rights and display permissions
```

We do **not** build the whole graph now. We stop assuming the thin shape, and we walk
toward the graph in tranches — landing the cheap, connector-shaping pieces now and
designing (not building) the heavier ones — without over-building for a 1–3 hr/month
non-profit. This ADR is the umbrella; two behavioural decisions are split out:
[ADR 0006](0006-confidence-trust-and-completeness.md) (confidence = trust ×
completeness) and [ADR 0007](0007-editorial-override-and-field-locking.md) (editorial
override & field-locking).

## Options considered

1. **Leave the model as-is; bolt on per-feature columns later.** Lowest effort now.
   But each new connector (RSS/iCal/HTML/cinema) populates single-link/single-category
   data, so later expansion means migrating real, populated data and re-ingesting.
   Rejected.
2. **Redesign everything up front into a fully normalised event/work/occurrence/
   artist/place graph.** Most "correct", but heavy, slows the connector build-out, and
   over-builds maintenance for a 1–3 hr/month non-profit. Rejected.
3. **Phase the expansion: land the cheap, foundational, connector-shaping changes now;
   design (but defer building) the heavier structural pieces; defer enrichment to
   Phase 2.** Chosen.

## Decision

Adopt option 3. Expand the data model in three tranches, gated by a design-and-gap
audit (prompt `17`) that fixes exact column/table shapes against the live schema
before any change.

### Tranche A — NOW (foundational; do before the connector build-out ramps)

> **Re-sequenced by [ADR 0008](0008-tracer-bullet-delivery.md).** "Tranche A before the
> connector build-out" no longer holds: the Ticketmaster tracer bullet ships on the
> current schema *first*. These tranches become a backlog of *future feature slices*
> (GitHub issues), pulled by user value — not preconditions for the first ship.

These shape how every connector writes data, so they precede RSS/iCal/HTML/cinema:

- **A1 — All links per event.** Surface every source/ticket link for a canonical
  event (each `external_events.external_url` / `ticket_url_guess`, labelled by source)
  via a read model the anon key can read. Prefer a curated `event_links` projection
  (or an RLS-guarded view) over opening `external_events` wholesale. Delivers
  requirement #1 and sharpens the link-first identity. Prompts `18a`/`18b`.
- **A2 — Multi-category events.** Add an `event ↔ event_types` join (keep a single
  `primary_event_type_id` for the canonical badge/slug). Optionally allow venues
  multiple types. Delivers #2. Prompts `19a`/`19b`.
- **A3 — Grassroots confidence policy.** Decide and encode how community / known-
  grassroots-venue / submitted events clear the public gate without lowering the bar
  for everything. **Superseded by [ADR 0006](0006-confidence-trust-and-completeness.md):**
  split confidence into **trust** ("is it real?") and **completeness** ("ready to
  display?") and gate on both, so a real sparse grassroots event is not suppressed for
  lacking a ticket URL/image/known venue. Protects hard rule #7. Prompt `20`.
- **A5 — Editorial override & field-locking.** Per [ADR 0007](0007-editorial-override-and-field-locking.md):
  a `field_overrides` mechanism the normaliser/merge MUST respect, so re-normalisation
  never clobbers human corrections. **Must land before heavy sweep/re-normalisation.**
  Prompts `22a`/`22b`.
- **A6 — Community submission model (promoted).** Submission is a **core source**, not a
  Phase-2 luxury: submit event/venue/organiser, repeat-event helper, submission-time
  dedup & reconciliation, moderation, claim/edit, submitter PII/GDPR. Designed now;
  see `docs/SUBMISSIONS.md`, prompt `23` (references tasks F1/F2/F3).
- **A7 — Source-type classes + field-level provenance.** Expand source classification to
  `api / feed / scrape / partner / community / editor` (capability + trust), and record
  **which source a field came from** so source priority (title from official page, price
  from ticketing, cancellation from most-recently-verified source) is principled rather
  than noisy. See `docs/INGESTION.md`, `docs/NORMALISATION.md`.
- **A4 — Geography (additive).** Add a nullable **neighbourhood** signal on `venues` now
  (West End, Southside, Merchant City, Govanhill, …) plus `area`/`region`; do **not**
  hard-code Glasgow except as seed/default. The full `places` hierarchy
  (country → region/council → city/town → neighbourhood → venue) is **designed now,
  built later** (Tranche B). Folded into prompt `17`'s recommended migration; no
  behaviour change at launch.

### Tranche B — DESIGN NOW, BUILD LATER (decide the shape now; build when the
triggering connector is scheduled)

- **B1 — Work ↔ occurrence model (the showings structure).** Separate the *work*
  (a film, a play, a touring show, a recurring night, an exhibition) from the
  *occurrence* (a dated instance at a venue with its own booking link). Generalise the
  existing venue-locked `event_series` into a venue-agnostic grouping (a `works` table,
  or an extended `event_series`), and treat each `events` row as an occurrence linked
  to the work. The public listing groups by work ("Dune — showing at GFT, Cineworld
  today") instead of emitting one row per showing. This is the cinema answer and also
  serves theatre runs, exhibition open-hours, and cross-venue residencies. Distinguish
  parent-child **programme** structure (festival → production → occurrence) from simple
  recurrence (see `docs/FESTIVALS.md`). **Build deferred** until a high-volume showings
  source (cinema via Data Thistle, or theatre) is ingested — but the shape is designed
  now (prompt `21`).
- **B2a — Organisers / promoters / collectives (sooner).** Entities + event
  relationships for "everything this promoter/collective is doing" — more important than
  artists for Glasgow DIY discovery. Lightweight and high-value; design now, build before
  B2b. See `docs/ENTITIES.md`, prompt `24`.
- **B2b — Artists / performers / lineups (later).** "Every gig featuring X", support
  acts. Heavier to ingest; follows B2a. Link-first: name + canonical link, not
  biographies. Aligns with the Phase-2 Bandsintown note in the SPEC.
- **B3 — `places` hierarchy build.** Build the country → region/council → city →
  neighbourhood → venue graph (designed under A4) when Scotland expansion is scheduled.
- **B4 — Media rights & display permissions.** A per-source media-rights model and a
  `display_permitted` signal — see `docs/MEDIA_POLICY.md` (extends
  [ADR 0004](0004-ticketmaster-image-usage.md)). Policy is documented now; the schema
  field follows when media display is built.

### Tranche C — DEFER (Phase 2+; enrichment, not structure)

- Structured, filterable accessibility (JSONB) at venue and event level — **design-now,
  build-later** rather than hard defer where cheap.
- Entry-model field (free / ticketed / PWYC / donation / RSVP / members-only).
- Unified faceted / full-text / entity-led search — see `docs/SEARCH.md`.
- User-facing change history beyond the `availability` badge (incl. rescheduled
  old→new date history — a status-lifecycle gap noted in the audit).
- Saved searches, alerts, and follow (venue/organiser) — `docs/SEARCH.md`.

### Status-lifecycle gaps (verified against the live schema)

The status model is mostly present (`availability` enum, `visibility`, `needs_review`,
`event_merge_candidates`) but has confirmed gaps to close as part of this expansion:

- **No survivor pointer** on merged events (audit A1-007) — when duplicates merge, there
  is no canonical-survivor reference for redirects/provenance. Pairs with A5/ADR 0007.
- **No rescheduled old→new date history** — `availability = 'rescheduled'` exists, but the
  previous date is not retained. Deferred (Tranche C change history) but noted here.
- **`source_type` lacks trust-bearing classes** (`partner`/`community`/`editor`) — A7.

### Revised priority order

Reflected in `docs/ROADMAP.md` and `docs/prompts/README.md`:

1. `event_links` + public RLS (A1)
2. Confidence trust × completeness split (A3 / ADR 0006)
3. Editorial override & field-locking (A5 / ADR 0007) — before heavy re-normalisation
4. Multi-type events + venue types (A2)
5. Community submission + moderation model (A6)
6. Organisers / collectives entities (B2a)
7. Work/occurrence + parent-child grouping (B1; design now, cinema build later)
8. Geography: neighbourhood now, `places` graph designed (A4 / B3)
9. Per-source media/rights policy (B4)
10. Structured entry-model + accessibility/age — design-now, build-later
11. Shed Webflow denormalisation last

### Non-goals (to prevent over-building)

- Do **not** build the whole cultural graph now. Land Tranche A; design Tranche B;
  defer Tranche C.
- Do **not** store biographies, full descriptions, or media binaries — link-first holds.
- Do **not** build the `places` graph, faceted-search engine, or alerts infrastructure
  now (design only).
- Do **not** hard-code Glasgow in the schema except seed/default data — keep it
  place-agnostic for Scotland.
- Do **not** add maintenance the 1–3 hr/month model can't sustain; prefer the smallest
  structure that unblocks the product.

## Consequences

**Easier:** the product can finally express link-first fully (A1), house genuinely
multi-category and grassroots events (A2/A3), curate messy grassroots data without the
pipeline fighting back (A5), treat community submission as a first-class source (A6),
and — once B1 lands — absorb high-volume showings sources like cinema without flooding
the listing. The Scotland expansion gets its place signal early and cheaply (A4).

**Harder / new maintenance:** an `event_links` projection and a multi-category join
add surface area to the normaliser and public queries; the work/occurrence model (B1)
is a real structural change to grouping, dedup interaction, and listing logic — which
is why its build is deferred behind a design preflight rather than rushed.

**Explicitly deferred:** B1/B2 build, and all of Tranche C. We are **designing** B1
now and **building** it only when cinema/theatre ingestion is scheduled.

**Connector ordering implication:** Tranche A (prompts `18`–`20`) should land before
the RSS/iCal/HTML connector build-out (prompts `13`–`16` and the cinema connectors)
populates real single-link/single-category data. The work/occurrence design (`21`)
must be accepted before the **Glasgow Film Theatre** and **Data Thistle cinema**
connectors are built, since those are the sources that need it.

**Webflow-era debt:** the denormalised `*_display` columns and
`validate_event_consistency()` exist only to feed the retired flat CMS. They are not
removed by this ADR, but prompt `17` should assess shedding them, since Astro reads
Supabase directly with joins and the denormalisation is now maintenance cost and a
consistency-bug surface.
