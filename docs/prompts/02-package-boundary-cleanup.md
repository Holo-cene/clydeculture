# 02 — Package Boundary Cleanup

## Purpose

Fix the known architecture drift where DB-backed normalisation orchestration lives in
`packages/core`. The `packages/core` package must remain pure: normalisation logic,
deduplication, mapping, scoring, and festival detection only. It must never import
Supabase, fetch, fs, or any network/disk dependency.

---

## Context

`packages/core/CLAUDE.md` states the critical invariant:

> **No I/O.** This package must never import Supabase, fetch, fs, or any network/disk
> dependency. If you need data from the DB, pass it as an argument.

This invariant exists because `packages/core` functions must be deterministic and safe
to call in tests without any external setup. It also makes the sweep orchestrator
testable in isolation.

The current `packages/core/src/normalise/dbNormalise.ts` violates this invariant. It
exports `normaliseExternalEventsForSource`, which:
- calls `client.from('sources').select(...)` to load the source row
- calls `client.from('external_events').select(...)` to load unlinked events
- calls `client.from('source_type_category_map').select(...)` for type resolution
- calls `client.from('event_types').select(...)` for fallback event type
- calls `client.rpc('resolve_venue', ...)` and `client.rpc('auto_create_venue', ...)`
- calls `client.from('events').upsert(...)` to write the canonical event
- calls `client.from('external_events').update(...)` to link the canonical event ID

This is DB-backed orchestration, not pure normalisation. It belongs in
`packages/shared/src/db/` or a dedicated `packages/db-ops` package — somewhere that
explicitly imports and uses the Supabase client rather than hiding that dependency
behind a `NormaliseDbClient` abstraction in a "pure" package.

The `trigger/tasks/sweep.ts` task imports `normaliseExternalEventsForSource` from
`@clydeculture/core`. After the move, this import must be updated.

---

## Files to Inspect

Read all of these before planning the move:

- `packages/core/CLAUDE.md` — invariants that must be restored
- `packages/core/src/normalise/dbNormalise.ts` — the function to move
- `packages/core/src/normalise/dbNormalise.test.ts` — the existing tests for it
- `packages/core/src/index.ts` — current exports (will need updating)
- `packages/shared/src/index.ts` — target exports (will need updating)
- `packages/shared/src/db/` — existing DB helpers (pattern to follow)
- `packages/shared/src/db/upsertExternalEvents.ts` — example of a correct DB helper
- `trigger/tasks/sweep.ts` — imports `normaliseExternalEventsForSource` from `@clydeculture/core`
- `packages/core/src/normalise/normalise.ts` — pure functions that must stay in core
- `packages/core/src/normalise/canonical.test.ts` — assess whether any tests need updating

Also check whether `packages/shared/package.json` already declares any dependencies
that `packages/core` does not have, and whether the `NormaliseDbClient` interface
should move or stay.

---

## Task Instructions

Follow the repository TDD policy. **Step 1 and Step 2 are separate.**

### Step 1 — Write or update tests first. Do not write production code yet.

Before moving any production code:

1. Read `packages/core/src/normalise/dbNormalise.test.ts` in full.

2. Determine the correct target location for the moved function. The options are:
   - `packages/shared/src/db/normalise.ts` (alongside existing DB helpers)
   - A new dedicated file within `packages/shared/src/db/`

3. Write or copy the relevant tests to the new target location. Ensure:
   - The tests cover the same behaviours as the current tests.
   - The import paths in the test file point to the new location.
   - Any tests that rely on a mock DB client still use the mock (do not replace with
     real DB calls — the function accepts a client as an argument by design).

4. Identify any tests in `packages/core` that will break when the export is removed
   from `packages/core/src/index.ts`. List them.

5. Write (but do not implement) a test that confirms `packages/core` has no I/O
   dependency: it should attempt to import the entire `@clydeculture/core` package
   and assert that no Supabase or fetch calls are imported (a build-level or import
   test).

6. End Step 1 with:
   - The test file path(s) written.
   - The behaviour each test specifies.
   - The exact command to run the tests (they should fail at this point because the
     production code has not moved yet).
   - The words: `Ready for implementation. Prompt me with: Now implement the smallest production code needed to pass this test. Run the test and report the result.`

**Do not write any production code in Step 1.**

---

### Step 2 — Implement (only after the user instructs you to)

Only after the user says "Now implement the smallest production code needed to pass
this test", do the following:

1. Move `dbNormalise.ts` (and its `NormaliseDbClient` interface) from
   `packages/core/src/normalise/` to `packages/shared/src/db/`.

2. Update `packages/shared/src/index.ts` to export the moved function and its types.

3. Remove the export of `normaliseExternalEventsForSource` and `NormaliseDbClient`
   from `packages/core/src/index.ts`. Remove the `dbNormalise.ts` file from
   `packages/core/`.

4. Update `trigger/tasks/sweep.ts` to import `normaliseExternalEventsForSource` and
   `NormaliseDbClient` from `@clydeculture/shared` instead of `@clydeculture/core`.

5. Run the targeted tests first:
   ```bash
   pnpm --filter @clydeculture/shared test
   ```

6. Then run the full workspace checks:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

7. Verify `packages/core` has no remaining I/O imports:
   ```bash
   grep -r "supabase\|createClient\|from('events')\|from('sources')" packages/core/src/
   ```
   Expected: zero matches.

---

## Constraints

- Do not add new ingestion sources in this task.
- Do not change the behaviour of `normaliseExternalEventsForSource` — only move it.
- Do not weaken any existing tests.
- Do not add new dependencies; `@supabase/supabase-js` is already in `packages/shared`.
- Preserve the `NormaliseDbClient` interface — the sweep task depends on it.
- The `packages/core` functions `normaliseTitle`, `deriveDedupeKey`,
  `calculateConfidence`, `mapSourceCategoryToEventType`, `detectFestival`, and
  `mergeExternalEventIntoCanonicalEvent` must remain in `packages/core` unchanged.

---

## Non-Goals

- Do not refactor the normalisation logic itself.
- Do not add new event types, sources, or connector implementations.
- Do not redesign the sweep task beyond updating the import path.
- Do not touch `apps/web` or `supabase/`.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/shared test
pnpm --filter @clydeculture/core test
pnpm test
pnpm typecheck
pnpm lint
grep -r "supabase\|createClient" packages/core/src/
```

---

## Required Output Format

### Summary

What was moved, why, and what imports were updated.

### Files Changed

| File | Change |
|---|---|
| (list each file) | (what changed) |

### Tests Run

| Command | Result |
|---|---|
| (list each command) | Pass / Fail / count |

### Remaining Risks

Anything that this refactor did not cover but that should be addressed in a follow-up.

---

## Acceptance Criteria

- `packages/core` has no Supabase, fetch, or file system imports.
- `normaliseExternalEventsForSource` is exported from `@clydeculture/shared`.
- `trigger/tasks/sweep.ts` imports from `@clydeculture/shared`, not `@clydeculture/core`.
- All existing tests pass without modification (no tests were weakened or removed).
- `pnpm typecheck` and `pnpm lint` pass.
