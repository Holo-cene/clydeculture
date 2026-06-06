# A3 — Make event_tags RLS Confidence Gate Explicit

## Status
Open

## Purpose
The `event_tags` table is currently protected by an implicit confidence threshold.
The existing policy USING clause only checks `visibility = 'published'`; the
`confidence >= 60` gate is inherited indirectly because PostgreSQL applies RLS
recursively when the anon role runs the inner subquery against `events`.

This is fragile: any change to the `events` RLS policy that weakens or removes the
confidence check would silently expose event tags for low-confidence events without
any constraint or separate test catching it.

A3 makes the `event_tags` policy explicit by including `AND confidence >= 60` in the
policy's own USING clause, providing defence-in-depth and clarity.

## Context
- A1 (`cc_new_1`) updated the `events` RLS policy from `visibility = 'published'` to
  `visibility = 'published' AND confidence >= 60`
  (see `20260603000000_cc_new_1_schema_corrections.sql`, lines 184–187).
- A2 added pgTAP tests (Section 4 of `supabase/tests/rls_internal_tables_test.sql`,
  tests 14–15) that confirm the implicit protection works but annotate it as fragile:
  > "The protection is real but IMPLICIT — it depends on the events RLS policy
  > remaining in sync."
  The Section 4 comment already documents the exact migration SQL required and
  explicitly recommends creating an A3 task.
- Current `event_tags` policy text (initial migration, line 874):
  ```sql
  CREATE POLICY "Public read event_tags" ON event_tags FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_tags.event_id
        AND events.visibility = 'published'
    )
  );
  ```

## Classification
- Type: migration (preceded by a red-test extension)
- Blocks: anon key browser-exposure threat model (defence-in-depth for public traffic)
- Can run in parallel: no (depends on A2 test file being in place)
- Must run after: A1, A2
- Must run before: any public traffic / frontend deployment

## Files to inspect first
- `supabase/migrations/20260531000000_schema_v5_initial.sql` — lines 854–878,
  current `event_tags` RLS policy
- `supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql` — lines 180–187,
  updated `events` RLS policy (set by A1)
- `supabase/tests/rls_internal_tables_test.sql` — Section 4 (~lines 265–320),
  existing `event_tags` tests and the recommended migration SQL in comments

## Files allowed to edit
**Step 1 only:**
- `supabase/tests/rls_internal_tables_test.sql` — extend with a `pg_policies` catalog
  assertion (red test)

**Step 2 only (after "Now implement" prompt):**
- `supabase/migrations/YYYYMMDD_a3_event_tags_explicit_confidence.sql` — new migration

## Files not allowed to edit
- Any existing migration files
- Any TypeScript source files
- Any connector implementations

## Non-goals
- Do not change the `events` RLS policy (A1 set it correctly).
- Do not implement any other RLS policy changes in this task.
- Do not test `event_submissions`, `sources`, or other tables (covered by A2).
- Do not run migrations against the live / remote database.

---

## Required steps

### Step 1 — Red test (stop here; do not proceed to Step 2)

Extend `supabase/tests/rls_internal_tables_test.sql` with one new test:

**What the test must assert:**
Query `pg_policies` to confirm that the `event_tags` SELECT policy USING expression
contains `confidence >= 60`. This test will **fail** against the current schema (the
policy text only checks `visibility = 'published'`) and will **pass** after the A3
migration is applied.

**Suggested pgTAP assertion:**
```sql
-- Test N: event_tags policy explicitly checks confidence >= 60
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'event_tags'
      AND cmd        = 'SELECT'
      AND qual LIKE '%confidence >= 60%'
  ),
  'event_tags SELECT policy explicitly enforces confidence >= 60 (not relying on recursive RLS)'
);
```

After adding the test:
1. Increment the `SELECT plan(N)` count at the top of the test file by 1
   (currently 17 — it should become 18).
2. Run `npx supabase db test` and confirm the new test **fails** (red).
3. Report the exact failure message.
4. Stop. Do not write migration SQL.

### Step 2 — Smallest migration (only after "Now implement" prompt)

Create `supabase/migrations/YYYYMMDD_a3_event_tags_explicit_confidence.sql`
(use today's date for YYYYMMDD):

```sql
-- ============================================================================
-- Migration: A3 — Make event_tags RLS confidence gate explicit
-- Tracking:  supabase/tests/rls_internal_tables_test.sql Section 4 note
-- ============================================================================

DROP POLICY IF EXISTS "Public read event_tags" ON event_tags;

CREATE POLICY "Public read event_tags" ON event_tags FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id    = event_tags.event_id
      AND events.visibility = 'published'
      AND events.confidence >= 60
  )
);
```

Then:
1. Run `npx supabase db reset` to apply all migrations cleanly.
2. Run `npx supabase db test` to confirm all tests pass, including the new
   `pg_policies` assertion and the existing A2 Section 4 tests (14–15).
3. Report: changed files, commands run, test results.

---

## Validation commands

```bash
# Step 1 — confirm test is red before migration:
npx supabase db test
# Expect: 1 failure — the new pg_policies assertion for event_tags

# Step 2 — after applying migration:
npx supabase db reset
npx supabase db test
# Expect: all tests pass (17 existing + 1 new = 18 total)
```

## Acceptance criteria
- [ ] `supabase/tests/rls_internal_tables_test.sql` has a `pg_policies` assertion
  confirming the `event_tags` SELECT policy explicitly contains `confidence >= 60`.
- [ ] The new test is **red** (fails) against the pre-migration schema.
- [ ] A new migration exists that replaces the `event_tags` SELECT policy to include
  `AND events.confidence >= 60` in the USING clause subquery.
- [ ] After the migration, `npx supabase db test` passes all 18 tests.
- [ ] The existing A2 Section 4 tests (tests 14–15) continue to pass unchanged.
- [ ] The migration touches only the `event_tags` SELECT policy — no other tables,
  functions, or policies.
- [ ] `npx supabase db reset` applies all migrations cleanly with no errors.

## Hard rules
- Do not implement the migration (Step 2) until the red test (Step 1) has been
  reviewed and the "Now implement" prompt has been given.
- Do not change the `events` RLS policy — it was set correctly in A1.
- Do not bundle this migration with any other schema change.
- Do not weaken or remove the existing A2 tests in Section 4.
- Do not alter the plan count without adjusting the count of assertions to match.
- Do not mark A3 complete until both the pgTAP test and migration pass cleanly.

## Stop condition (Step 1)
Stop after adding the failing pgTAP test. Report:
- the exact SQL of the new test assertion
- the updated plan count
- the exact failure output from `npx supabase db test`

After review, the implementing prompt is:
> `Now implement the smallest production code needed to pass this test. Run the test and report the result.`
