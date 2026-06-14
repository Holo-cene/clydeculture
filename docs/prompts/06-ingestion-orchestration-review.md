# 06 — Ingestion Orchestration Review

## Purpose

Assess whether the Trigger/sweep orchestration is wired correctly and is
production-sensible before enabling live ingestion. This is an inspection and
documentation task — no production code should be written.

The goal is to produce a clear, honest account of:

* What runs where.
* What is proven by tests.
* What is only wired but untested.
* What the effective database schema allows after all migrations are applied.
* What production readiness work remains before live ingestion is safe.

---

## Context

The Trigger.dev v3 sweep task (`trigger/tasks/sweep.ts`) is the ingestion
orchestrator. It:

* Creates a Supabase client with the service role key.
* Loads enabled sources.
* Runs enabled connectors.
* Upserts external events.
* Triggers normalisation per source.
* Persists ingest run logs and alerts.

The `trigger/` directory is NOT a pnpm workspace package. It is not covered by
`pnpm test` or `pnpm --filter`. The orchestration logic extracted into
`packages/core/src/ingest/` (`orchestrate.ts`, `sweep.ts`) IS testable via Vitest.

Prompt 04 and Prompt 05 have already proven the Ticketmaster fixture E2E path against
local Supabase:

`Ticketmaster-shaped fixture data → external_events → normaliseExternalEventsForSource → events → getPublishedEvents via anon client`

Do not re-litigate whether the fixture E2E path works. This review is about the live
sweep/orchestration path and production readiness.

Important historical note:

A previous review incorrectly reported that `cold_start_zero` would violate the
`ingest_alerts.alert_type` CHECK constraint because it read only the initial schema
migration. A later migration had already dropped and recreated the constraint to include
`cold_start_zero`.

This prompt must therefore evaluate the **effective schema after all migrations**, not
just the first migration where a table or constraint appears.

---

## Critical Schema Review Rule

When checking database constraints, RLS policies, SQL functions, source rows, enum-like
CHECK constraints, or seed behaviour:

1. Do not treat the initial schema migration as the final state.
2. Read every later migration that drops, recreates, alters, patches, seeds, or corrects
   the relevant object.
3. Report the effective state after all migrations are applied in filename order.
4. For every claimed schema mismatch, cite:

   * the original definition, and
   * any later migration that modifies, replaces, or confirms the final state.
5. If you cannot prove that no later migration changes the relevant schema, mark the
   finding as **unverified**, not as a blocker.

Example:

If `20260531000000_schema_v5_initial.sql` defines a CHECK constraint, but
`20260603000000_cc_new_1_schema_corrections.sql` later drops and recreates that
constraint, the latter migration defines the effective constraint.

---

## Files to Inspect

Read all of these before writing your assessment.

### Orchestration

* `trigger/tasks/sweep.ts` — the Trigger.dev task entry point
* `trigger/trigger.config.ts` — task registration and schedule
* `packages/core/src/ingest/sweep.ts` — pure sweep integration logic
* `packages/core/src/ingest/orchestrate.ts` — connector dispatch, break detection
* `packages/core/src/ingest/orchestrate.test.ts` — what is tested
* `packages/core/src/ingest/sweep.test.ts` — what is tested

### Connectors

* `packages/connectors/src/api/ticketmaster/index.ts` — the only implemented connector
* `packages/connectors/src/index.ts` — what is exported

### Normalisation

* `packages/core/src/normalise/dbNormalise.ts` — or its new location after prompt 02
* `packages/core/src/normalise/dbNormalise.test.ts`
* `packages/core/src/normalise/ticketmaster-fixture-e2e.integration.test.ts`

### Database

Inspect **all files** in:

* `supabase/migrations/`

For these objects specifically, report the effective state after all migrations:

* `sources`
* `external_events`
* `events`
* `ingest_runs`
* `ingest_alerts`
* `source_type_category_map`
* `venues`
* relevant SQL functions/RPCs such as `resolve_venue`, `auto_create_venue`, and
  dedupe-related functions
* relevant RLS policies
* relevant CHECK constraints

Also inspect:

