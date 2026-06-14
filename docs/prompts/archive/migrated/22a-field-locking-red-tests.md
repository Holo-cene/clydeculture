> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #26 (ADR 0007 field-locking). TDD-step-1 reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 22a — Editorial Override & Field-Locking (ADR 0007) — Red Tests

## Purpose

Write failing tests for **field-locking**: an editorially locked field on a canonical
event MUST survive re-normalisation. Today a sweep re-normalises linked events (the M-1
identity-first update path) and would silently overwrite any human correction — there is
no lock mechanism. This is **urgent**: it must land before heavy sweep/re-normalisation.

TDD Step 1 only. Do not implement production code or migrations.

---

## Skill

Use `/implement-test-first`.

## Parallelization

After prompt `17` (which fixes the `field_overrides` storage shape and the lockable
field set). Independent of `18`/`19`/`20`. **Sequence before scaling the M-1
re-normalisation work** (prompt `12` / the sweep) — see the conflict note in prompt `12`.

---

## Context

[ADR 0007](../decisions/0007-editorial-override-and-field-locking.md) introduces a
`field_overrides` mechanism (exact shape from prompt `17`: an `events.field_overrides`
JSONB map of locked fields, or a side table). Normalisation and merge MUST respect it:
a sweep updates unlocked fields and skips locked ones. Lockable decisions include title,
venue, date/time, category/type, source priority, canonical survivor, and duplicate
decisions.

The re-normalisation/update path is in
`packages/ingestion/src/normalise/dbNormalise.ts` (and the merge logic in
`packages/core/src/normalise/normalise.ts`). The reschedule/update behaviour is in
`docs/NORMALISATION.md` Step 8.

Verify the actual field/column names against the prompt-`17` output and the live schema
before writing assertions — do not assume.

---

## Files to Inspect

- The `field_overrides` shape + lockable field set from prompt `17`
- `packages/ingestion/src/normalise/dbNormalise.ts` — the update/reschedule write path
- `packages/core/src/normalise/normalise.ts` — merge logic
- `packages/ingestion/src/normalise/dbNormalise.test.ts` — existing mock-client pattern
- `docs/NORMALISATION.md` Step 8 + "field-locks" section; `docs/DEDUPLICATION.md`

---

## Task Instructions

1. Add failing tests (fit the existing mock-client/fixture pattern):

   **Test: a locked field is not overwritten by re-normalisation**
   A canonical event has `title` locked to a human value; the incoming source has a
   different title. After normalisation, the canonical `title` keeps the locked value.

   **Test: unlocked fields still update**
   With `title` locked but `availability` unlocked, an incoming availability change is
   applied while `title` is unchanged.

   **Test: lock applies across fields**
   Repeat for at least venue, date/time, and category — a locked field of each kind is
   preserved.

   **Test: source-diverges-from-lock surfaces a review signal**
   When an incoming value differs from a locked field, the event is flagged for review
   (e.g. `needs_review = true` / a recorded signal) rather than overwritten.

   **Test: canonical-survivor / duplicate decision persists**
   An editorial canonical-survivor (or duplicate-rejection) decision is not reverted by
   a subsequent sweep / automatic merge candidate.

2. Run and confirm failures:
   ```bash
   pnpm --filter @clydeculture/ingestion test
   pnpm --filter @clydeculture/core test
   ```

---

## Non-Goals

- Do not implement the lock mechanism or migration.
- Do not change dedup/confidence logic here.
- Do not assume field/column names — take them from prompt `17`.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/ingestion test
pnpm --filter @clydeculture/core test
```

Expected: new tests fail; existing tests pass.

---

## Required Output Format

For each test: file path, assertion, failure reason. State the `field_overrides` shape
targeted. End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] Tests cover: locked field preserved; unlocked field updates; locks across
  title/venue/date/category; source-diverges-from-lock review signal; survivor/duplicate
  decision persists
- [ ] Tests target the exact shape from prompt `17`
- [ ] All new tests fail; existing tests pass
- [ ] No production code or migration written
