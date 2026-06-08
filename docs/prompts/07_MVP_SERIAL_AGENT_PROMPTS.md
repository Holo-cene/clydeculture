# MVP Serial Agent Prompts

Use these prompts one at a time after reviewing `docs/prompts/06_MVP_BUILD_PLAN.md`.
Behaviour-changing work must follow `AGENTS.md`: red test first, stop, then smallest
production implementation after the exact follow-up instruction.

Do not run these prompts in parallel unless a later plan explicitly changes the agent
strategy. The chosen MVP approach is serial TDD.

---

## Review Gate After Every Agent

After each agent finishes:

1. Inspect `git status --short`.
2. Review the changed files.
3. Run the targeted test command the agent reports.
4. Run the relevant package or Supabase test suite.
5. For implementation steps, also run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
6. Keep Ticketmaster disabled until runtime secrets and Trigger deployment are ready.

---

## Agent 0 - MVP Prompt Files

Status: this task creates `docs/prompts/06_MVP_BUILD_PLAN.md` and this file.

No production code, tests, migrations, or frontend files should be changed in Agent 0.

---

## Agent 1 - Public Submission Gate Tests

```text
Read AGENTS.md, docs/PUBLISHING.md, docs/TESTING.md, and the Supabase migration files.

Task: write red SQL tests only for the public event_submissions insert gate and RLS
boundaries required before exposing the public form.

Files to inspect:
- supabase/migrations/20260531000000_schema_v5_initial.sql
- supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql
- supabase/tests/rls_internal_tables_test.sql
- docs/tasks/phase-0.5/F1-public-submission-gate.md

Allowed edits:
- supabase/tests/rls_internal_tables_test.sql
- a new supabase/tests/*_test.sql file if keeping the submission gate separate is clearer

Specify:
- anon can insert a minimal valid public submission with title and start_at
- anon cannot read event_submissions rows
- anon cannot set status, reviewed_at, reviewed_by, or event_id
- inserted anon submissions always remain status = 'pending'
- blank title and missing start_at are rejected by existing or new constraints

Do not edit migrations or production code.
Do not mutate remote Supabase state.
If Supabase MCP is authenticated, use it only for read-only inspection and mention the
finding; if it is unavailable, continue from migration-file evidence.

Run:
supabase db test

Stop after the red tests and report the required Step 1 checklist.
```

## Agent 2 - Public Submission Gate Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- supabase/migrations/20260531000000_schema_v5_initial.sql
- supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql
- supabase/tests/rls_internal_tables_test.sql
- docs/PUBLISHING.md

Allowed edits:
- supabase/migrations/<new timestamp>_event_submissions_public_gate.sql
- supabase/tests/rls_internal_tables_test.sql only if the red test needs a small correction
- docs/PUBLISHING.md only if implementation changes the documented public policy

Keep the change narrow:
- do not edit old migrations
- replace the unrestricted anon insert policy with a constrained policy
- use constraints or policy checks so anon cannot set moderation/review fields
- preserve anon SELECT denial
- do not add rate limiting or CAPTCHA in this step

Run:
supabase db reset
supabase db test
pnpm test
pnpm typecheck
pnpm lint
```

---

## Agent 3 - Canonical Persistence Tests

```text
Read AGENTS.md, docs/NORMALISATION.md, docs/DEDUPLICATION.md, docs/PUBLISHING.md,
and the current core/shared DB files.

Task: write red tests only for DB-backed normalisation from external_events to
canonical events.

