# C6 — Pin Festival Detection with Red Tests

## Status
Open

## Purpose
There are no tests for festival detection logic, and `docs/FESTIVALS.md` may not specify the detection algorithm precisely enough to implement without guessing. In particular, there is no documented guard preventing an event from receiving a `festival_id` when its `start_at` falls outside the festival's date window — and the schema has no DB-level constraint to enforce this. The test is the only enforcement mechanism. This task first checks the docs, fills any gaps, then writes the red tests.

**Two-part task:** (1) verify/update `docs/FESTIVALS.md` if the algorithm is underspecified, then (2) write red tests. Stop after both.

## Classification
- Type: docs-only (if FESTIVALS.md gap) + red-tests-only
- Blocks: festivals implementation
- Can run in parallel: yes (with C2, C3, C4, C5)
- Must run after: none
- Must run before: festivals implementation

## Files to inspect first
- `docs/FESTIVALS.md` — detection algorithm specification (assess completeness)
- `packages/core/src/festivals/` — check if any implementation or tests exist
- `docs/reference/SCHEMA_v5.sql` — `festivals` and `events` tables (festival_id, start_at, date window columns)

## Files allowed to edit
- `docs/FESTIVALS.md` — only to fill documented gaps, not to redesign
- `packages/core/src/festivals/festivals.test.ts` (new or update existing)

## Files not allowed to edit
- Production source files under `packages/core/src/festivals/`
- Any migration files

## Non-goals
- Do not implement festival detection logic.
- Do not redesign the festival schema.
- Do not add festival-related columns.

## Required steps

### Part 1 — Check docs/FESTIVALS.md
1. Read `docs/FESTIVALS.md` in full. Assess whether it specifies:
   - Detection from explicit source/category signal.
   - Detection from known festival name mapping.
   - Date-window validation rule (event must be within festival date window to attach).
   - Priority when multiple festivals could match (which wins?).
   - Relationship between `is_festival_event` and `festival_id`.
2. If any of the above are underspecified, add the minimum necessary detail to FESTIVALS.md. Do not redesign — just specify what was missing.

### Part 2 — Write red tests
3. Create (or update) `packages/core/src/festivals/festivals.test.ts` with tests covering:
   - Festival detected from explicit source/category signal.
   - Festival detected from known festival name mapping.
   - Event within the festival date window → `festival_id` is set.
   - Event outside the festival date window → `festival_id` must NOT be set.
   - When multiple festivals could match: the priority rule (from FESTIVALS.md) is applied.
   - `is_festival_event` follows `festival_id` — it is true iff `festival_id` is non-null.
4. The date-window test is critical: it is the only guard against incorrect festival associations. Mark it as such in the test file.
5. Run the tests and confirm they fail.

## Test command / verification
```bash
cd packages/core && pnpm test
# or
pnpm --filter @clyde-culture/core test
```

## Acceptance criteria
- [ ] `docs/FESTIVALS.md` specifies date-window validation, detection signals, and multi-match priority.
- [ ] `packages/core/src/festivals/festivals.test.ts` exists.
- [ ] Tests explicitly cover: event outside festival date window → no `festival_id`.
- [ ] Tests are failing (red).

## Stop condition
Stop after the docs check/update and test file are written, tests confirmed failing. Report:
- whether FESTIVALS.md was updated and what was added
- whether any existing festival tests existed
- test output showing failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/C6-festival-detection-red-tests.md step 2. Now implement the smallest production code needed to pass this test.`
