# 17 — Data-Model Expansion Design & Gap Audit (ADR 0005)

## Purpose

Produce the precise, schema-verified build plan for the all-event data-model
expansion (ADR 0005). This is the **gate** for prompts `18`–`21`: it fixes exact
column/table/view shapes against the *live* schema before any change is written, and
confirms which tranche-A items are genuinely needed.

Read-only. Do not make code or schema changes.

> **Lesson applied (`docs/LESSONS.md`).** Do not copy shapes from ADR 0005 or this
> prompt as if they were facts. ADR 0005 states *intent*; the live schema is the
> truth. Verify every column name, constraint, and policy against
> `supabase/migrations/*` and `docs/reference/SCHEMA_v5.sql`, and report drift.

---

## Skill / Agent

Spawn an **Explore** subagent to read the schema, migrations, public read path, and
normaliser in parallel. Do not use production implementation tools.

## Parallelization

Must run **before** prompts `18`, `19`, `20`, `21`. Those are largely independent of
each other once this audit fixes their shapes.

---

## Context

ADR 0005 (`docs/decisions/0005-event-data-model-for-all-event-coverage.md`) scopes the
expansion into three tranches. This audit covers Tranche A (build now) and the design
inputs for Tranche B1 (work/occurrence). The review that motivated the ADR verified,
against the live schema:

- `events.source_url` / `ticket_url` are single columns; cross-source dedup merges
  sources; `external_events` has **no public RLS**; `publicQueries` reads only `events`
  + `event_types`/`venues`/`festivals` joins.
- `events.event_type_id` is a single NOT-NULL FK; tags are many-to-many with a single
  parent.
