# B4 — Expand RawEvent to Match external_events

## Status
Open

## Purpose
The current `RawEvent` interface is missing 7 fields that connectors need to output pricing, availability, ticket URL, image, end time, and doors time. Any connector built against the current interface cannot populate these columns in `external_events`, and ingestion quality will be silently degraded. This task updates connector contract tests so mock connector fixtures can carry all required fields, then stops.

**TDD step 1 only** — update tests/fixtures, stop. Do not change the production interface.

The complete required `RawEvent` field list:
`externalId`, `externalUrl`, `title`, `startAt`, `endAt`, `doorsAt`, `venueName`, `eventTypeGuess`, `tagsGuess`, `priceMinGuess`, `priceMaxGuess`, `isFreeGuess`, `ticketUrlGuess`, `ticketUrlLabelGuess`, `imageUrlGuess`, `availabilityGuess`, `raw`

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: connector code
- Can run in parallel: yes (independent of B1, B2, B3, D-group, H1)
- Must run after: none
- Must run before: C1, G1

## Files to inspect first
- `packages/connectors/src/connector.ts` — current `RawEvent` interface
- `packages/connectors/src/connector.test.ts` — existing fixture shapes
- `docs/CONNECTOR_GUIDE.md` — current `RawEvent` skeleton example
- `docs/reference/SCHEMA_v5.sql` — `external_events` table columns for cross-reference

## Files allowed to edit
- `packages/connectors/src/connector.test.ts` — update mock fixture objects to use all 17 fields

## Files not allowed to edit
- `packages/connectors/src/connector.ts` — production interface; do not touch in step 1
- `docs/CONNECTOR_GUIDE.md` — update is step 2
- Any migration files
- Any other source files

## Non-goals
- Do not add the missing fields to the production `RawEvent` interface yet.
- Do not implement any connector logic.
- Do not change `CONNECTOR_GUIDE.md` yet.

## Required steps
1. Read `packages/connectors/src/connector.ts` and list the current `RawEvent` fields.
2. Read `packages/connectors/src/connector.test.ts` and list the existing mock fixture structure.
3. Read `docs/reference/SCHEMA_v5.sql` and confirm `external_events` columns.
4. Update the mock connector fixtures in `connector.test.ts` to include all 17 fields listed above. The test framework should fail because the current `RawEvent` type will not accept the new fields.
5. Add a specific type assertion test: construct a complete mock `RawEvent` with all 17 fields and confirm TypeScript accepts it (this will fail until step 2 adds the fields to the interface).
6. Run the tests and confirm they fail (red state).

## Test command / verification
```bash
cd packages/connectors && pnpm test
# or
pnpm --filter @clyde-culture/connectors test
# Typecheck:
pnpm --filter @clyde-culture/connectors typecheck
```

## Acceptance criteria
- [ ] Mock fixtures in `connector.test.ts` include all 17 `RawEvent` fields.
- [ ] A test asserts that a full-field `RawEvent` object is type-valid.
- [ ] Tests currently fail because the production interface does not have the missing fields.
- [ ] No `_guess` field in `external_events` is left without a corresponding field in the test fixture.

## Stop condition
Stop after test updates are written and confirmed failing. Do not change `connector.ts`. Report:
- files inspected
- current `RawEvent` fields found
- missing fields identified
- test output showing failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/B4-raw-event-contract.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