* `supabase/seed.sql` — what sources are seeded; check `enabled` status and source label
* `supabase/tests/mvp_seed_test.sql`
* `supabase/tests/rls_internal_tables_test.sql`

### Shared

* `packages/shared/src/db/upsertExternalEvents.ts`
* `packages/shared/src/db/upsertExternalEvents.test.ts`
* `packages/shared/src/db/publicQueries.ts`
* `packages/shared/src/db/publicQueries.test.ts`

---

## Task Instructions

This is an inspection task only. Do not write production code.

Answer each of the following questions by citing specific file paths and line numbers.
Do not speculate. If something is not verifiable from the code, say:

> Not determinable from code inspection.

If a finding depends on database schema, include the effective-schema reasoning from all
migrations, not only the initial migration.

---

### 1. What connectors are wired?

In `trigger/tasks/sweep.ts`, which connectors are instantiated and passed to
`runSweepIntegration`?

For each connector, state:

* connector slug
* implementation file
* required environment variables
* whether it is exported from `packages/connectors/src/index.ts`

---

### 2. What sources are in the database?

In `supabase/seed.sql` and all migrations, identify every row inserted or updated in
the `sources` table.

For each source, report the effective value of:

* `slug`
* `name`
* `source_type`
* `tier`
* `enabled`
* `config`
* whether it is inserted by migration or seed
* whether later migrations alter it

A source with `enabled = false` will not run in the sweep. Confirm which sources are
enabled after all migrations and seed are applied.

---

### 3. What schedule exists?

In `trigger/trigger.config.ts`, is the sweep task scheduled?

If so, report:

* cron schedule
* timezone
* task name/id
* whether the schedule is committed in code or only expected to exist in the Trigger.dev
  dashboard

If not, state clearly that live ingestion requires manual triggering or dashboard
configuration.

---

### 4. What data is written per sweep run?

For a successful sweep run with N events parsed, trace exactly what is written to the
database:

* `external_events` rows

  * upserted by which key?
  * which function writes them?
* `ingest_runs` rows

  * one per source or one per sweep?
  * which function writes them?
* `ingest_alerts` rows

  * under what conditions?
  * which alert types can be emitted?
  * are those alert types accepted by the effective DB constraint?
* `events` rows

  * created/updated via which normalisation function?
  * upserted by which key?
  * how is `visibility` determined?

Cite the specific function and file for each write.

---

### 5. What is the break detection threshold?

In `packages/core/src/ingest/orchestrate.ts`, report:

* the parsed_count drop threshold that triggers an alert
* the rolling window used for historical comparison
* how cold-start zero is handled
* which alert types are emitted
* whether each emitted alert type is accepted by the effective `ingest_alerts.alert_type`
  CHECK constraint after all migrations

---

### 6. What happens when one connector fails?

Trace the error handling path in `orchestrate.ts`.

If `connector.run()` throws or returns errors:

* Does the sweep task continue for other connectors?
* What is written to `ingest_runs`?
* What is written to `ingest_alerts`?
* Does the sweep task itself throw, or does it return with errors captured in run records?

---

### 7. What is the service-role key boundary?

Confirm where `SUPABASE_SERVICE_ROLE_KEY` is used.

Specifically verify:

* whether it is only used in `trigger/tasks/sweep.ts`
* whether it appears anywhere in `apps/web`
* whether Astro/frontend code uses only the public anon key

State the specific files and lines.

---

### 8. What is proven by tests vs. only wired?

Fill in this table from actual test files, not README claims.

| Behaviour                                           | Proven by tests | Only wired (untested) | Not wired |
| --------------------------------------------------- | --------------- | --------------------- | --------- |
| Ticketmaster fixture parsing                        |                 |                       |           |
| Ticketmaster fixture E2E path through real Supabase |                 |                       |           |
| Connector result → external_events upsert           |                 |                       |           |
| Break detection threshold calculation               |                 |                       |           |
| cold_start_zero schema/code contract                |                 |                       |           |
| Ingest run record construction                      |                 |                       |           |
| One connector fails, others continue                |                 |                       |           |
| Normalisation: title → dedupe key                   |                 |                       |           |
| Normalisation: external_events → events DB write    |                 |                       |           |
| Normalisation: confidence scoring gates visibility  |                 |                       |           |
| resolve_venue RPC against real DB                   |                 |                       |           |
| auto_create_venue RPC against real DB               |                 |                       |           |
| Sweep task Trigger.dev schedule registered          |                 |                       |           |
| Live TICKETMASTER_API_KEY required in env           |                 |                       |           |
| Live Ticketmaster API response → DB → public query  |                 |                       |           |

