# Work / Occurrence (Showings) Model

**Status: accepted design (ADR 0005 Tranche B1 — design-now, build-later).** This
document describes the planned **work ↔ occurrence** structure that lets one creative
artefact (a film, a play, a touring show, a recurring night, an exhibition) appear as
many dated occurrences across venues, each with its own booking link — without
flooding the public listing.

**Build is deferred** until the first high-volume showings source is scheduled — the
Glasgow Film Theatre direct connector or the Data Thistle cinema occurrences. The
design is accepted now so the connector build does not bake in single-row-per-showing
assumptions a second time. Verify all column/function references against
`supabase/migrations/` before treating anything here as current state.

Umbrella decision: [ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md)
Tranche B1.

---

## Why now — the cinema case

Glasgow Film Theatre lists one film shown many times per day (GFT direct connector,
planned). Cineworld, Vue, and Odeon list the same films through the Data Thistle
connector (see `packages/connectors/src/api/datathistle/SPEC.md` §7 — one performance
becomes one `RawEvent`). Flattened into the current `events` table, "Dune" becomes
hundreds of near-identical rows across venues and days, each with its own booking
link. The public listing floods; there is no shared identity.

The same shape serves:

- **Theatre runs** — a Citizens production over 14 nights at one venue.
- **Touring shows** — a comedy tour stopping at several venues.
- **Exhibition open-hours** — one exhibition visible across daily open-hours blocks.
- **Recurring nights** — "Sub Club Thursdays" as one work with weekly occurrences.
- **Cross-venue residencies** — one artist/company appearing at several venues.

The current model has no "one work, many occurrences" concept. `event_series` is
venue-locked (`event_series.venue_id` references one venue — see
`supabase/migrations/20260531000000_schema_v5_initial.sql` lines 246–256) and
`festivals` is a flat grouping (`events.festival_id` only — `FESTIVALS.md`). Neither
expresses "one film, many showings, many venues".

---

## Decision summary

1. **New `works` table** — not a generalisation of `event_series`. The two concepts
   stay distinct: `event_series` keeps its current "recurring programme at one venue"
   meaning; `works` is venue-agnostic.
2. **`events.work_id` (nullable)** — each `events` row becomes an *occurrence* and may
   link to a work. Events without a work (an isolated club night) keep today's shape.
3. **Work identity is deterministic** via a `match_key` over `(work_type,
   normalised_title, release_year_or_run)` with a `work_aliases` table for title drift,
   mirroring `venues` / `venue_aliases`.
4. **Public listing groups by work** where `work_id` is set; ungrouped events keep
   one-card-per-event behaviour.
5. **Build deferred** until the GFT or Data Thistle cinema occurrences are scheduled.

---

## Entity shape

### `works` (new)

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `slug` | text unique — `/works/<slug>` URL key |
| `work_type` | text check — see enum below |
| `title` | text — canonical display title |
| `normalised_title` | text — output of `normalise_title()`; used for matching/search |
| `release_year` | smallint — for films/recordings; null otherwise |
| `run_start_date` / `run_end_date` | date — for productions/exhibitions/tours; null for ongoing |
| `canonical_url` | text — work-level link (the film's official page, the production's company page); link-first |
| `summary` | text — short, optional; never copied from a link-only source |
| `image_url` | text — work-level, subject to `MEDIA_POLICY.md` and ADR 0004 |
| `primary_event_type_id` | smallint → `event_types` (composes with A2 multi-category) |
| `festival_id` | uuid → `festivals` — when the whole work belongs to a festival programme |
| `match_key` | text unique — deterministic; see "Identity rules" |
| `status` | text check — `active`, `dormant`, `merged`, `archived` |
| `needs_review` | boolean — auto-created works wait for human review (mirror `auto_created` pattern) |
| `auto_created` | boolean |
| `confidence_inputs` | jsonb — work-level trust/completeness signal (ADR 0006) |
| `created_at` / `updated_at` | timestamptz |

