# Serial Agent Prompts — Vertical Slice Follow-ups

Use these prompts one at a time. Behaviour-changing tasks must follow the
repository's two-step TDD policy: red test first, then the smallest production
implementation after review.

## Review Gate After Every Agent

After each agent finishes:

1. Inspect `git status --short`.
2. Review the changed files.
3. Run the targeted test command the agent reports.
4. Run the relevant package test suite.
5. For implementation steps, also run `pnpm typecheck` and `pnpm lint`.
6. Keep Ticketmaster disabled until parser, normaliser, and orchestration are ready.

## Agent 1 — Ticketmaster Parser Contract Tests

```text
Read AGENTS.md and the relevant Ticketmaster files.

Task: write red tests only for the Ticketmaster parser contract.

Files to inspect:
- packages/connectors/src/api/ticketmaster/SPEC.md
- packages/connectors/src/api/ticketmaster/parse.ts
- packages/connectors/src/api/ticketmaster/parse.test.ts
- packages/connectors/src/api/ticketmaster/connector.test.ts

Allowed edits:
- packages/connectors/src/api/ticketmaster/parse.test.ts
- packages/connectors/src/api/ticketmaster/connector.test.ts only if connector-level
  error semantics need coverage

Specify:
- startAt fallback from localDate + localTime in Europe/London to UTC
- startAt fallback from localDate only when timeTBA=true
- no-date/dateTBA records are skipped with a diagnostic error at connector level
- tagsGuess from the primary classification genre name, omitting empty/"Undefined"
- imageUrlGuess chooses widest 16:9 >=640, then widest any-ratio >=640, HTTPS only

Do not edit production code.
Do not add dependencies.
Do not call the live Ticketmaster API.

Run:
pnpm --filter @clydeculture/connectors test -- src/api/ticketmaster/parse.test.ts src/api/ticketmaster/connector.test.ts

Stop after the red tests and report the required Step 1 checklist.
```

## Agent 2 — Ticketmaster Parser Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- packages/connectors/src/api/ticketmaster/SPEC.md
- packages/connectors/src/api/ticketmaster/parse.ts
- packages/connectors/src/api/ticketmaster/index.ts
- packages/connectors/src/api/ticketmaster/parse.test.ts
- packages/connectors/src/api/ticketmaster/connector.test.ts

Allowed edits:
- packages/connectors/src/api/ticketmaster/parse.ts
- packages/connectors/src/api/ticketmaster/index.ts only if needed for connector-level
  diagnostic errors

Keep the change narrow:
- implement the required date fallback chain
- implement genre tagsGuess mapping
- implement image fallback selection
- preserve link-first behaviour
- do not enable the Ticketmaster source

Run:
pnpm --filter @clydeculture/connectors test -- src/api/ticketmaster/parse.test.ts src/api/ticketmaster/connector.test.ts
pnpm --filter @clydeculture/connectors test
pnpm typecheck
pnpm lint
```

## Agent 3 — Contract Docs Cleanup

```text
Read AGENTS.md and the current repo status.

Task: docs-only cleanup for current contract drift.

Files to inspect:
- packages/connectors/src/api/ticketmaster/SPEC.md
- docs/DATA_MODEL.md
- docs/tasks/README.md
- docs/tasks/phase-0.5/D3-removal-cancellation-lifecycle-docs.md
- docs/tasks/phase-0.5/README.md

Allowed edits:
- packages/connectors/src/api/ticketmaster/SPEC.md
- docs/DATA_MODEL.md
- docs/tasks/README.md
- docs/tasks/phase-0.5/D3-removal-cancellation-lifecycle-docs.md

Fix only stale status/contract text:
- Ticketmaster segment correction migration is already present
- Ticketmaster connector runner exists but source remains disabled
- source_type includes apify
- event_tags public policy explicitly includes confidence >= 60
- no Phase 1 connector_break alert_type
- top-level task README should not instruct obsolete Sprint 0 gates as current blockers

Do not edit production code.
Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `supabase db test` only if the
documentation change touches schema assumptions; otherwise run a targeted `rg`
consistency check and report it.
```

## Agent 4 — Minimal Canonical Normalisation Tests

```text
Read AGENTS.md and docs/NORMALISATION.md.

Task: write red tests only for the minimal Ticketmaster vertical-slice normalisation path.

Files to inspect:
- docs/NORMALISATION.md
- docs/INGESTION.md
- packages/shared/src/db/upsertExternalEvents.ts
- packages/core/src/normalise/normalise.ts
- packages/core/src/dedupe/dedupe.ts
- supabase/migrations/*.sql

Choose the smallest test target in packages/core.

Specify the minimal path from external event input to a canonical event draft/published
shape:
- title normalisation
- event_type_guess lookup contract using source_type_category_map semantics
- confidence threshold for a Tier 1 event with required fields
- image_url HTTPS validation
- dedupe key from venue_id, UTC hour bucket, normalised title
- no copied descriptions

Do not implement production code.
Do not add schema changes.
Stop after the red tests and report the Step 1 checklist.
```

## Agent 5 — Minimal Canonical Normalisation Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Keep implementation scoped to the minimal Ticketmaster vertical slice. Avoid fuzzy
dedupe, festival detection, moderation workflow, and public submissions.

Run targeted core tests, then:
pnpm --filter @clydeculture/core test
pnpm test
pnpm typecheck
pnpm lint
```

## Agent 6 — G1 Sweep Orchestration Tests

```text
Read AGENTS.md, docs/INGESTION.md, docs/TESTING.md, and
docs/tasks/phase-0.5/G1-trigger-sweep-orchestration.md.

Task: write red tests only for orchestration logic, preferably by extracting the
test target into a workspace-tested package design rather than testing Trigger.dev
internals directly.

Specify:
- one connector throws and others continue
- ingest run row data is constructed with fetched_count, parsed_count, errors_count
- first-ever zero parsed count produces cold_start_zero
- parsed_count < 0.30 * 14-day median produces count_drop
- disabled sources are skipped without run rows

Do not implement production code.
Do not add Trigger scheduling.
Do not enable any source.
Stop after the red tests and report the Step 1 checklist.
```

## Agent 7 — G1 Pure Orchestration Implementation

```text
Now implement the smallest production code needed to pass this test. Run the test
and report the result.

Files to inspect:
- packages/core/src/ingest/orchestrate.test.ts
- docs/INGESTION.md
- docs/TESTING.md
- packages/shared/src/types/source.ts
- packages/core/src/index.ts

Allowed edits:
- packages/core/src/ingest/orchestrate.ts
- packages/core/src/index.ts only if needed for exports

Keep implementation pure and minimal:
- no Supabase client
- no Trigger SDK
- no network
- no source enablement
- no Trigger scheduling

Implement:
- skip disabled sources
- continue after connector failures
- build success, partial, and failed ingest run drafts
- call injected `upsertExternalEvents`
- emit `cold_start_zero` and `count_drop` alert drafts
- use injected clock values for timestamps

Run:
pnpm --filter @clydeculture/core test -- src/ingest/orchestrate.test.ts
pnpm --filter @clydeculture/core test
pnpm test
pnpm typecheck
pnpm lint
```
