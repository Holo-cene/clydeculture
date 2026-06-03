# Testing

This document describes the testing strategy for the Clyde Culture engine. It covers
what to test, how to select the right test first, and provides concrete example prompts
for each package.

See `CLAUDE.md` for the two-step test-first policy that governs all implementation work.

---

## Principles

Testing here is not generic TDD. The goal is to prevent AI-agent regressions: every
change begins by identifying the behaviours affected, choosing the most relevant existing
or new tests, and writing those tests before any production code is touched.

The smallest meaningful test is preferred over a comprehensive suite written in one pass.
Each test must prove something specific about a contract — not just exercise a code path.

---

## packages/core

`packages/core` contains the normalisation, deduplication, and festival detection logic.
These functions are pure or near-pure and are the highest-value test targets in the engine.
A regression here silently corrupts the canonical event index.

### Functions to develop test-first

| Function | File | Why it matters |
|---|---|---|
| `normaliseTitle()` | `normalise/` | Title normalisation feeds the dedupe key — silent drift corrupts cross-source dedup |
| `normaliseVenueName()` | `normalise/` | Venue matching across sources depends on consistent output |
| `deriveDedupeKey()` | `dedupe/` | The SHA-256 key is the cross-source dedup contract — any change breaks dedup silently |
| `mapSourceCategoryToEventType()` | `normalise/` | Category mapping governs taxonomy; wrong mappings misclassify events permanently |
| `calculateConfidence()` | `normalise/` | Confidence gates frontend visibility — an off-by-one here hides or shows the wrong events |
| `detectFestival()` | `festivals/` | Festival detection affects grouping and display |
| `mergeExternalEventIntoCanonicalEvent()` | `dedupe/` | Merge logic governs which source wins when records collide — must prefer API over scrape |

### Example Step 1 prompt — `deriveDedupeKey`

```text
Implement this test first. Do not implement production code yet.

Test target:
packages/core/src/dedupe/dedupe.test.ts

Behaviour:
- Same venue, same normalised title, and same time bucket produce the same dedupe key.
- Different venue produces a different dedupe key.
- Same event outside the configured time bucket produces a different dedupe key.
- Title punctuation, casing, and repeated whitespace do not change the title component.
- Null or missing required fields are handled explicitly rather than silently producing a misleading key.

After writing the test, stop and show me:
1. the test file,
2. your analysis of what the test proves,
3. what edge cases remain uncovered,
4. the command to run it.

Do not implement production code.
```

Follow-up prompt:

```text
Now implement the smallest production code needed to pass this test. Run the test and report the result.
```

---

## packages/connectors

`packages/connectors` contains modular source connectors. The contract each connector
must satisfy is defined in `connector.ts`. Tests here validate the shape of results and
the stability of identifiers — not the external API itself.

### Behaviours to develop test-first

- Connector result includes `source_id`, `fetched_count`, parsed records, and `errors`
- Each parsed record has a stable `externalId` that does not change between runs
- Each parsed record has a required `externalUrl` pointing back to the source
- Link-first compliance: link-only sources must not store full descriptions or copied images
- Fixture parsing: given a known raw payload, the parser produces the expected record shape
- Errors are returned as structured values rather than thrown exceptions
- A broken connector cannot crash the orchestrator

### Example Step 1 prompt — connector contract

```text
Implement this test first. Do not implement production code yet.

Test target:
packages/connectors/src/__tests__/connector-contract.test.ts

Behaviour:
- A connector result includes source id, fetched count, parsed records, and errors.
- Each parsed record has a stable externalId and required externalUrl.
- Link-first sources must not store full descriptions or copied images.
- Connector failures are returned as structured errors rather than thrown.

After writing the test, stop and show me the test file with code analysis.
```

---

## trigger/ (ingestion tasks)

The Trigger.dev tasks in `trigger/` orchestrate connectors and write to Supabase.
Tests here cover orchestration logic and idempotency, not external network calls.
Use fixture connectors and a test database or mocked Supabase client.

### Behaviours to develop test-first

- One connector fails while the remaining connectors continue to run
- An `ingest_runs` row is created for every connector run, pass or fail
- `last_seen_at` is updated when an external event is re-ingested
- New external events are inserted with the correct fields
- Existing external events are updated idempotently (upsert by `source_id, external_id`)
- A `parsed_count` drop greater than the configured threshold creates an `ingest_alert`
- Disabled sources are skipped entirely
- Partial connector failure does not corrupt canonical events

### Example Step 1 prompt — orchestrator

```text
Implement this test first. Do not implement production code yet.

Test target:
trigger/src/__tests__/orchestrator.test.ts

Behaviour:
- The orchestrator runs all enabled connectors.
- If one connector fails, the remaining connectors still run.
- Every connector produces an ingest_runs record.
- Failed connectors record structured errors.
- Successful connectors upsert external_events.
- A parsed_count drop greater than the configured threshold creates an ingest_alert.

After writing the test, stop and show me the test file with code analysis.
```

---

## packages/shared

`packages/shared` contains types, taxonomy enums, config, and the database client.
These rarely need behavioural tests, but type-level tests (using `tsd` or `expect-type`)
are appropriate when a type change could silently break callers in other packages.

---

## supabase/

Schema and RLS tests go in `supabase/tests/`. These are the only tests that must run
against a real (local) Supabase instance — do not mock the database for schema tests.

Key test targets:

- `visibility = 'published'` RLS policy: the anon key must not see unpublished events
- Dedup key uniqueness constraint on `external_events`
- Migration idempotency: re-running a migration must not corrupt data

---

## Running tests

```bash
# All packages
pnpm test

# Single package
pnpm --filter @clyde-culture/core test
pnpm --filter @clyde-culture/connectors test

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

---

## What not to test

- External APIs and live network calls — use fixtures or recorded responses
- Supabase internals — test your query logic, not the ORM
- Implementation details that are not part of the public contract of a function
- The Astro frontend until the CC-NEW-1 schema migration has been applied