`work_type` enum (initial; extend by migration):

- `film` — a film/screening work; identity = title + release_year
- `production` — theatre/dance/opera/comedy production; identity = title + company + season
- `exhibition` — visual art exhibition; identity = title + organising venue or curator
- `residency` — artist/company in residence; identity = title + organiser
- `recurring_night` — recurring branded night; identity = brand + venue
- `tour` — touring concert/show; identity = title + artist/company
- `other` — fallback; flagged for review

### `work_aliases` (new)

Mirrors `venue_aliases` — names drift across sources ("Sub Club Thursdays" /
"SubClub Thursdays" / "Thursdays at Sub Club") and must reconcile to one work.

| Column | Notes |
|---|---|
| `work_id` | uuid → `works` |
| `alias` | text — original alias text |
| `normalised_alias` | text unique — output of `normalise_title()` for matching |
| `source_id` | uuid → `sources` — where the alias was first seen |

### `work_merge_candidates` (new — optional, mirrors `event_merge_candidates`)

When two `works` rows might be the same underlying work (same title, missing year)
but identity rules cannot confirm it, the candidate surfaces for human review rather
than auto-merging. Avoids collapsing *Dune* (1984) and *Dune* (2021) into one work.

### `events` changes

Add `events.work_id uuid references works(id)`, nullable. Partial index
`idx_events_work_id on events (work_id) where work_id is not null`. No other column
changes — the `events` row remains the occurrence.

### Helper functions (planned)

- `resolve_work(work_type text, title text, year smallint default null)` — checks
  `works.match_key` first, then `work_aliases`; returns uuid or null. Mirrors
  `resolve_venue()`.
- `auto_create_work(work_type, title, year)` — creates a bare `works` row with
  `auto_created = true`, `needs_review = true`, `status = 'active'`. Mirrors
  `auto_create_venue()` and inherits its sequential-execution safety caveat
  (`DATA_MODEL.md` Helper Functions).
- `compute_work_match_key(work_type, normalised_title, release_year)` — deterministic
  text. SQL parity with a TypeScript `deriveWorkMatchKey()` in `packages/core`,
  enforced by tests (the same pattern as `deriveDedupeKey` / `compute_dedupe_key` —
  see `packages/core/CLAUDE.md`).

---

## Occurrence contract — what stays on `events`

The split is "the showing" vs "the artefact". Per-occurrence fields are everything
that varies between two showings of the same work; per-work fields are everything
shared across all showings.

| Field | Layer | Why |
|---|---|---|
| `title` | per-occurrence (mirrors work title) | Occurrences may keep a source-flavoured title ("Dune — IMAX") while the work title is canonical |
| `venue_id` | per-occurrence | The whole point — different venues, same work |
| `start_at`, `end_at`, `doors_at`, `timezone`, `time_tba` | per-occurrence | Each showing has its own time |
| `source_url`, `ticket_url`, `ticket_url_label` | per-occurrence | The booking link is showing-specific (composes with A1 `event_links`) |
| `availability`, `availability_note`, `is_sold_out` | per-occurrence | Each showing sells separately |
| `price_min`, `price_max`, `is_free`, `price_display` | per-occurrence | Pricing varies by venue, time, day |
| `dedupe_key` | per-occurrence | Cross-source occurrence dedup is unchanged (see below) |
| `primary_source_id` | per-occurrence | Provenance is per-source-per-showing |
| `confidence` / `confidence_inputs` | per-occurrence | Trust × completeness applies to each showing (ADR 0006) |
| `visibility` | per-occurrence | Each showing's publication state is independent |
| `slug` | per-occurrence | URL-addressable per showing (`/events/dune-gft-2026-07-14`) |
| `festival_id` | per-occurrence | Kept for compatibility; `works.festival_id` mirrors when the whole work belongs to a festival |
| `is_online`, `age_restriction` | per-occurrence | Can vary by showing |
| `event_type_id` | per-occurrence (overridable per showing) | Defaults from `works.primary_event_type_id` |
| `summary`, `description`, `image_url` | mostly per-work, occurrence can override | Showings of one film share copy; respect link-first |

