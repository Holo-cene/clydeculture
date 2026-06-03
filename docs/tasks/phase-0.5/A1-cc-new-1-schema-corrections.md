# A1 — Write and Apply the CC-NEW-1 Schema Correction Migration

## Status
Open

## Purpose
The existing v5 schema has several inconsistencies that block all downstream normalisation and connector work: the `compute_dedupe_key()` function omits `AT TIME ZONE 'UTC'` in its `date_trunc` call (causing BST/UTC collisions), Webflow-era publishing tables and columns still exist, the `events` RLS policy uses the wrong confidence threshold, `'apify'` is missing from the `source_type` CHECK constraint, and `validate_event_consistency()` references columns that will be dropped.

This task produces a precise, executable migration that corrects all of these issues before any Phase 1 implementation begins. Nothing downstream (normaliser, connectors, type alignment) can be finalised until this migration is written and passes `pnpm db:reset`.

## Classification
- Type: migration
- Blocks: all development
- Can run in parallel: no
- Must run after: none
- Must run before: A2, B1, B2, B3, B4, B5, C1–C7, D1–D6, G1

## Files to inspect first
- `docs/tasks/CC-NEW-1.md` — existing task file with full requirement list
- `supabase/migrations/20260531000000_schema_v5_initial.sql` — baseline schema (line-by-line validation required)
- `docs/reference/SCHEMA_v5.sql` — reference schema copy
- `docs/NORMALISATION.md` — normaliseVenueName() algorithm (must align with `resolve_venue()`)

## Files allowed to edit
- `supabase/migrations/` — new migration file only (do not touch the baseline migration)
- `docs/tasks/CC-NEW-1.md` — status update only, no structural changes

## Files not allowed to edit
- `supabase/migrations/20260531000000_schema_v5_initial.sql`
- Any TypeScript source files
- Any test files
- Any connector implementations

## Non-goals
- Do not implement the normalisation pipeline.
- Do not implement connector logic.
- Do not change any TypeScript types in this pass.
- Do not add columns not listed in the master plan.
- Do not run `pnpm db:reset` until the migration is written and reviewed.

## Required steps
1. Read `docs/tasks/CC-NEW-1.md` in full.
2. Read `supabase/migrations/20260531000000_schema_v5_initial.sql` in full. Confirm that every object name referenced in the planned migration (triggers, columns, functions, tables) actually exists in the baseline. Note any discrepancies — the master plan warns that `on_publish_mapping_change` may not exist; the actual trigger is `set_updated_at`, and `DROP TABLE` handles triggers implicitly.
3. Write a new migration file `supabase/migrations/YYYYMMDD_cc_new_1_schema_corrections.sql` with the following changes in order:
   a. **Collision pre-check DO block** — before any `UPDATE events SET dedupe_key = ...`, run a DO block that raises EXCEPTION if two events would produce the same new key.
   b. **Fix `compute_dedupe_key()`** — add `AT TIME ZONE 'UTC'` to the `date_trunc` call.
   c. **Drop Webflow publishing tables** — `publish_job_items`, `publish_jobs`, `publish_mappings` (and any associated triggers/indexes).
   d. **Drop Webflow display columns from `events`** — `event_type_label`, `venue_name_display`, `venue_slug_display`, `festival_name_display`, `festival_slug_display`, `tags_display`, `location_display`.
   e. **Replace `validate_event_consistency()`** — remove all references to dropped columns; retain `is_free / price_display` check; retain `image_url = ''` check.
   f. **Add CHECK constraints to `events`** — `CHECK (NOT (is_free = true AND price_min > 0))` and `CHECK (NOT (is_free = true AND price_max > 0))`.
   g. **Replace public events RLS policy** — `USING (visibility = 'published' AND confidence >= 60)`.
   h. **Add `'apify'` to `sources.source_type` CHECK constraint**.
   i. **Add `'cold_start_zero'` to `ingest_alerts.alert_type` CHECK constraint**.
   j. **Add `events.timezone` IANA validation** — two-step `NOT VALID` + `VALIDATE CONSTRAINT`.
   k. **Align `resolve_venue()` normalisation** — strip non-alphanumeric/non-space, collapse whitespace, lowercase (must match TypeScript `normaliseVenueName()`).
   l. **Add `events.is_all_day boolean NOT NULL DEFAULT false`**.
   m. **Update `venue_aliases` RLS policy** — restrict public read to aliases for `status IN ('active', 'temporary')` venues only.
   n. **Backfill `events.dedupe_key`** — run `UPDATE events SET dedupe_key = compute_dedupe_key(...)` after the function is fixed.
4. Validate every referenced object name against the baseline migration. Flag any name that does not exist.
5. Run `pnpm db:reset` to confirm both migrations apply cleanly.
6. Run the SQL assertion: confirm `compute_dedupe_key(uuid, '2026-07-15T21:00:00+01:00', 'test')` equals `compute_dedupe_key(uuid, '2026-07-15T20:00:00Z', 'test')`.
7. Run an anon-role query to confirm `SELECT * FROM events WHERE visibility = 'published' AND confidence = 55` returns zero rows.
8. Update `docs/tasks/CC-NEW-1.md` status to "Complete".

## Test command / verification
```bash
pnpm supabase:reset
# Then inside psql or Supabase dashboard:
# SELECT compute_dedupe_key('<any-uuid>', '2026-07-15T21:00:00+01:00', 'test')
#   = compute_dedupe_key('<same-uuid>', '2026-07-15T20:00:00Z', 'test');
# SELECT count(*) FROM events WHERE visibility = 'published' AND confidence = 55; -- must be 0
# SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='is_all_day';
```

## Acceptance criteria
- [ ] `pnpm supabase:reset` applies both migrations cleanly with no errors.
- [ ] SQL assertion: BST and UTC timestamps produce identical `dedupe_key`.
- [ ] Collision pre-check DO block exists before the backfill UPDATE.
- [ ] `validate_event_consistency()` does not reference `event_type_label`, `venue_name_display`, or `festival_name_display`.
- [ ] Anon query for `confidence = 55` returns zero rows.
- [ ] `sources.source_type` CHECK includes `'apify'`.
- [ ] `events.is_all_day` column exists.
- [ ] All referenced object names confirmed to exist in the baseline migration.
- [ ] Migration has been line-by-line validated against `20260531000000_schema_v5_initial.sql`.

## Stop condition
Stop when the migration file is written and `pnpm supabase:reset` passes. Report:
- files inspected
- files changed
- commands run (including the SQL assertion results)
- any object names that were not found in the baseline migration
- any acceptance criteria that could not be verified automatically
- recommended next prompt: `Implement docs/tasks/phase-0.5/A2-internal-rls-deny-tests.md exactly. Stop at the task's stop condition.`
