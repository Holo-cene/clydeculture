# C4 — Pin Venue Normalisation Consistency

## Status
Open

## Purpose
The TypeScript `normaliseVenueName()` function and the SQL `resolve_venue()` function must produce identical output for the same input. After A1 aligns `resolve_venue()` to match the TypeScript algorithm, a failing test is needed to confirm they agree. Without this test, schema drift or TypeScript changes could silently break venue deduplication. This task adds tests to the existing normalise test file to pin the TypeScript output for four canonical venue name examples.

**TDD step 1 only** — add tests, stop. Do not fix the implementation.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: normaliser code, venue deduplication
- Can run in parallel: yes (independent of C2, C3)
- Must run after: none (tests can be written independently of A1, though they reference its requirements)
- Must run before: normaliser implementation

## Files to inspect first
- `packages/core/src/normalise/normalise.test.ts` — existing venue normalisation tests
- `docs/NORMALISATION.md` — normaliseVenueName() algorithm specification
- `packages/core/src/normalise/` — check what `normaliseVenueName` exports currently

## Files allowed to edit
- `packages/core/src/normalise/normalise.test.ts` — add venue normalisation test cases

## Files not allowed to edit
- Production source files under `packages/core/src/normalise/`
- `docs/NORMALISATION.md`
- Any migration files

## Non-goals
- Do not fix the implementation if the tests fail.
- Do not align `resolve_venue()` SQL here (that is A1).
- Do not test the SQL function from TypeScript.

## Required steps
1. Read `packages/core/src/normalise/normalise.test.ts` to understand the existing test structure and whether venue tests already exist.
2. Read `docs/NORMALISATION.md` for the `normaliseVenueName()` algorithm.
3. Add the following test cases to `normalise.test.ts` (under a `normaliseVenueName` describe block):
   - `"St Luke's"` → `"st lukes"`
   - `"SWG3 (Glasgow)"` → `"swg3 glasgow"`
   - `"  The Old Hairdresser's  "` → `"the old hairdressers"`
   - `"Mono   Bar"` → `"mono bar"`
4. Add a comment in the test file noting that these same pairs must be valid for `resolve_venue()` SQL after A1.
5. Add a note: connectors must pass raw venue names to the normaliser — pre-normalised names break alias lookup.
6. Run the tests and check whether they pass or fail (they may already pass if normaliseVenueName is correctly implemented; if so, this is a green confirmation, not a red test).

## Test command / verification
```bash
cd packages/core && pnpm test
# or
pnpm --filter @clyde-culture/core test
```

## Acceptance criteria
- [ ] All four venue name pairs are tested in `normalise.test.ts`.
- [ ] Comment notes SQL equivalence requirement and the raw-input connector requirement.
- [ ] If tests fail (red): implementation gap is reported.
- [ ] If tests pass (green): confirmed that existing implementation already handles these cases.

## Stop condition
Stop after adding tests and running them. Report:
- whether the tests pass or fail and why
- current implementation of `normaliseVenueName` (brief summary)
- any venue names where the algorithm is ambiguous
- recommended next prompt: if green, proceed to C2; if red, `Implement docs/tasks/phase-0.5/C4-venue-normalisation-red-tests.md step 2. Now implement the smallest production code needed to pass this test.`
