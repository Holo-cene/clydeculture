# 22b — Editorial Override & Field-Locking (ADR 0007) — Implementation

## Purpose

TDD Step 2. Make the `22a` tests pass: implement the `field_overrides` mechanism and
make normalisation/merge respect locks, so re-normalisation never clobbers human
corrections.

Only run after `22a` has produced failing tests.

---

## Skill

Run `/run-checks`. Run `/code-review medium` (this changes the write path; warrant more
than `low`).

## Parallelization

Sequential after `22a`. Must land before heavy sweep/re-normalisation runs at scale
(see prompt `12` conflict note).

---

## Context

Implement the shape accepted in prompt `17`
([ADR 0007](../decisions/0007-editorial-override-and-field-locking.md)). Schema changes
go through a new `supabase/migrations/` file. The lock check guards every canonical
field write on the update/reschedule path; locked fields keep the human value and a
source-diverges-from-lock condition raises a review signal rather than overwriting.

---

## Files to Inspect

- The `22a` failing tests + the prompt-`17` shape
- `packages/ingestion/src/normalise/dbNormalise.ts` — the write path to guard
- `packages/core/src/normalise/normalise.ts` — merge logic
- `supabase/migrations/*` — latest timestamp; `moderation_log` for override provenance
- `docs/NORMALISATION.md` Step 8 + "field-locks"; `docs/DEDUPLICATION.md`

---

## Task Instructions

1. Migration (if the shape needs schema): add `events.field_overrides` (JSONB) or the
   side table per prompt `17`. Record override provenance via `moderation_log`.

2. In `dbNormalise.ts` (and merge in `normalise.ts`): before assigning each canonical
   field on the update/reschedule path, check the lock. If locked, keep the existing
   value and skip; if the incoming value diverges from the locked value, set the review
   signal. Preserve all existing behaviour (link-first, M-1 identity-first updates for
   unlocked fields, error isolation).

3. Ensure editorial canonical-survivor / duplicate-rejection decisions override
   automatic merge candidates (`docs/DEDUPLICATION.md`).

4. Run:
   ```bash
   pnpm --filter @clydeculture/ingestion test
   pnpm --filter @clydeculture/core test
   pnpm test && pnpm typecheck && pnpm lint
   supabase db reset && supabase db test   # if local Supabase available
   ```

5. Update docs: `docs/DECISIONS_LOG.md` (shape chosen, files); confirm
   `docs/NORMALISATION.md` "field-locks" and `docs/INGESTION.md` "override interaction"
   match the implementation.

---

## Non-Goals

- Do not implement a whole-record freeze (field-level only).
- Do not change confidence/dedup algorithms beyond the lock guard.
- Do not let a lock silently hide a genuine upstream change — always surface the review
  signal.

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
supabase db test   # if local Supabase available
```

Expected: all `22a` tests pass; existing tests + RLS tests pass.

---

## Acceptance Criteria

- [ ] All `22a` tests pass
- [ ] Re-normalisation skips locked fields; updates unlocked ones; surfaces divergence
- [ ] Survivor/duplicate decisions persist across sweeps
- [ ] Migration applies cleanly via `supabase db reset`
- [ ] `docs/DECISIONS_LOG.md` updated; NORMALISATION/INGESTION match the implementation
- [ ] No previously passing test regressed