---

### 9. What is NOT proven?

List behaviours that are wired but have no test coverage.

Be specific about what is missing, for example:

* live Ticketmaster API response shape
* Trigger.dev runtime execution
* Trigger.dev schedule
* real environment variables in Trigger.dev
* live source config
* venue resolution for unknown venues
* source category mapping coverage for real Glasgow events
* image attribution path from backend to frontend
* public visibility after live sweep

Do not list the Ticketmaster fixture E2E path as unproven if the integration test has
been run and reported green in the current branch.

---

### 10. What would break first in production?

Based on the wiring review, identify the three to five most likely failure modes if a
live Ticketmaster sweep were triggered today.

For each, include:

* what fails
* why it fails
* what the symptom would be
* whether it is a blocker before manual smoke test, blocker before production schedule,
  or non-blocking follow-up

Examples to consider:

* missing `TICKETMASTER_API_KEY`
* no enabled Ticketmaster source row
* missing or incomplete source config
* no Trigger.dev schedule
* missing category map entry
* venue resolution failure
* all events landing as draft
* image attribution not surfaced on frontend
* rate limits or unexpected live API response shape

Do not include `cold_start_zero` DB constraint as a blocker unless you verify against
the effective schema after all migrations that it is still invalid.

---

## Non-Goals

* Do not implement production code.
* Do not add new connectors.
* Do not change migration files.
* Do not add Trigger.dev schedules.
* Do not enable Ticketmaster.
* Do not add or use a live Ticketmaster API key.
* Do not run live ingestion.

---

## Validation Commands

For inspection only:

```bash
git status --short
find trigger -name "*.ts" | sort
find packages/core/src/ingest -name "*.ts" | sort
find supabase/migrations -maxdepth 1 -type f | sort
pnpm --filter @clydeculture/core test
```

If local Supabase is available and already configured, also run:

```bash
supabase db test
```

Do not fail the review solely because `ticketmaster-fixture-e2e.integration.test.ts`
requires Supabase env vars. If it is skipped or gated because env vars are missing,
report that honestly as an environment requirement.

---

## Required Output Format

### Summary

Two to three sentences: what is the sweep's current state? What is proven, what is
only wired, and what is missing?

### Effective Schema Notes

Summarise any schema objects relevant to the review whose final state differs from the
initial migration because of later migrations.

At minimum, include:

* `ingest_alerts.alert_type` CHECK constraint
* `sources` rows and config
* relevant RLS policies or RPCs if later migrations changed them

### Wiring Review Questions 1–7

Answer each numbered question with file path and line number citations.

### Test Coverage Table Question 8

Fill the table from code inspection and test results.

### Unproven Behaviours Question 9

Specific list of behaviours that have no test coverage or have only mock coverage.

### Most Likely Production Failure Modes Question 10

Three to five items, each with:

* what fails
* why it fails
* symptom
* severity/scope

### Recommended Next Steps

Ordered list of what should be done before live ingestion is enabled, referencing
specific prompt files where applicable.

Separate recommendations into:

1. Before manual live Ticketmaster smoke test.
2. Before scheduled production ingestion.
3. Later hardening.

---

## Acceptance Criteria

* All ten questions are answered with file path and line number citations.
* The test coverage table is based on reading actual test files, not README claims.
* Effective schema is evaluated after all migrations, not from the initial migration only.
* Any claimed schema mismatch cites the initial definition and any later migration that
  changes or confirms the final state.
* `cold_start_zero` is not reported as a blocker unless it is invalid in the effective
  migrated schema.
* Service-role key boundary is confirmed: trigger only, not apps/web.
* No production code is written.
