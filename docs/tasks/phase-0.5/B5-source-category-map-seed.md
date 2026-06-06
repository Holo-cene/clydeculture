# B5 — Seed source_type_category_map

## Status
Complete

## Purpose
The `source_type_category_map` table has no seed data. All event classification falls to keyword guessing, which floods the moderation queue (especially for Ticketmaster which sends hundreds of events). This task creates a seed migration with at minimum the Ticketmaster classification IDs documented in `docs/tasks/BE-03.md`, so that `mapSourceCategoryToEventType()` can correctly classify live music, club nights, comedy, and theatre from Ticketmaster category IDs without falling back to keyword matching.

This is a data/migration task, not a TypeScript implementation task. Stop after the seed migration and SQL assertion — do not implement the TypeScript mapping function.

## Classification
- Type: migration (seed data only, no schema changes)
- Blocks: C3 (category mapping tests need seed data to assert against)
- Can run in parallel: no (depends on B1 for correct slug values)
- Must run after: B1 (correct EventCategory slugs must be confirmed first)
- Must run before: C3

## Files to inspect first
- `docs/tasks/BE-03.md` — Ticketmaster classification ID list
- `docs/reference/SCHEMA_v5.sql` — `source_type_category_map` table definition
- `supabase/migrations/20260531000000_schema_v5_initial.sql` — confirm table exists in baseline
- `packages/shared/src/enums/taxonomy.ts` — confirm the correct slug values after B1 is complete

## Files allowed to edit
- `supabase/migrations/YYYYMMDD_source_category_map_seed.sql` (new file)
- `docs/tasks/BE-03.md` — status update only (mark seed sub-task as complete)

## Files not allowed to edit
- `supabase/migrations/20260531000000_schema_v5_initial.sql`
- Any TypeScript source files
- Any connector implementations
- `packages/shared/src/enums/taxonomy.ts`

## Non-goals
- Do not implement `mapSourceCategoryToEventType()` TypeScript logic.
- Do not add Skiddle, DICE, or other source rows in this pass — Ticketmaster only.
- Do not add schema columns not already defined in SCHEMA_v5.

## Required steps
1. Read `docs/tasks/BE-03.md` and extract all documented Ticketmaster classification IDs.
2. Read `docs/reference/SCHEMA_v5.sql` to confirm the `source_type_category_map` table structure (expected columns: `source_type`, `external_category_id`, `event_type_slug` or similar).
3. Confirm the correct `event_type_slug` values from `packages/shared/src/enums/taxonomy.ts` (after B1 is complete, these should be the 13 SQL slugs).
4. Create `supabase/migrations/YYYYMMDD_source_category_map_seed.sql` with INSERT statements for:
   - Ticketmaster classification IDs for: live music, club nights, comedy, theatre (minimum; add more if documented in BE-03).
   - Use `ON CONFLICT DO NOTHING` to make the migration idempotent.
5. Run `pnpm supabase:reset` to confirm the seed migration applies cleanly after A1 and B1.
6. Run a SQL assertion: `SELECT count(*) FROM source_type_category_map WHERE source_type = 'ticketmaster'` — must return ≥ 5.
7. Update `docs/tasks/BE-03.md` to mark the seed sub-task as complete.

## Test command / verification
```bash
pnpm supabase:reset
# Then in psql:
# SELECT count(*) FROM source_type_category_map WHERE source_type = 'ticketmaster'; -- must be >= 5
```

## Acceptance criteria
- [x] Seed migration applies cleanly after CC-NEW-1 and B1.
- [x] `SELECT count(*) FROM source_type_category_map WHERE source_type = 'ticketmaster'` returns ≥ 5. (returns 5)
- [x] Seed covers: live_music, club_night, comedy, arts_exhibition, film from Ticketmaster. **Note:** theatre not included — no theatre classification ID is documented in BE-03. Adding one requires a documented API ID.
- [x] `docs/tasks/BE-03.md` updated to mark seed migration as complete.

## Follow-up

### Theatre classification ID (deferred)

The Ticketmaster Discovery API classification ID for theatre / performing arts was not
confirmed before B5 was committed. **No theatre row is included in the seed.**

Before adding a theatre mapping:

1. Verify the real classification ID via the Ticketmaster Discovery API or its official
   documentation. Do not invent or guess the ID.
2. Do not reuse any ID already mapped in B5 unless verified as a theatre/performing-arts
   identifier by the API or specification.
3. Once confirmed, add a single-row migration (a new file in `supabase/migrations/`).
4. Update the C3 red tests and `docs/tasks/BE-03.md` acceptance criteria at that time.

The migration file (`20260606000000_source_category_map_seed.sql`) already documents this
gap with a comment in the file header.

---

## Stop condition
Stop when the seed migration is written and the SQL assertion passes. Report:
- Ticketmaster classification IDs included
- count of rows inserted
- whether `pnpm supabase:reset` applied cleanly
- recommended next prompt: `Implement docs/tasks/phase-0.5/C3-category-mapping-red-tests.md exactly.`