A film occurrence whose work is set inherits `works.title`, `works.summary`,
`works.image_url`, `works.canonical_url`, and `works.primary_event_type_id` for
display. Per-occurrence overrides win where set (the per-showing booking link, the
sold-out badge, an IMAX-suffixed title).

---

## Identity rules — when do two showings collapse to one work?

Two-pass resolution. Occurrence identity is unchanged from today; work identity is a
separate step.

### Pass 1 — occurrence resolution (unchanged)

`compute_dedupe_key(venue_id, start_at, title)` continues to identify occurrences
across sources. A Ticketmaster row and a Data Thistle row for "Dune at GFT, 20:00"
still collapse into **one** `events` occurrence (see `DEDUPLICATION.md`). This is
critical: the work layer does **not** replace occurrence dedup.

### Pass 2 — work resolution (new)

After the occurrence is created or matched, the normaliser resolves which work it
belongs to:

1. Compute `match_key = compute_work_match_key(work_type, normalised_title, release_year)`.
2. `resolve_work()` — match by `match_key`, then by `work_aliases.normalised_alias`.
3. On match: set `events.work_id`; record the source's alias spelling in
   `work_aliases` if new.
4. On miss: `auto_create_work()` with `needs_review = true`. Surface to the moderation
   queue.
5. **Ambiguity guard:** if `(work_type, normalised_title)` matches more than one
   existing work (different years, missing-year vs known-year), do **not** auto-link.
   Write a `work_merge_candidates` row and leave `events.work_id` null until reviewed.

### Per-work-type identity

| Work type | Match key components | Aliasing notes |
|---|---|---|
| `film` | `film` + normalised_title + release_year | Year disambiguates *Dune* (1984) from *Dune* (2021). Missing year → ambiguity guard fires. |
| `production` | `production` + normalised_title + (optional) company slug + run_start_year | Company slug protects "Hamlet (Citizens)" from "Hamlet (Tron)" |
| `exhibition` | `exhibition` + normalised_title + organising_venue_id | Exhibitions are usually venue-bound; touring exhibition handled via aliasing |
| `residency` | `residency` + normalised_title + organiser_entity_id (B2a) | Depends on entity layer; until B2a lands, residencies are manually mapped |
| `recurring_night` | `recurring_night` + normalised_brand + venue_id | Recurring nights are venue-bound by definition |
| `tour` | `tour` + normalised_title + artist/company slug | Touring shows cross venues; identity is artist+title |

### Avoiding false merges

- **Year is load-bearing for films.** Films of the same name in different years
  must not merge. Connectors must extract release_year where available; when
  missing, `resolve_work` returns null rather than picking the first match, which
  forces `auto_create_work` + review.
- **Aliasing is for spelling drift, not for collapsing different works.** Adding
  an alias is a moderation action recorded in `moderation_log`.
- **Editorial overrides** (ADR 0007) — the canonical work for an occurrence is a
  lockable field. An operator can pin `events.work_id` to the correct work and
  the normaliser MUST respect that lock on re-normalisation.

---

## Listing and search

### Public listing groups by work

The public listing query (`packages/shared/src/db/publicQueries.ts`,
`getPublishedEvents`) gains a grouping step:

```
for occurrences in date range where visibility = 'published' AND public gate met:
  if occurrence.work_id is set:
    group into work card (one card per work; n showings collapsed inside)
  else:
    emit standard one-card-per-event
```

Card examples:

- **Work card:** "Dune — showing today at GFT (14:00, 17:30, 20:45) and Cineworld
  (15:00, 18:30)". Each showing is a per-occurrence row inside the card with its
  own time and booking link.
