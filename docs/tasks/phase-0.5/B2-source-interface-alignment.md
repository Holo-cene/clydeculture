# B2 — Align Source Interface with the sources Table

## Status
Complete

## Completion note
- Production fix: `packages/shared/src/types/source.ts` — `isActive` replaced with `enabled` (matching the `sources` DB column); `baseUrl` removed (no such column); all 14 DB columns present.
- Test file: `packages/shared/src/types/source.test.ts` — asserts `enabled` exists and `baseUrl` does not; comment reads "Step 2: GREEN".
- Both step 1 (red test) and step 2 (interface fix) are committed.

## Purpose
The current `Source` TypeScript interface uses `isActive` (the DB column is `enabled`) and `baseUrl` (no such column exists in `sources`). Any connector, seed SQL, or ingestion task that references these fields will silently fail at runtime. This task writes a failing type-level or runtime test that proves the mismatch, then stops. The production fix (replacing the interface) happens in step 2.

**TDD step 1 only** — write the failing test, stop.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: connector code, G1 sweep orchestration
- Can run in parallel: yes (independent of B1, B3, B4, D-group, H1)
- Must run after: none
- Must run before: G1

## Files to inspect first
- `packages/shared/src/types/source.ts` — current `Source` interface
- `docs/reference/SCHEMA_v5.sql` — confirm `sources` table columns
- `docs/tasks/CC-NEW-2.md` — check for any additional source interface requirements
- `packages/connectors/src/connector.ts` — check if Source is referenced

## Files allowed to edit
- `packages/shared/src/types/source.test.ts` (new) — shape test for the Source interface

## Files not allowed to edit
- `packages/shared/src/types/source.ts` — production code; do not touch in step 1
- Any connector implementations
- Any migration files
- `docs/tasks/CC-NEW-2.md` — do not edit task files (read only)

## Non-goals
- Do not fix `isActive` → `enabled` yet.
- Do not remove `baseUrl` yet.
- Do not add any DB columns.
- Do not change any connector code.

## Required steps
1. Read `packages/shared/src/types/source.ts` and note all current interface fields.
2. Read `docs/reference/SCHEMA_v5.sql` and extract the exact column list for the `sources` table. The required fields are: `id`, `name`, `slug`, `source_type`, `tier`, `config`, `status`, `enabled`, `last_run_at`, `last_success_at`, `last_error_at`, `last_error`, `created_at`, `updated_at`.
3. Read `docs/tasks/CC-NEW-2.md` for any additional requirements.
4. Write `packages/shared/src/types/source.test.ts` with a test that:
   - Constructs a mock object typed as `Source`.
   - Asserts that `enabled` exists (not `isActive`).
   - Asserts that `baseUrl` does not exist on the interface (this may require a type-level assertion).
   - The test must fail with the current interface.
5. Run the test and confirm it fails (red state).

## Test command / verification
```bash
cd packages/shared && pnpm test
# or
pnpm --filter @clyde-culture/shared test
```

## Acceptance criteria
- [ ] `packages/shared/src/types/source.test.ts` exists.
- [ ] Test proves `isActive` should be `enabled`.
- [ ] Test proves `baseUrl` should not exist.
- [ ] Test currently fails (red state).

## Stop condition
Stop after the failing test is written and confirmed failing. Do not change `source.ts`. Report:
- files inspected
- files changed
- current interface fields found
- test output showing the failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/B2-source-interface-alignment.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
