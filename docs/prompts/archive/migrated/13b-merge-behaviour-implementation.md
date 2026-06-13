> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #11. TDD-step-2 reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 13b — Merge Behaviour — Implementation

## Purpose

TDD Step 2. Implement `mergeExternalEventIntoCanonicalEvent()` in
`packages/core/src/normalise/normalise.ts` using the merge table from `13a`.

Only run after `13a` has produced failing tests.

---

## Skill

Run `/run-checks` to validate. Run `/code-review low` on the changed function to
verify null-safety and tier precedence logic.

## Parallelization

Sequential after `13a`. May complete alongside `12` (remediation).

---

## Context

The spec is `docs/NORMALISATION.md` Step 8 (updated in `13a`). The function must be
pure: no DB calls, no I/O. It takes two inputs — the incoming external event (with
its source tier) and the current canonical event (with its source tier and existing
field values) — and returns the merged canonical event draft.

Key implementation rules:
- Use tier comparison to decide field precedence
- Never assign `null` to a field that already has a non-null value
- Set `needs_review = true` when `availability = 'rescheduled'`
- Recompute `confidence` and `dedupe_key` after merge (not merged directly)

---

## Files to Inspect

- `packages/core/src/normalise/normalise.ts`
- `packages/core/src/normalise/mergeExternalEventIntoCanonicalEvent.test.ts`
  (the red tests from `13a`)
- `docs/NORMALISATION.md` Step 8 (the merge table)

---

## Task Instructions

1. Read `normalise.ts` and find the current `mergeExternalEventIntoCanonicalEvent`
   implementation (if any).

2. Implement or rewrite the function to apply the merge table:
   - For each field: if incoming tier < canonical tier (better source), use incoming
   - If same tier: use whichever has a more recent `fetchedAt`
   - Never: `null` overwrites non-null
   - After merge: if `availability === 'rescheduled'`, set `needs_review = true`

3. The function must not import Supabase, fetch, or any I/O dependency.

4. Run tests:
   ```bash
   pnpm --filter @clydeculture/core test mergeExternalEventIntoCanonicalEvent
   pnpm --filter @clydeculture/core test
   pnpm typecheck
   ```

5. Append to `docs/DECISIONS_LOG.md`:
   - Decision: `mergeExternalEventIntoCanonicalEvent follows NORMALISATION.md Step 8 merge table`
   - Note any non-obvious implementation choice (e.g. how tie-breaking is handled
     when tier is equal and fetch dates are identical)

6. Append to `docs/LESSONS.md` if any design choice was surprising or non-obvious.

---

## Non-Goals

- Do not add DB calls to the function.
- Do not change the merge table in NORMALISATION.md (it was set in `13a`).
- Do not add new `events` columns.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/core test
pnpm typecheck
pnpm lint
```

Expected: all 5 tests from `13a` pass; no regressions.

---

## Acceptance Criteria

- [ ] All 5 tests from `13a` pass
- [ ] No previously passing tests regressed
- [ ] Function is pure (no I/O imports)
- [ ] `docs/DECISIONS_LOG.md` updated
- [ ] `docs/LESSONS.md` updated if any non-obvious choice was made
