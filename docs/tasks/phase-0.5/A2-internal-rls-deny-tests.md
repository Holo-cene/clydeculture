# A2 — Add Internal RLS Deny Tests

## Status
Open

## Purpose
Clyde Culture's internal tables (`sources`, `external_events`, `ingest_runs`, etc.) must never be readable by the anon role. The current schema defines RLS policies but no automated test confirms the default-deny posture. A misconfigured policy or future migration could silently expose ingestion metadata to the public. This task adds a pgTAP test suite that can be run against a local Supabase instance to confirm zero rows are returned to anon for all seven internal tables.

## Classification
- Type: red-tests-only
- Blocks: all development (confirms the security foundation before Phase 1)
- Can run in parallel: no (depends on A1 migration being applied)
- Must run after: A1
- Must run before: none (but should pass before any connector code is merged)

## Files to inspect first
- `supabase/migrations/20260531000000_schema_v5_initial.sql` — inspect RLS policies for each internal table
- `supabase/migrations/YYYYMMDD_cc_new_1_schema_corrections.sql` — inspect the updated events RLS policy
- `supabase/tests/` — check if any existing pgTAP tests exist

## Files allowed to edit
- `supabase/tests/rls_internal_tables_test.sql` — new file

## Files not allowed to edit
- Any migration files
- Any TypeScript source files
- Any connector implementations
- Existing test files

## Non-goals
- Do not implement any RLS policies in this task — only test existing ones.
- Do not test the `event_submissions` INSERT gate here beyond flagging it (the gate is not implemented until F1).
- Do not run production migrations against the live database.

## Required steps
1. Read the RLS sections of `supabase/migrations/20260531000000_schema_v5_initial.sql` for each of these tables: `sources`, `external_events`, `ingest_runs`, `ingest_alerts`, `event_merge_candidates`, `moderation_log`, `venue_claims`.
2. Check if `supabase/tests/` contains any existing pgTAP test files. If so, read them to understand the test pattern in use.
3. Create `supabase/tests/rls_internal_tables_test.sql` using pgTAP (or the project's established Supabase test approach). For each of the seven internal tables, assert that a SELECT as the anon role returns zero rows.
4. Add a test that checks `event_submissions` anon INSERT behaviour:
   - If `WITH CHECK (true)` policy exists: write a test that documents this and mark it as expected-to-fail (or comment that F1 must fix this).
   - If no INSERT policy exists for anon: document that as passing for now.
5. Document in the test file header how to run it against the local Supabase instance.

## Test command / verification
```bash
# After pnpm supabase:reset (with A1 migration applied):
pnpm supabase db test
# Or if using psql directly:
# psql "$DATABASE_URL" -f supabase/tests/rls_internal_tables_test.sql
```

## Acceptance criteria
- [ ] `supabase/tests/rls_internal_tables_test.sql` exists.
- [ ] Tests confirm zero rows returned to anon for all seven internal tables.
- [ ] `event_submissions` anon INSERT check is present (even if marked expected-fail until F1).
- [ ] Test file includes a comment explaining how to run it.
- [ ] Tests pass against a local Supabase instance with A1 migration applied.

## Stop condition
Stop when `supabase/tests/rls_internal_tables_test.sql` is written and the tests pass against local Supabase. Report:
- files inspected
- files changed
- commands run
- which tables were confirmed deny-only
- any unexpected RLS policy found
- status of `event_submissions` INSERT policy
- recommended next prompt: run B1–B4 and H1 in parallel (they are independent)