Files to inspect:
- packages/core/src/normalise/normalise.ts
- packages/core/src/normalise/canonical.test.ts
- packages/shared/src/db/upsertExternalEvents.ts
- packages/shared/src/db/client.ts
- supabase/migrations/*.sql

Choose the smallest test target in packages/shared or packages/core. Prefer a pure
row-mapping/persistence helper test with an injected Supabase-like client over a live DB
unit test.

Specify:
- reads unlinked external_events rows for a source
- maps source_type_category_map semantics into event_type_id/eventTypeSlug
- upserts events by dedupe_key
- writes title, normalised_title, source_url, ticket_url, ticket_url_label, image_url,
  start_at, timezone, venue_id, primary_source_id, confidence, confidence_inputs,
  needs_review, and visibility
- never copies full descriptions from external_events.raw into events.description
- links external_events.event_id to the canonical event id
- auto-publishes only when confidence >= 60, needs_review = false, and
  sources.config.auto_publish = true
- leaves events as draft otherwise

Do not implement production code.
Do not add schema changes.
Do not enable Ticketmaster.

Stop after the red tests and report the Step 1 checklist.
```

## Agent 4 - Canonical Persistence Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- packages/core/src/normalise/normalise.ts
- packages/core/src/index.ts
- packages/shared/src/db/upsertExternalEvents.ts
- packages/shared/src/index.ts
- the red test from Agent 3

Allowed edits:
- packages/core/src/normalise/* if the persistence helper belongs in core
- packages/shared/src/db/* if the persistence helper belongs with Supabase helpers
- package index exports as needed

Keep implementation scoped to the Ticketmaster MVP path:
- no fuzzy dedupe implementation
- no festival detection implementation
- no public submission moderation implementation
- no new dependencies
- no live network calls

Run the targeted test, then:
pnpm --filter @clydeculture/core test
pnpm --filter @clydeculture/shared test
pnpm test
pnpm typecheck
pnpm lint
```

---

## Agent 5 - Trigger Sweep Integration Tests

```text
Read AGENTS.md, docs/INGESTION.md, docs/TESTING.md, trigger/tasks/sweep.ts, and the
existing pure orchestrator tests.

Task: write red tests only for the Trigger sweep integration boundary.

Files to inspect:
- trigger/tasks/sweep.ts
- trigger/trigger.config.ts
- packages/core/src/ingest/orchestrate.ts
- packages/core/src/ingest/orchestrate.test.ts
- packages/connectors/src/api/ticketmaster/index.ts
- packages/shared/src/db/upsertExternalEvents.ts

Because trigger/ is not currently a workspace-tested package, prefer extracting a small
pure adapter function into a workspace package and testing that function rather than
testing Trigger.dev internals directly.

Specify:
- enabled sources are loaded and disabled sources are skipped
- registered connectors are selected by source slug
- connector output is upserted to external_events
- ingest run drafts are persisted
- normalisation is invoked after successful external upsert
- alert drafts are persisted
- one connector failure does not prevent another source from running
- no source is enabled as part of the test

Do not implement production code.
Do not add Trigger scheduling.
Do not call the live Ticketmaster API.

Stop after the red tests and report the Step 1 checklist.
```

## Agent 6 - Trigger Sweep Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- trigger/tasks/sweep.ts
- trigger/trigger.config.ts
- packages/core/src/ingest/orchestrate.ts
- packages/connectors/src/api/ticketmaster/index.ts
- packages/shared/src/db/client.ts
- packages/shared/src/db/upsertExternalEvents.ts
- the red test from Agent 5

Allowed edits:
- trigger/tasks/sweep.ts
- packages/core/src/ingest/* for a pure adapter if the red test chose that location
- packages/shared/src/db/* for small DB persistence helpers
- package index exports as needed

Keep implementation narrow:
- register Ticketmaster only
- read env vars at runtime only
- never commit secrets
- do not flip the Ticketmaster source enabled flag
- do not add new dependencies

Run the targeted test, then:
pnpm test
pnpm typecheck
pnpm lint
```

---

## Agent 7 - Public Query Helper Tests

```text
Read AGENTS.md, docs/PUBLISHING.md, docs/BRAND_VOICE.md, and ADR 0001.

Task: write red tests only for shared Supabase query helpers used by the Astro app.

Files to inspect:
- packages/shared/src/db/client.ts
- packages/shared/src/index.ts
- docs/PUBLISHING.md
- docs/decisions/0001-frontend-architecture.md

Allowed edits:
- packages/shared/src/db/publicQueries.test.ts

Specify:
- getPublishedEvents constrains visibility to published and confidence >= 60
- date range filters produce start_at lower/upper bounds
- event type, venue, and festival filters use canonical columns or joins that exist
  in the schema
- tonight and this-weekend inputs are date-range helpers, not special database states
- getEventBySlug returns one published event by slug
- getVenueBySlug reads only active/temporary public venues
- query helpers never require or mention a service role key

Do not implement production code.
Do not add dependencies.

Stop after the red tests and report the Step 1 checklist.
```

## Agent 8 - Public Query Helper Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- packages/shared/src/db/publicQueries.test.ts
- packages/shared/src/db/client.ts
- packages/shared/src/index.ts
- docs/PUBLISHING.md

Allowed edits:
- packages/shared/src/db/publicQueries.ts
- packages/shared/src/index.ts

Keep implementation narrow:
- use the existing Supabase client shape
- no service role assumptions
- no extra dependencies
- keep returned data close to schema fields; do not invent denormalised frontend-only
  records unless the test requires them

Run:
pnpm --filter @clydeculture/shared test -- src/db/publicQueries.test.ts
pnpm --filter @clydeculture/shared test
pnpm test
pnpm typecheck
pnpm lint
```

---

## Agent 9 - Astro MVP App

```text
Read AGENTS.md, docs/BRAND_VOICE.md, docs/PUBLISHING.md, ADR 0001, and apps/web/README.md.

Task: scaffold the Astro app and build the MVP public pages.

Prerequisites:
- CC-NEW-1 and submission-gate migrations have passed `supabase db reset`.
- RLS tests have passed `supabase db test`.
- Astro dependency approval is granted by docs/prompts/06_MVP_BUILD_PLAN.md.

Allowed edits:
- apps/web/**
- package.json / pnpm-lock.yaml only for Astro and required first-party Astro setup
- packages/shared only if a tiny query-helper adjustment is required and covered by tests

Build:
- event listing page with date range, event type, and venue filters
- event detail page by slug
- tonight page using date-range filter helper
- this weekend page using date-range filter helper
- venue page by slug
- public submission form that inserts only public-safe fields

Constraints:
- use @clydeculture/shared query helpers
- no service role key in apps/web
- no extra UI, styling, validation, map, or icon dependency without approval
- no ranking language or hype adjectives
- source links must route users back to the original listing

Verification:
pnpm --filter @clydeculture/web build
pnpm test
pnpm typecheck
pnpm lint

Then run the local dev server and verify the MVP pages in the in-app browser.
```
