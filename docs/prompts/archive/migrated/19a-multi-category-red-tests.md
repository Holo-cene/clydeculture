> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #24 (ADR 0005 A2: multi-category events). TDD-step-1 reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 19a — Multi-Category Events (ADR 0005 A2) — Red Tests

## Purpose

Write failing tests for events belonging to **more than one** category, while keeping
a single `primary_event_type_id` for the canonical badge/slug. Today
`events.event_type_id` is a single NOT-NULL FK, so a "market + workshop + live music"
day or a film + Q&A talk cannot be classed across disciplines.

TDD Step 1 only. Do not implement production code or migrations.

---

## Skill

Use `/implement-test-first`.

## Parallelization

After prompt `17` (which fixes the join shape and confirms `primary_event_type_id`
retention). Independent of `18`, `20`, `21`.

---

## Context

Use the shape from prompt `17` — expected: an `event_event_types` join keeping a
retained `primary_event_type_id` on `events` for the existing badge/slug and for
backward-compatible filters. The public read must let users filter by *any* of an
event's categories, not just the primary.

Verify the join table name, the primary-type retention, and the public read predicate
against prompt `17`'s output and the live schema — do not assume column names.

---

## Files to Inspect

- The join shape from prompt `17`
- `packages/shared/src/db/publicQueries.ts` — `getEventTypeIdBySlug`, the event-type filter
- `packages/shared/src/db/publicQueries.test.ts` (if present)
- `packages/ingestion/src/normalise/dbNormalise.ts` — where the event type is written
- `packages/core/src/normalise/normalise.ts` — `mapSourceCategoryToEventType`
- `supabase/tests/` — RLS test pattern for join tables (cf. `event_tags`)

---

## Task Instructions

1. Add a **query-layer test** (in `packages/shared`) asserting:
   - filtering by an event type returns events where that type is **any** of the
     event's categories (primary or secondary), not only the primary
   - an event with primary `film` and secondary `talk_lecture` appears under both filters
   - the canonical badge/slug still comes from `primary_event_type_id`

2. Add a **pgTAP RLS test** (in `supabase/tests/`) for the join table: anon can read
   join rows only for published parent events (mirror the `event_tags` policy).

3. Add a **normaliser test** that an event with multiple resolved categories writes one
   primary type + the secondary categories into the join (single-category sources still
   produce exactly one primary and no spurious secondaries).

4. Run and confirm failures:
   ```bash
   pnpm --filter @clydeculture/shared test
   pnpm --filter @clydeculture/ingestion test
   supabase db test   # if local Supabase available
   ```

---

## Non-Goals

- Do not implement the join, migration, RLS, or normaliser writes.
- Do not remove `event_type_id` / `primary_event_type_id` (existing reads depend on it).
- Do not touch the `tags` hierarchy (separate concern).

---

## Validation Commands

```bash
pnpm --filter @clydeculture/shared test
pnpm --filter @clydeculture/ingestion test
supabase db test   # if local Supabase available
```

Expected: new tests fail; existing tests pass.

---

## Required Output Format

For each test: file path, assertion, failure reason. End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] Query-layer test: filter by any category (primary or secondary)
- [ ] Badge/slug still sourced from `primary_event_type_id`
- [ ] pgTAP RLS test for the join (published parent only)
- [ ] Normaliser test: multi-category write; single-category unaffected
- [ ] All new tests fail; existing tests pass
- [ ] No production code or migration written
