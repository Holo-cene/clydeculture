# 21 — Work / Occurrence (Showings) Model — Design Preflight (ADR 0005 B1)

## Purpose

Design the **work ↔ occurrence** structure that lets one "work" (a film, a play, a
touring show, a recurring night, an exhibition) appear as many dated **occurrences**
across venues, each with its own booking link — without flooding the listing. This is
the cinema structure, and it also serves theatre runs, exhibition open-hours, and
cross-venue residencies.

**Design only. Build is deferred** until the first high-volume showings source
(cinema via Data Thistle, or the Glasgow Film Theatre connector) is scheduled. This
prompt produces an accepted schema design and the build plan; it does **not** write the
migration or code.

---

## Skill / Agent

Spawn an **Explore** subagent to read the schema, dedup, series/festival handling, and
the public listing path. Read-only.

## Parallelization

After prompt `17` (which gives the `event_series`-vs-`works` recommendation). The
output of this prompt gates the future build prompts and the GFT / Data Thistle cinema
connectors (ROADMAP M7.5).

---

## Context

Today each `events` row is a single dated instance, grouped only loosely by venue-locked
`event_series` (`venue_id` single) or `festival_id`. There is no "one work, many
occurrences" concept.

**Cinema is the worked example.** Glasgow Film Theatre (direct connector) plus
Cineworld / Vue / Odeon (via the existing Data Thistle connector) list one film shown
many times per day across several venues, each showing with its own booking link.
Flattened into `events`, "Dune" becomes hundreds of near-identical rows that flood the
listing and share no identity. As **work + occurrences** it is one film work with many
showings — the listing shows "Dune — showing at GFT, Cineworld today" and expands to the
per-showing booking links (which compose with the A1 `event_links` work from prompt `18`).

The design must address how the new structure interacts with:
- **Dedup** — `compute_dedupe_key(venue, hour, title)`: same film + venue + time from two
  sources must still merge to one occurrence; same film at different times/venues are
  distinct occurrences of one work.
- **`event_series` / `festival_id`** — generalise series into the venue-agnostic work
  (per prompt `17`) or add a `works` table; clarify how festivals relate (a festival can
  contain works/occurrences).
- **Listing & search** — grouping by work; "what films are on", "what's on at GFT
  tonight", "where can I see X today" all served by one structure.
- **Volume** — cinema is thousands of occurrences/week; consider storage, indexing, and
  archival (`archive_past_events`).
- **Confidence / visibility** — does a work need its own visibility, or is it derived
  from having any published occurrence?

> Apply `docs/LESSONS.md`: verify all current column/function names against the live
> schema and migrations; do not assume from ADR 0005 or this prompt.

---

## Files to Inspect

- `docs/decisions/0005-event-data-model-for-all-event-coverage.md` — B1 intent + prompt `17`'s recommendation
- `docs/reference/SCHEMA_v5.sql` + `supabase/migrations/*` — `events`, `event_series`, `festivals`, `compute_dedupe_key`, `archive_past_events`
- `docs/DEDUPLICATION.md`, `docs/FESTIVALS.md`, `docs/NORMALISATION.md`
- `packages/core/src/dedupe/dedupe.ts` — `deriveDedupeKey`
- `packages/shared/src/db/publicQueries.ts` — the listing query that must group by work
- `packages/connectors/src/api/datathistle/` — the source that will carry cinema; check its category/film signal

---

## Task Instructions

1. Decide the entity shape (generalise `event_series` into a venue-agnostic work, vs a
   new `works` table). Specify columns (work type incl. `film`/`production`/`exhibition`/
   `residency`/`recurring_night`; canonical title; normalised title; canonical link;
   optional run window) and how an `events` row references its work.

2. Define the **occurrence** contract: which existing `events` fields stay per-occurrence
   (venue, start/end, doors, ticket links, availability) and which move to the work.

3. Specify **dedup interaction**: confirm occurrences still dedup correctly; define how a
   film is matched to a work across sources/venues (e.g. normalised film title + year),
   and how that avoids false merges (two different films sharing a title).

4. Specify the **listing/search** change: how `publicQueries` groups by work and exposes
   "showings" per work, and how this composes with the A1 `event_links` projection.

5. Specify **festival relationship**, **volume/indexing/archival**, and **work
   visibility** rules.

6. Produce the **build plan**: the migration outline, the normaliser changes, the
   listing changes, and a test plan — sequenced as future red/impl prompts (e.g.
   `22a`/`22b` build the structure, then the GFT and Data Thistle cinema connector
   prompts). Do not write them; just specify them.

7. Record the accepted design back into ADR 0005 (a short "B1 accepted design" note) and
   `docs/DATA_MODEL.md`.

---

## Non-Goals

- Do not write the migration, normaliser changes, or connector code.
- Do not build the GFT or cinema connectors here.
- Do not change dedup or listing behaviour now (design only).

---

## Validation Commands

None — design/inspection only.

---

## Required Output Format

### Entity Design

Work entity (generalise `event_series` vs new `works`), columns, and the occurrence
reference, with file:line evidence for current state.

### Occurrence Contract

Which fields are per-occurrence vs per-work.

### Dedup, Festivals, Volume, Visibility

The interaction rules, each with the affected function/file.

### Listing & Search

How grouping-by-work works and composes with A1 `event_links`.

### Build Plan

Sequenced future prompts (migration → normaliser → listing → cinema connectors) with
a test plan. Not written — specified.

### ADR / Docs Update

The "B1 accepted design" note to add to ADR 0005 and `docs/DATA_MODEL.md`.

---

## Acceptance Criteria

- [ ] Work entity shape decided with current-state file:line evidence
- [ ] Occurrence contract (per-occurrence vs per-work fields) specified
- [ ] Dedup interaction defined; cross-source/cross-venue film→work matching avoids false merges
- [ ] Listing-by-work design composes with the A1 `event_links` projection
- [ ] Volume / indexing / archival / work-visibility addressed
- [ ] Build plan sequenced as future prompts (build deferred), with a test plan
- [ ] Accepted design recorded in ADR 0005 + `docs/DATA_MODEL.md`
- [ ] No code, schema, or test changes made