- Public reads gate on `confidence >= 60`; `calculateConfidence` base scores are
  Tier 1 = 50 … Tier 4 = 20 (live code, not the audit's older numbers).
- `event_series` is venue-locked (`venue_id` single); no work/occurrence separation.
- `venues` has lat/lng + free-text `city`; no `area` / `region`.
- Webflow-era denormalised `*_display` columns + `validate_event_consistency()` remain;
  Milestone 6 plans dropping some.

---

## Files to Inspect

- `docs/decisions/0005-event-data-model-for-all-event-coverage.md` — the decision
- `docs/reference/SCHEMA_v5.sql` + `supabase/migrations/*` — the live schema (canonical)
- `packages/shared/src/db/publicQueries.ts` — the anon-key read path (`PUBLIC_EVENT_SELECT`)
- `packages/ingestion/src/normalise/dbNormalise.ts` — where canonical events + links are written
- `packages/core/src/normalise/normalise.ts` — `calculateConfidence`, type mapping
- `supabase/tests/rls_internal_tables_test.sql` — current RLS test coverage
- `docs/DATA_MODEL.md` (Planned expansion section), `docs/PUBLISHING.md`, `docs/NORMALISATION.md`

---

## Task Instructions

For each Tranche A item and the B1 design, verify the current state and specify the
change with file:line evidence. Do **not** write the change.

1. **A1 — All links.** Confirm `external_events` has no public read policy and that
   `publicQueries` never reads it. Specify the chosen shape: a curated `event_links`
   table written by the normaliser, **or** an RLS-guarded view projecting
   `external_events` links for published events only. Recommend one, with the exact
   columns (event_id, url, label, source name/slug, kind = source|ticket, sort) and
   the exact RLS predicate (published parent only). Note link-first/ToS limits on
   which URLs may be surfaced per source.

2. **A2 — Multi-category.** Confirm `events.event_type_id` is single. Specify the join
   table (`event_event_types`?) and confirm a `primary_event_type_id` is retained for
   the canonical badge/slug and existing queries. List every read path that filters by
   `event_type_id` and must learn the join (`publicQueries` `getEventTypeIdBySlug` etc.).

3. **A3 — Confidence trust × completeness (ADR 0006).** Read `calculateConfidence` and
   the public boundary (`confidence >= 60`). Identify concretely which event profiles
   fall below 60 (cite tiers + missing inputs). Specify how to split the single score
   into a **trust** signal and a **completeness** signal, and the new gate (trust bar
   AND minimum-completeness bar / "minimum viable public event"). Do not pick weights
   from this prompt — derive from the live scoring.

4. **A4 — Geography.** Confirm `venues` lacks `neighbourhood`/`area`/`region`. Specify
   additive nullable columns (neighbourhood now; `places` graph designed, deferred) and
   confirm no behaviour change at launch. Do not hard-code Glasgow except seed/default.

5b. **A5 — Field-locking (ADR 0007).** Confirm no `field_overrides`/lock mechanism
   exists. Specify the storage shape (`events.field_overrides` JSONB vs side table), the
   lockable fields (title, venue, date/time, category, source priority, canonical
   survivor, duplicate decisions), and the exact point in `dbNormalise.ts` /merge where
   the lock check must guard writes. Flag the conflict with identity-first re-norm.

5c. **A6 — Submission model.** Audit the current `event_submissions` + public-insert
   path; specify the gaps for submit venue/organiser, repeat helper, submission↔
   ingestion reconciliation, moderation states, PII/GDPR (ref F1/F2/F3). Design feeds
   prompt `23`.

5d. **A7 — Source classes + field-level provenance.** Confirm current `source_type`
   values; specify the `api/feed/scrape/partner/community/editor` classes and a
   field-provenance mechanism (which source set each field).

5e. **Status lifecycle.** Confirm **no survivor pointer** on merged events (A1-007) and
   **no reschedule old→new history**; specify the survivor pointer (e.g.
   `events.merged_into_id`) and note reschedule history as deferred.

5f. **Entities + media.** Confirm no `cultural_entities`/`entity_aliases`/`event_entities`
   and no `display_permitted`; specify shapes (feeds prompts `24` / `docs/ENTITIES.md`
   and `docs/MEDIA_POLICY.md`). Design-now, build-later.

5. **B1 design input — work/occurrence.** Assess generalising `event_series`
   (drop the venue lock; add a work type) vs. a new `works` table. Note how
   `series_id`, `festival_id`, dedup (`compute_dedupe_key`), and the listing query
   would interact. This feeds prompt `21`; do not design it fully here — surface the
   trade-offs and a recommendation.

6. **Webflow debt.** List the denormalised `*_display` columns and
   `validate_event_consistency()`; recommend whether to shed them now (Astro reads via
   joins) or leave to Milestone 6. Note any read path that still depends on them.

7. Produce the **build order** for prompts `18`–`21`, noting what can run in parallel
   and what each migration must not break (existing RLS tests, public queries).

---

## Non-Goals

- Do not write migrations, code, or tests.
- Do not change RLS or seed data.
- Do not fully design the work/occurrence model (that is prompt `21`).

---

## Validation Commands

```bash
pnpm typecheck   # baseline; record current state
```

Plus read-only inspection. No schema mutation.

---

## Required Output Format

### Tranche A Build Specs

For A1–A4: current state (file:line) → exact target shape (columns, constraints, RLS
predicate) → read paths affected → migration outline (not written).

### B1 Design Input

Recommendation (generalise `event_series` vs `works`) with trade-offs.

### Webflow Debt

Shed-now vs defer, with affected read paths.

### Build Order

Ordered list for prompts `18`–`21` with parallelism and "must not break" notes.

### Decisions to Record

Draft entries for `docs/DECISIONS_LOG.md`.

---

## Acceptance Criteria

- [ ] Every Tranche A item has current-state file:line evidence and an exact target shape
- [ ] A1 RLS predicate and link-source/ToS limits specified
- [ ] A2 lists every read path that filters by `event_type_id`
- [ ] A3 policy derived from live `calculateConfidence`, not from this prompt
- [ ] B1 recommendation with trade-offs (input to prompt `21`)
- [ ] Build order produced; "must not break" constraints named
- [ ] No code, schema, or test changes made
