# C3 — Pin Category Mapping with Red Tests

## Status
Open

## Purpose
There are no automated tests for `mapSourceCategoryToEventType()`. Without tests, any implementation could return old enum values instead of SQL slugs, silently break the lookup table, or fall back to keyword matching when a direct lookup should have succeeded. This task writes the red test file to lock down the expected mapping behaviour before implementation begins.

**TDD step 1 only** — write the red test file, stop.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: normaliser code
- Can run in parallel: yes (with other C tasks, after B1 and B5 are complete)
- Must run after: B1 (correct slug values), B5 (seed data for lookup assertions)
- Must run before: normaliser implementation

## Files to inspect first
- `packages/core/src/normalise/` — check if `mapSourceCategoryToEventType` already exists
- `docs/NORMALISATION.md` — check if category mapping is specified
- `packages/shared/src/enums/taxonomy.ts` — confirm correct slug values after B1
- `docs/tasks/BE-03.md` — Ticketmaster classification IDs that should map to specific slugs

## Files allowed to edit
- `packages/core/src/normalise/mapSourceCategoryToEventType.test.ts` (new)

## Files not allowed to edit
- Any production source files under `packages/core/src/normalise/`
- Any migration files
- `packages/shared/src/enums/taxonomy.ts`

## Non-goals
- Do not implement `mapSourceCategoryToEventType()`.
- Do not add seed data (that is B5).
- Do not implement the DB lookup — only assert expected behaviour.

## Required steps
1. Read `packages/core/src/normalise/` directory to check if `mapSourceCategoryToEventType.ts` exists.
2. Read `docs/tasks/BE-03.md` for documented Ticketmaster classification IDs.
3. Confirm correct slug values from `packages/shared/src/enums/taxonomy.ts` (post-B1).
4. Create `packages/core/src/normalise/mapSourceCategoryToEventType.test.ts` with tests covering:
   - Direct lookup from `source_type_category_map` for a known Ticketmaster classification ID → returns the correct SQL slug (e.g. `'live_music'`)
   - Keyword fallback for an unmapped category string (e.g. `'experimental electronic'` → `'club_night'` or similar based on keyword)
   - Unknown category with no keyword match → `'other'`
   - Case-insensitive matching (e.g. `'Live Music'` and `'live music'` both work)
   - Return value is always one of the 13 SQL slugs, never an old enum value
5. Run the tests and confirm they fail (the implementation does not exist yet).

## Test command / verification
```bash
cd packages/core && pnpm test
# or
pnpm --filter @clyde-culture/core test
```

## Acceptance criteria
- [ ] `packages/core/src/normalise/mapSourceCategoryToEventType.test.ts` exists.
- [ ] Tests cover direct lookup, keyword fallback, unknown → 'other', case insensitivity.
- [ ] Tests assert SQL slug return values only (no old enum values).
- [ ] Tests are failing (red) because the implementation does not exist.

## Stop condition
Stop after the test file is written and confirmed failing. Report:
- files inspected
- whether `mapSourceCategoryToEventType.ts` already exists
- Ticketmaster IDs used in the tests
- test output showing failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/C3-category-mapping-red-tests.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