- **Single-event card (unchanged):** "Mogwai at SWG3, 20:00 — Book from Skiddle"
  for events with `work_id = null`.

The grouping is server-side: the public query returns work-grouped rows so the
Astro frontend (ADR 0001) renders one card with N showings, not N cards.

### Per-venue page

A venue page (`/venues/gft`) lists today's occurrences directly — a reader at GFT
wants to see the day's showings, not just film titles. Showings of the same work
at that venue are still grouped together but the venue context dominates.

### Work page

`/works/<slug>` — a stable, slug-addressed page:

- Work-level header: title, canonical_url, summary (subject to link-first), image
  (subject to MEDIA_POLICY).
- Upcoming showings list across venues, ordered by `start_at`.
- Per-occurrence: the A1 `event_links` projection — every source's booking link
  for *that specific showing*.

### Composition with A1 (`event_links`)

A1 (ADR 0005 Tranche A) introduces an anon-readable `event_links` projection over
per-source links on `external_events`. The work layer composes with A1, not
replaces it:

- Work-level: `works.canonical_url` is the one link belonging to the work itself
  (e.g., a film's official page).
- Occurrence-level: `event_links` lists every source's booking/source link for
  *this showing* — exactly what makes the work card useful ("book this 20:00
  showing via Cineworld, via Skiddle, via the venue").

Both are needed: the work answers "what is this thing?"; A1 answers "every way
to get to this specific showing".

### Search

- Work-level search (`/works?q=…`): trigram match on `works.normalised_title`
  (mirrors the existing `idx_events_title_trgm`).
- Event-level search continues over `events.normalised_title` — events with
  `work_id` set surface their work, ungrouped events surface directly.

---

## Festival relationship

Today `events.festival_id` is a flat grouping (`FESTIVALS.md`). The work layer
adds the missing middle of the programme hierarchy:

```
Festival                  (Glasgow Film Festival)
  → Work                  (the film "Past Lives")
    → Occurrence          (Past Lives at GFT, 2026-02-25 20:00)
      → source links      (A1 event_links: book via GFT, via Cineworld)
```

Rules:

- `events.festival_id` keeps its meaning (occurrence-level tag).
- `works.festival_id` is added (work-level tag) — set when the whole work belongs
  to a festival programme (a GFF screening is a film work *within* GFF).
- Both can be set independently — a work may be tagged GFF while one of its
  occurrences is outside the GFF window (then the occurrence's `festival_id` is
  null and an alert is logged, mirroring the existing window-mismatch behaviour
  in `FESTIVALS.md`).
- The festival page (`/festivals/<slug>`) renders distinct works, not flat
  occurrences. Glasgow Film Festival lists the films, not 800 screenings.

This is the **programme** hierarchy from `FESTIVALS.md` § "Planned: festival →
work/group → occurrence hierarchy". This document is the design that section
forward-referenced.

---

## Dedup, volume, indexing, archival

### Dedup interaction recap

| Layer | Mechanism | Change |
|---|---|---|
| Within-source (per connector) | `external_events` unique `(source_id, external_id)` | Unchanged |
| Cross-source occurrence | `compute_dedupe_key(venue, hour, title)` → unique `events.dedupe_key` | Unchanged |
| Cross-source work resolution | `resolve_work` + `work_aliases` + `match_key` | **New** — after occurrence is identified |

### Volume

Cinema is the highest-volume case: a typical week may add thousands of
occurrences across venues. Indexing:

- `idx_events_work_id on events (work_id) where work_id is not null` — partial,
  for grouped-by-work listing queries.
- `idx_works_match_key on works (match_key)` — unique; supports `resolve_work`.
- `idx_works_normalised_title_trgm on works using gin (normalised_title gin_trgm_ops)`
  — supports work-level search and the ambiguity guard.
- `idx_work_aliases_normalised on work_aliases (normalised_alias)` — unique;
  mirrors `venue_aliases`.

A future partition strategy for `events` by `start_at` month is **not** included
here. If cinema volume warrants it, partition decision is its own ADR.

### Archival

- `archive_past_events()` continues to archive occurrences (sets
  `visibility = 'archived'` 7 days past `COALESCE(end_at, start_at)`; see
  `DATA_MODEL.md`).
- Works are **not** archived when all their occurrences are. A re-run of *Dune*
  six months later should re-attach to the existing `works` row. Instead,
  `works.status = 'dormant'` is derived from "no upcoming published occurrences",
  but the row is retained.
- A `cleanup_dormant_works()` operation may compact long-dormant rows in Phase 2;
  not in scope here.

---

## Work visibility

Work visibility is **derived**, not stored. A work is publicly visible exactly
when it has at least one occurrence that clears the public gate (ADR 0006: trust
× completeness, and `visibility = 'published'`).

Implementation:

- A RLS-readable view `public_works` (or equivalent grouped query) joins `works`
  to `events` and exposes only works with at least one published, gate-passing
  occurrence.
- `works.status` enum (`active` / `dormant` / `merged` / `archived`) tracks the
  *work's own lifecycle* (merged-into-another, manually archived) — separate from
  derived visibility.
- `works.needs_review` follows the same human-review pattern as venues — set on
  `auto_created` and on `work_merge_candidates` resolution; clears on operator
  approval.

This avoids a stored-visibility field that could drift from occurrence state, the
same reason `events.visibility` is set explicitly per occurrence rather than
derived from connector state.

---

## Editorial overrides and field-locking (ADR 0007)

The following are lockable per ADR 0007:

- `events.work_id` — pinning the canonical work for an occurrence; the normaliser
  MUST respect the lock and skip auto-relinking.
- `works.title` and `works.normalised_title` — operator-corrected canonical title.
- `works.match_key` — pinned when title/year ambiguity has been resolved.
- Duplicate-work merge decisions — promoting one work as canonical survivor and
  rejecting the duplicate is itself an override (paired with the survivor-pointer
  gap noted in the ADR 0005 audit, A1-007).

Lock provenance is recorded via `moderation_log` (same pattern as `events`).

---

## Submission and entity layer interaction

- **Submission (A6, `SUBMISSIONS.md`).** A community submission may name a work
  (a film title, a production name). The submission pipeline resolves through
  `resolve_work` first; an unmatched work becomes a `pending` work alongside the
  occurrence.
- **Organisers/companies (B2a, `ENTITIES.md`).** When the entity layer lands,
  `works` gains an optional `producer_entity_id` (e.g., the theatre company, the
  film distributor). For now, the company/director hint can live in
  `works.summary` or `confidence_inputs` until B2a is built.

---

## Migration plan from the current `events` model

Greenfield-friendly — no production data to migrate.

1. **Schema migration** (one Supabase migration file):
   - `create table works (…)` with the columns above.
   - `create table work_aliases (…)`.
   - `create table work_merge_candidates (…)` (optional in v1).
   - `alter table events add column work_id uuid references works(id)`.
   - Indexes (see "Volume").
   - RLS policies: public read on `works` for rows with a published occurrence
     (or via a `public_works` view); service-role-only on `work_aliases` and
     `work_merge_candidates`.
   - Helper functions `compute_work_match_key`, `resolve_work`, `auto_create_work`.
2. **Normaliser changes** (`packages/core` + Trigger.dev task):
   - New `deriveWorkMatchKey()` and `resolveWork()` in
     `packages/core/src/works/`.
   - SQL parity tests (`work_match_key_parity.test.ts`), mirroring
     `dedupe.test.ts` (see `packages/core/CLAUDE.md` — Dedup key contract).
   - Wire work resolution into the normalisation pipeline as **Step 8b**
     (after canonical event upsert in `NORMALISATION.md` Step 8).
3. **Public listing changes** (`packages/shared/src/db/publicQueries.ts` +
   Astro components):
   - Update the public events select to group occurrences by `work_id` where set.
   - Add a `getPublishedWorks()` query for the work page.
4. **Connector backfill** — none required for ungrouped events. New connectors
   (GFT, Data Thistle cinema occurrences) populate `work_id` at ingestion.
5. **Feature flag** — public grouping rolls out behind a flag so individual
   connectors can be cut over without affecting the global listing.

No backfill of historical `events.work_id` is planned. Pre-launch greenfield;
post-launch the absence of a `work_id` simply means one-card-per-event behaviour
continues for that event.

---

## Future build prompts (sequenced, build-deferred)

These will become GitHub issues when the first showings source is scheduled.
This document is the **design preflight** they depend on; do not open them
until that source is on the milestone.

1. **B1-impl-1 — Schema migration.** `works`, `work_aliases`,
   `work_merge_candidates`, `events.work_id`, indexes, RLS, helper functions.
   Tests: migration assertions, RLS scope tests, `compute_work_match_key`
   determinism. References `supabase/tests/` patterns.
2. **B1-impl-2 — Normaliser work resolution.** `packages/core/src/works/`,
   SQL parity, Step 8b wiring. Tests: cross-venue film matching, year
   disambiguation, ambiguity guard → `work_merge_candidates`, editorial-override
   respect.
3. **B1-impl-3 — Public listing groups by work.** `publicQueries.ts` update +
   Astro listing components + work page route. Tests: listing collapses
   multi-showing films into one card; ungrouped events unchanged.
4. **B1-impl-4 — Glasgow Film Theatre direct connector.** Populates `work_id`
   for GFT showings. First end-to-end exercise of the work layer.
5. **B1-impl-5 — Data Thistle cinema occurrences.** Map performances to works
   via the same resolution. Cross-source dedup of the same film across venues.
6. **B1-impl-6 — Theatre/exhibition validation.** Verify the same shape on a
   theatre source (Citizens / Tron) and an exhibition source. Identify any
   per-type identity tweaks before declaring B1 done.

Each impl prompt follows the test-first policy in `CLAUDE.md`.

---

## Out of scope

- No code, schema, or migration changes here.
- No artist/lineup model (B2b — see `ENTITIES.md`).
- No `places` hierarchy (B3 — see ADR 0005).
- No media binaries beyond what `MEDIA_POLICY.md` already permits.
- No biographies, full descriptions, or copied marketing copy — link-first holds
  for works as it does for events.

---

## Related references

- [ADR 0005 — Event data model for all-event coverage](decisions/0005-event-data-model-for-all-event-coverage.md) (umbrella; Tranche B1)
- [ADR 0006 — Confidence as trust × completeness](decisions/0006-confidence-trust-and-completeness.md) (gates which occurrences make a work visible)
- [ADR 0007 — Editorial override and field-locking](decisions/0007-editorial-override-and-field-locking.md) (lockable: `events.work_id`, `works.title`, merge decisions)
- [DATA_MODEL.md](DATA_MODEL.md) — Tranche B1 row in the planned-expansion section
- [DEDUPLICATION.md](DEDUPLICATION.md) — occurrence dedup (unchanged)
- [NORMALISATION.md](NORMALISATION.md) — Step 8 / planned Step 8b work resolution
- [FESTIVALS.md](FESTIVALS.md) — § "Planned: festival → work/group → occurrence hierarchy" forward-references this document
- [ENTITIES.md](ENTITIES.md) — entities (B2) compose with works (a production has a company)
- [SUBMISSIONS.md](SUBMISSIONS.md) — community submissions resolve through `resolve_work`
- `packages/core/CLAUDE.md` — SQL-parity contract for the planned `deriveWorkMatchKey`
- `packages/connectors/src/api/datathistle/SPEC.md` §7 — one performance = one `RawEvent`; the source this work layer is designed for
