# C1 — Implement validate.ts Test-First

## Status
Complete

## Purpose
`packages/connectors/src/connector.test.ts` already imports from `./validate.js`, which does not exist. This breaks all connector tests. This task reviews the existing tests, fills any coverage gaps, then stops. The implementation of `validate.ts` itself happens in step 2. Once `validate.ts` exists and all connector tests pass, `index.ts` must export both `validateIngestResult` and `isValidHttpsUrl`.

**TDD step 1 only** — review and complete tests, stop.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: all connector code (tests are currently broken)
- Can run in parallel: yes (after B3 SourceType is confirmed, but tests can be written independently)
- Must run after: none (the test file already exists with broken imports)
- Must run before: all connector implementations

## Files to inspect first
- `packages/connectors/src/connector.test.ts` — existing tests, especially validate imports
- `packages/connectors/src/validate.ts` — check if it already exists (the git status suggests it does)
- `packages/connectors/src/index.ts` — check current exports
- `packages/connectors/src/connector.ts` — check `ConnectorResult` and `RawEvent` types

## Files allowed to edit
- `packages/connectors/src/connector.test.ts` — add missing test cases only

## Files not allowed to edit
- `packages/connectors/src/validate.ts` — if it exists, read it but do not edit production logic (step 2)
- `packages/connectors/src/index.ts` — step 2 only
- Any migration files

## Non-goals
- Do not implement `validateIngestResult` or `isValidHttpsUrl` production logic yet.
- Do not add connector-specific logic to validate.ts.
- Do not change `connector.ts` types in this pass.

## Required steps
1. Read `packages/connectors/src/connector.test.ts` in full.
2. Read `packages/connectors/src/validate.ts` if it exists (git status shows it does — check contents).
3. Read `packages/connectors/src/index.ts` for current exports.
4. Assess whether the existing tests cover all of:
   - Rejecting a result with missing `externalUrl`
   - Rejecting a result with a non-HTTPS URL (e.g. `http://`, `ftp://`, empty string)
   - Accepting a result with a valid HTTPS URL
   - Collecting multiple errors without crashing (i.e. `validateIngestResult` returns an error list, not throws)
   - Edge cases: `externalUrl = undefined`, `externalUrl = "https://"` (malformed), `externalUrl = "HTTPS://..."` (uppercase)
5. Add any missing test cases to `connector.test.ts`.
6. Run the full connector test suite and confirm the validate-related tests are failing (because `validate.ts` doesn't export the expected functions, or the tests are new).

## Test command / verification
```bash
cd packages/connectors && pnpm test
# or
pnpm --filter @clyde-culture/connectors test
```

## Acceptance criteria
- [ ] Tests cover all 5 behaviours listed above.
- [ ] Edge cases for malformed URLs are tested.
- [ ] Tests are currently failing (red) for the validate functions.
- [ ] No production logic is added in this step.

## Stop condition
Stop after reviewing and completing the tests, confirming they fail. Report:
- files inspected
- whether `validate.ts` already exists and what it contains
- which test cases were already present and which were added
- test output showing failures
- ambiguities: if `validate.ts` already exists with partial implementation, note which functions are present
- recommended next prompt: `Implement docs/tasks/phase-0.5/C1-connector-validate-red-tests.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
