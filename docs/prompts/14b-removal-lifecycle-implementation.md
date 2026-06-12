# 14b — Removal / Cancellation Lifecycle (BE-02 / A2-006) — Implementation

## Purpose

TDD Step 2. Implement the removal/cancellation lifecycle so the red tests from
`14a` pass: explicit cancellation is reflected on canonical events, disappearance is
tracked per sweep, and events transition to archived only after the confirmation
policy from the D3 design doc.

Only run after `14a` has produced failing tests (and confirmed the schema supports
the lifecycle).

---

## Skill / Agent

Run `/run-checks` after implementation. Run `/code-review medium` on the changed
files — this is new control-flow in the sweep, so a slightly deeper review than the
usual `low` is warranted. If a local Supabase instance is available, run `/verify`
to confirm the archival transition end-to-end against the DB.

## Parallelization

Sequential after `14a`. Independent of prompts `12` and `13`.

---

## Context

Two code paths to implement, per the D3 contract (and only as the `14a` tests pin):

1. **Cancellation mapping** — likely in or near
   `mapAvailabilityGuessToCanonical` (core) and the canonical write in
   `dbNormalise.ts`: a source-cancelled event must produce the canonical cancelled
   state (availability and/or visibility per the doc).

2. **Disappearance detection** — in the sweep/orchestration flow
   (`packages/core/src/ingest/orchestrate.ts` / `sweep.ts` and/or
   `dbNormalise.ts`): compare the set of external IDs seen this sweep against
   previously-linked events for the source, update the last-seen/miss marker, and
   archive only at the confirmation threshold.

Hard rule: removal is a **state transition (archival)**, never a hard delete.
Preserve the canonical row and its provenance.

---

## Files to Inspect

- The red tests from `14a`
- `docs/tasks/archive/completed/phase-0.5/D3-removal-cancellation-lifecycle-docs.md`
  — the contract to implement
- `packages/core/src/normalise/normalise.ts` — `mapAvailabilityGuessToCanonical`
- `packages/ingestion/src/normalise/dbNormalise.ts` — canonical write
- `packages/core/src/ingest/orchestrate.ts`, `sweep.ts` — sweep flow
- `supabase/migrations/` — the exact columns/values the tests rely on

---

## Task Instructions

1. Implement cancellation mapping: ensure a source-cancelled external event drives
   the canonical event into the cancelled state the `14a` tests assert. Keep pure
   logic in `packages/core` (no I/O); keep DB writes in `packages/ingestion`.

2. Implement disappearance detection in the sweep flow:
   - Determine which previously-linked events for the source were not seen this sweep
   - Update the last-seen/miss marker per the D3 confirmation policy
   - Transition to archived only at the threshold; below threshold is a no-op
   - Reset the marker when an event reappears

3. Preserve all existing behaviour: link-first gating, confidence/visibility logic,
   error isolation (a removal-detection failure must not abort the sweep — follow the
   M-5 error-isolation pattern already in the code).

4. Run targeted tests, then the full suite:
   ```bash
   pnpm --filter @clydeculture/core test
   pnpm --filter @clydeculture/ingestion test
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

5. If local Supabase is available, confirm the transition against the DB:
   ```bash
   supabase db reset
   supabase db test
   ```

6. Update documentation:
   - `docs/DECISIONS_LOG.md` — the confirmation policy chosen (threshold value),
     the cancelled state representation, and the files touched
   - `docs/INGESTION.md` — mark the removal/lifecycle section as implemented
   - `docs/LESSONS.md` — any non-obvious discovery (e.g. how disappearance is
     scoped per-source to avoid archiving events a connector simply didn't fetch
     this run due to paging limits)
   - `docs/tasks/BE-02.md` — note completion / link to the implementing commit

7. Run `/code-review medium` and address any correctness findings.

---

## Non-Goals

- Do not hard-delete canonical rows.
- Do not archive an event merely because a single sweep missed it (respect the
  threshold) or because a connector hit a paging/quota limit — scope disappearance
  to fully-completed source results only.
- Do not change the cancellation contract from what the D3 doc specifies.
- Do not add new event sources or connectors here.

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
supabase db test  # if local instance available
```

Expected: all `14a` tests pass; all previously passing tests pass.

---

## Acceptance Criteria

- [ ] All tests from `14a` pass
- [ ] All previously passing tests still pass
- [ ] Cancellation drives the canonical cancelled state per the D3 doc
- [ ] Disappearance archives only at the confirmation threshold; reappearance restores
- [ ] Removal is a state transition, never a hard delete
- [ ] Disappearance detection respects per-source completeness (no false archival on
  paging/quota limits)
- [ ] `docs/DECISIONS_LOG.md`, `docs/INGESTION.md`, `docs/LESSONS.md`, `docs/tasks/BE-02.md` updated
