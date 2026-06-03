# Testing

This document describes the testing strategy for the Clyde Culture engine. It covers
what to test, how to select the right test first, and provides concrete example prompts
for each package.

See `CLAUDE.md` for the two-step test-first policy that governs all implementation work.

**Test framework: Vitest v2.** All packages use `vitest run`. Test files use the `.test.ts` suffix and live alongside (or in subdirectories of) the source they test.

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

| Function | Production file | Test file | Why it matters |
|---|---|---|---|
| `normaliseTitle()` | `packages/core/src/normalise/normalise.ts` | `packages/core/src/normalise/normalise.test.ts` | Title normalisation feeds the dedupe key — silent drift corrupts cross-source dedup |
| `normaliseVenueName()` | `packages/core/src/normalise/normalise.ts` | `packages/core/src/normalise/normalise.test.ts` | Venue matching across sources depends on consistent output |
| `deriveDedupeKey()` | `packages/core/src/dedupe/dedupe.ts` | `packages/core/src/dedupe/dedupe.test.ts` | The SHA-256 key is the cross-source dedup contract — any change breaks dedup silently |
| `mapSourceCategoryToEventType()` | `packages/core/src/normalise/normalise.ts` | `packages/core/src/normalise/normalise.test.ts` | Category mapping governs taxonomy; wrong mappings misclassify events permanently |
| `calculateConfidence()` | `packages/core/src/normalise/normalise.ts` | `packages/core/src/normalise/normalise.test.ts` | Confidence gates frontend visibility — an off-by-one here hides or shows the wrong events |
| `detectFestival()` | `packages/core/src/festivals/festivals.ts` | `packages/core/src/festivals/festivals.test.ts` | Festival detection affects grouping and display |
| `mergeExternalEventIntoCanonicalEvent()` | `packages/core/src/dedupe/dedupe.ts` | `packages/core/src/dedupe/dedupe.test.ts` | Merge logic governs which source wins when records collide — must prefer API over scrape |

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

`trigger/` is a **Trigger.dev v3 project**, not a pnpm workspace package.
`pnpm-workspace.yaml` does not include it, so `pnpm test` and `pnpm --filter` do not
reach it. Trigger tasks cannot be unit-tested with the standard vitest setup.

**How to test ingestion logic:**

- Extract pure orchestration logic (connector dispatch, error handling, break detection)
  into `packages/core` or a dedicated workspace package, then test it there with Vitest.
- Integration tests against a real Supabase instance belong in `supabase/tests/`.
- End-to-end trigger runs use `npx trigger.dev@latest dev` and the Trigger.dev dashboard.

### Behaviours to develop test-first (extract into packages/core)

The following behaviours should be implemented as pure functions testable without
Trigger.dev or Supabase, then called from trigger tasks:

- One connector fails while the remaining connectors continue (orchestrator loop)
- `parsed_count` drop threshold detection (break detection function)
- `ingest_runs` record construction (data mapping, not DB write)
- Idempotent upsert key derivation (`source_id` + `external_id`)

Once extracted into a workspace package, use the same Step 1 / Step 2 workflow as
any other function in `packages/core`.

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
pnpm --filter @clydeculture/core test
pnpm --filter @clydeculture/connectors test

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
