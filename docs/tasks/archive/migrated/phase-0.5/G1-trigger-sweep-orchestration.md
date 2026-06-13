> **ARCHIVED 2026-06-13.** COVERED-BY issue #5 (Thread #1 daily scheduled Ticketmaster sweep — CLOSED). See `docs/tasks/MIGRATION_TRIAGE.md`.

# G1 — Define and Implement Trigger.dev Sweep Orchestration

## Status
Open

## Purpose
The sweep task in `trigger/tasks/sweep.ts` currently exists but may be a stub. The sweep must: read all enabled sources, run each connector in isolation, write `ingest_runs` rows, upsert `external_events`, apply break detection, and update `sources.last_run_at`. Without this orchestration, no connector output flows into the database. This task follows TDD: write red tests first, stop; implement in step 2.

**TDD step 1 only** — write the red test file, stop.

## Classification
- Type: red-tests-only (step 1 of two; step 2 is a full implementation task)
- Blocks: all connector runs in production
- Can run in parallel: no (depends on B2 Source, B3 SourceType, B4 RawEvent being stable)
- Must run after: B2, B3, B4, D3 (removal/cancellation lifecycle), D6 (concurrency note read)
- Must run before: first connector integration test

## Files to inspect first
- `trigger/tasks/sweep.ts` — current sweep task (assess stub vs. partial implementation)
- `trigger/trigger.config.ts` — check if a cron schedule is defined
- `packages/shared/src/types/source.ts` — Source interface (post-B2)
- `packages/connectors/src/connector.ts` — Connector interface
- `docs/INGESTION.md` — ingest_runs schema and break detection rules (post-D3)
- `docs/reference/SCHEMA_v5.sql` — `ingest_runs`, `ingest_alerts`, `external_events` tables

## Files allowed to edit
- `trigger/tasks/orchestrate.test.ts` (new) — red tests only

## Files not allowed to edit
- `trigger/tasks/sweep.ts` — do not change in step 1
- `trigger/trigger.config.ts` — do not change in step 1
- Any package source files

## Non-goals
- Do not implement the sweep logic in step 1.
- Do not create `packages/ingestion` or `packages/publishing`.
- Do not add new Trigger.dev tasks beyond the test file.

## Required steps
1. Read `trigger/tasks/sweep.ts` in full and assess its current state (stub, partial, or complete).
2. Read `trigger/trigger.config.ts` for cron schedule definition.
3. Read `docs/INGESTION.md` for break detection rules (count_drop < 0.30 * median, cold_start_zero). Note: `connector_break` is not a valid `alert_type` in the schema; sustained failure is tracked via accumulated `count_drop` alerts.
4. Read `docs/reference/SCHEMA_v5.sql` for `ingest_runs` and `ingest_alerts` schemas.
5. Create `trigger/tasks/orchestrate.test.ts` with tests covering:
   a. **Connector isolation:** one connector throws → that connector's `ingest_runs` row has `status = 'failed'`; other connectors continue and succeed.
   b. **`ingest_runs` row:** written with correct `fetched_count`, `parsed_count`, `errors_count`, `source_id`, and ISO timestamp.
   c. **`last_seen_at` update:** re-ingesting an existing `external_event` updates `last_seen_at` without creating a duplicate row.
   d. **Cold-start zero alert:** first-ever run of a connector returns 0 events → `ingest_alerts` row with `alert_type = 'cold_start_zero'`.
   e. **Count-drop alert:** `parsed_count < 0.30 * 14-day median` → `ingest_alerts` row with `alert_type = 'count_drop'`.
6. Use mocks for the Supabase client and connector instances — the tests must not hit the real database.
7. Run the tests and confirm they fail (the sweep logic does not yet implement these behaviours).

## Test command / verification
```bash
cd trigger && pnpm test
# or
pnpm --filter @clyde-culture/trigger test
# Check if a test runner is configured for the trigger package first.
```

## Acceptance criteria
- [ ] `trigger/tasks/orchestrate.test.ts` exists with all 5 test cases.
- [ ] Tests use mocked Supabase client and connector instances.
- [ ] Tests are failing (red state).
- [ ] Tests do not depend on a live database connection.

## Stop condition
Stop after the test file is written and confirmed failing. Report:
- current state of `trigger/tasks/sweep.ts` (stub, partial, or complete)
- whether a cron schedule exists in `trigger.config.ts`
- test output showing failures
- whether a test runner is configured for the trigger package (if not, note the setup needed)
- ambiguities: if the sweep already implements some of the tested behaviours, note which
- recommended next prompt: `Implement docs/tasks/phase-0.5/G1-trigger-sweep-orchestration.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
