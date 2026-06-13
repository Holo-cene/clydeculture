> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #24. TDD-step-2 reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 19b — Multi-Category Events (ADR 0005 A2) — Implementation

## Purpose

TDD Step 2. Make the `19a` tests pass: add the `event ↔ event_types` join (keeping
`primary_event_type_id`), its public RLS, the normaliser write, and the public read
filter that matches on any category.

Only run after `19a` has produced failing tests.

---

## Skill

Run `/run-checks`. Run `/code-review medium` (schema + read-path change).

## Parallelization

Sequential after `19a`. Independent of `18`, `20`, `21`.

---

## Context

Implement the shape from prompt `17`. Schema changes go through a new
`supabase/migrations/` file. Keep `primary_event_type_id` (rename of / alongside the
existing `event_type_id` per prompt `17`) so the canonical badge, slug, and existing
queries keep working. Mirror the `event_tags` RLS policy for the new join.

---

## Files to Inspect

- The `19a` failing tests + prompt-`17` shape
- `supabase/migrations/*` — latest timestamp; `event_tags` policy as the RLS template
- `packages/shared/src/db/publicQueries.ts` — the event-type filter to widen
- `packages/ingestion/src/normalise/dbNormalise.ts` — where type is written
- `packages/core/src/normalise/normalise.ts` — `mapSourceCategoryToEventType`

---

## Task Instructions

1. Migration: create the `event_event_types` join + RLS (anon read for published
   parents only); ensure `primary_event_type_id` is retained on `events`. Backfill the
   join from the existing single type so current events gain their primary as a join row.

2. Extend the normaliser to write the primary type plus any additional resolved
   categories into the join. Single-category sources write exactly one (the primary).

3. Widen the public read so the event-type filter matches primary **or** secondary
   categories, while the displayed badge/slug stays from the primary.

4. Run the tests:
   ```bash
   pnpm --filter @clydeculture/shared test
   pnpm --filter @clydeculture/ingestion test
   supabase db reset && supabase db test
   pnpm test && pnpm typecheck && pnpm lint
   ```

5. Update docs:
   - `docs/DECISIONS_LOG.md` — join name, primary retention, backfill, files
   - `docs/DATA_MODEL.md` — flip the A2 row to "shipped"; document the join + RLS
   - `docs/NORMALISATION.md` — note multi-category write behaviour

---

## Non-Goals

- Do not drop `primary_event_type_id` or break existing single-type reads.
- Do not change the `tags` hierarchy.
- Do not change confidence or dedup logic.

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
supabase db test
```

Expected: all `19a` tests pass; existing tests + RLS tests pass; backfill leaves every
existing event with its primary category present in the join.

---

## Acceptance Criteria

- [ ] All `19a` tests pass
- [ ] Migration adds the join + RLS + backfill; applies cleanly via `supabase db reset`
- [ ] Filtering matches any category; badge/slug from primary
- [ ] Single-category sources unaffected (exactly one primary, no spurious rows)
- [ ] `docs/DECISIONS_LOG.md`, `docs/DATA_MODEL.md`, `docs/NORMALISATION.md` updated
- [ ] No previously passing test or RLS test regressed
