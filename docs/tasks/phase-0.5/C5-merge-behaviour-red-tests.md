# C5 — Pin Merge Behaviour with Red Tests

## Status
Open

## Purpose
There is no field-level merge priority table in `docs/NORMALISATION.md`, and there are no tests for `mergeExternalEventIntoCanonicalEvent()`. Without a documented table, any implementation will make arbitrary decisions about which source tier wins, whether nulls can overwrite non-nulls, and what triggers `needs_review`. This task first extends the docs, then writes the red test file — both must be done before implementation begins.

**Two-part task:** (1) update `docs/NORMALISATION.md` Step 8 with a field-level merge table, then (2) write the red test file. Stop after both are done.

## Classification
- Type: docs-only (Step 8 update) + red-tests-only (test file)
- Blocks: normaliser code (merge logic)
- Can run in parallel: yes (with C2, C3, C4)
- Must run after: D2 (reschedule path must be documented before merge tests reference it)
- Must run before: normaliser implementation

## Files to inspect first
- `docs/NORMALISATION.md` — Step 8 (current merge behaviour, if any)
- `docs/tasks/BE-13.md` — check for any merge field priority notes
- `packages/core/src/normalise/` — check if `mergeExternalEventIntoCanonicalEvent` already exists
- `docs/reference/SCHEMA_v5.sql` — `events` table column list (every column needs a merge decision)

## Files allowed to edit
- `docs/NORMALISATION.md` — Step 8 only (field-level merge table addition)
- `packages/core/src/normalise/mergeExternalEventIntoCanonicalEvent.test.ts` (new)

## Files not allowed to edit
- Production source files under `packages/core/src/normalise/`
- Any migration files
- `docs/tasks/BE-13.md` — read only

## Non-goals
- Do not implement `mergeExternalEventIntoCanonicalEvent()`.
- Do not resolve contradictions between task files and NORMALISATION.md — only note them.
- Do not change any other NORMALISATION.md section.

## Required steps

### Part 1 — Update docs/NORMALISATION.md Step 8
1. Read `docs/NORMALISATION.md` Step 8 in full.
2. Read `docs/reference/SCHEMA_v5.sql` for all `events` columns.
3. Add a field-level merge priority table to Step 8 covering every canonical `events` field. The table must specify for each field:
   - Whether better-tier source wins regardless of null.
   - Whether incoming non-null wins over existing null.
   - Whether same-tier latest fetch wins.
   - Whether null can overwrite non-null (almost always: no).
   - Special handling for: `availability`, `price_min`, `price_max`, `image_url`, `ticket_url`, `description`, `summary`, `doors_at`, `source_url`.
4. Add the rescheduled event path: incoming `dedupe_key` differs from canonical → update in place if safe, else flag `needs_review = true`.

### Part 2 — Write the red test file
5. Create `packages/core/src/normalise/mergeExternalEventIntoCanonicalEvent.test.ts` with tests covering:
   - Better-tier source overwrites same field regardless of which arrived first.
   - Same-tier: latest fetch date wins.
   - Null incoming value does NOT overwrite existing non-null value.
   - `availability = 'rescheduled'` sets `needs_review = true`.
   - Multi-source: if two external events exist, merge keeps the better-tier values.
6. Run the tests and confirm they fail.

## Test command / verification
```bash
cd packages/core && pnpm test
# or
pnpm --filter @clyde-culture/core test
```

## Acceptance criteria
- [ ] `docs/NORMALISATION.md` Step 8 includes a field-level merge priority table.
- [ ] Every `events` column appears in the table.
- [ ] `packages/core/src/normalise/mergeExternalEventIntoCanonicalEvent.test.ts` exists.
- [ ] Tests cover all 5 behaviours listed above.
- [ ] Tests are failing (red state).

## Stop condition
Stop after the docs update and test file are written, tests confirmed failing. Report:
- files changed
- field-level decisions made (list any fields where the merge priority was ambiguous)
- test output
- recommended next prompt: `Implement docs/tasks/phase-0.5/C5-merge-behaviour-red-tests.md step 2. Now implement the smallest production code needed to pass this test.`
