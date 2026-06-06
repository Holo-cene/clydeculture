# B3 — Align SourceType Everywhere

## Status
Complete

## Completion note
- Production fix: `packages/connectors/src/connector.ts` — `SourceType` is `"api" | "rss" | "ical" | "html" | "apify" | "manual"` (all 6 canonical Phase 1 values including `"apify"`). `packages/shared/src/types/source.ts` matches identically.
- Test file: `packages/connectors/src/connector.test.ts` — SourceType sync guard at the `'SourceType canonical values — sync guard'` describe block; includes a bidirectional `AssertEqual` compile-time assertion against the canonical union.
- Both step 1 (red test) and step 2 (production type) are committed.

## Purpose
`SourceType` has two definitions in the codebase (one in `packages/shared`, one in `packages/connectors`) and `'apify'` is missing from at least the connectors definition. The canonical Phase 1 values are: `api | rss | ical | html | apify | manual`. Any connector or ingestion task built before this is fixed will silently reject Apify-sourced records. This task writes a failing test/assertion, then stops.

**TDD step 1 only** — write the failing test, stop.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: connector code (specifically Apify connectors)
- Can run in parallel: yes (independent of B1, B2, B4, D-group, H1)
- Must run after: none
- Must run before: C1, G1

## Files to inspect first
- `packages/connectors/src/connector.ts` — check current `SourceType` definition
- `packages/shared/src/types/` or `packages/shared/src/enums/` — check if a second `SourceType` definition exists
- `packages/connectors/CLAUDE.md` — check for stale "add apify later" notes
- `docs/reference/SCHEMA_v5.sql` — confirm the `sources.source_type` CHECK constraint values

## Files allowed to edit
- `packages/connectors/src/connector.test.ts` — add a sync assertion test (or a new dedicated test file if the existing one is crowded)

## Files not allowed to edit
- `packages/connectors/src/connector.ts` — production code; do not touch in step 1
- `packages/connectors/CLAUDE.md` — cleanup is task H1's responsibility
- Any migration files
- Any shared type files (step 2 only)

## Non-goals
- Do not add `'apify'` to the production type yet.
- Do not remove stale notes from CLAUDE.md (that is H1).
- Do not consolidate the two definitions yet (step 2 only).

## Required steps
1. Read `packages/connectors/src/connector.ts` and note the current `SourceType` definition.
2. Search for any other `SourceType` definition in `packages/shared/` or elsewhere.
3. Read `docs/reference/SCHEMA_v5.sql` and confirm the DB CHECK constraint values for `sources.source_type`.
4. Read `packages/connectors/CLAUDE.md` and note any stale "add apify later" text (for H1 reference).
5. Write a test or assertion in `packages/connectors/src/connector.test.ts` (or a new `packages/connectors/src/source-type.test.ts`) that:
   - Lists all canonical `SourceType` values: `['api', 'rss', 'ical', 'html', 'apify', 'manual']`.
   - Asserts that the TypeScript `SourceType` includes `'apify'`.
   - Ideally asserts that the TS set and the DB CHECK set are identical (this may require importing a hardcoded constant).
   - The test must fail with the current definition.
6. Run the test and confirm it fails (red state).

## Test command / verification
```bash
cd packages/connectors && pnpm test
# or
pnpm --filter @clyde-culture/connectors test
```

## Acceptance criteria
- [ ] A failing test exists that asserts `'apify'` is present in `SourceType`.
- [ ] Test currently fails (red state).
- [ ] The test is written so adding `'apify'` to the production type will make it pass.

## Stop condition
Stop after the failing test is confirmed. Do not change `connector.ts`. Report:
- files inspected
- current `SourceType` values found
- whether two definitions exist and where
- test output showing failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/B3-source-type-sync.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
