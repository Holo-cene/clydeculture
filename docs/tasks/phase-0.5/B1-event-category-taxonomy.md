# B1 — Align EventCategory with SQL event_types Slugs

## Status
Complete

## Purpose
The current TypeScript `EventCategory` enum (or equivalent) uses 8 values (`Music`, `Arts`, `Talk`, `Festival`, etc.) that match none of the 13 canonical SQL `event_types.slug` values. Every downstream type-check, category-mapping test, and confidence calculation that references event type values will produce incorrect or unmatchable results until this is fixed. This is a prerequisite for C2 (confidence tests), C3 (category mapping tests), and B5 (seed migration).

The canonical SQL slugs are:
`live_music`, `club_night`, `comedy`, `theatre`, `arts_exhibition`, `workshop`, `talk_lecture`, `film`, `family`, `sport`, `community_meetup`, `food_drink`, `other`

**TDD step 1 only** — write or update a failing type-level test first. Do not change the production enum until the test exists.

## Classification
- Type: red-tests-only (step 1 of a two-step TDD task)
- Blocks: connector code, normaliser code, C2, C3, B5
- Can run in parallel: yes (independent of B2, B3, B4, D-group, H1)
- Must run after: none
- Must run before: B5, C2, C3

## Files to inspect first
- `packages/shared/src/enums/taxonomy.ts` — current enum definition
- `packages/shared/src/types/` — any existing type tests
- `docs/reference/SCHEMA_v5.sql` — confirm the 13 `event_types.slug` values
- `packages/core/src/normalise/normalise.test.ts` — check if category values appear in existing tests

## Files allowed to edit
- `packages/shared/src/enums/taxonomy.test.ts` (new) — type-level or runtime test asserting SQL slug alignment
- `packages/shared/src/types/confidence.ts` (new, stub only) — only if needed to unblock a type test

## Files not allowed to edit
- `packages/shared/src/enums/taxonomy.ts` — production code; do not touch in step 1
- Any connector implementations
- Any migration files
- `packages/core/` source files

## Non-goals
- Do not replace the enum in step 1. That is step 2.
- Do not rename or delete old values yet.
- Do not implement `mapSourceCategoryToEventType()`.
- Do not add UI grouping logic.

## Required steps
1. Read `packages/shared/src/enums/taxonomy.ts` and note the current enum values.
2. Read `docs/reference/SCHEMA_v5.sql` and confirm the 13 `event_types.slug` values listed above are present.
3. Write `packages/shared/src/enums/taxonomy.test.ts` with a test that:
   - Imports the current `EventCategory` (or equivalent type/enum) from `taxonomy.ts`.
   - Asserts that the set of values exactly equals the 13 SQL slugs.
   - The test must fail with the current 8-value enum.
4. Note in the test file which old values (`Music`, `Arts`, `Talk`, `Festival`) must not remain as canonical event type values.
5. Run the test and confirm it fails (red state).

## Test command / verification
```bash
cd packages/shared && pnpm test
# or
pnpm --filter @clyde-culture/shared test
```

## Acceptance criteria
- [x] `packages/shared/src/enums/taxonomy.test.ts` exists.
- [x] Test asserts exactly the 13 SQL slugs.
- [x] Test was red before step 2 — old 8-value enum did not match.
- [x] Step 2 implemented: `taxonomy.ts` updated to 13 SQL slugs; test passes green.

## Completion notes
- **Step 1 (red test):** `taxonomy.test.ts` written asserting `Set(Object.values(EventCategory))` equals the 13 SQL slugs. Failed with `Set{'music','arts',…(6)}` ≠ expected.
- **Step 2 (implementation):** `EventCategory` enum replaced with 13 PascalCase keys mapping to SQL slug values (`LiveMusic = 'live_music'`, etc.). Old broad values `music`, `arts`, `community`, `food`, `talk`, `festival` removed.
- **Test result:** 1/1 passed. `pnpm --filter @clydeculture/shared test` green.
- **Unblocks:** B5, C2, C3.

## Stop condition
Stop after writing the failing test and confirming it fails. Do not change `taxonomy.ts`. Report:
- files inspected
- files changed
- test command run and output
- current enum values found
- recommended next prompt: `Implement docs/tasks/phase-0.5/B1-event-category-taxonomy.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
