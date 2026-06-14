> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #16 (Removal/cancellation lifecycle). TDD-step-1 reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 14a — Removal / Cancellation Lifecycle (BE-02 / A2-006) — Red Tests

## Purpose

Write failing tests for the event removal and cancellation lifecycle. Today, when
an upstream source stops listing an event (it sells out, is cancelled, or simply
drops off the feed), the canonical `events` row is never updated — it lingers as
`published` forever. Audit 2 (A2-006) and task BE-02 flag this as unimplemented.

TDD Step 1 only. Do not implement production code.

---

## Skill / Agent

Use the `/implement-test-first` skill. Spawn an **Explore** agent first to read the
schema, the removal-lifecycle design doc, and the current sweep/normalise flow so
the tests match the intended contract.

## Parallelization

Independent of prompts `12` and `13` (different concern, mostly new code paths).
Sequential before `14b`. Must be preceded by reading the design doc (step 1 below).

---

## Context

Review confirmed there is **no** removal handling in `packages/ingestion`,
`packages/core/src/ingest`, or `trigger/tasks` — no `deleted_at`, `seen_at`,
`last_seen`, cancellation mapping, or archival transition exists in the code path.

The design was already documented in
`docs/tasks/archive/completed/phase-0.5/D3-removal-cancellation-lifecycle-docs.md`
(the docs landed; the code did not). Read it — it is the canonical contract for this
behaviour. Do not invent a lifecycle; implement the one that doc specifies.

Two distinct cases the lifecycle must handle:
1. **Explicit cancellation** — the source still lists the event but marks it
   cancelled (e.g. Ticketmaster `availability = 'cancelled'`). The canonical event
   should reflect cancellation, not disappear.
2. **Disappearance** — the event is no longer returned by the source at all. After a
   confirmation policy (per the D3 doc — e.g. missed N consecutive sweeps), the
   canonical event transitions out of `published`.

**Verify the exact field and state names** against `docs/reference/SCHEMA_v5.sql`
and the latest migrations before writing assertions — do not assume column names.
The relevant fields are likely on `events` (e.g. `visibility`, an availability or
status column) and possibly `external_events` (a last-seen timestamp). Confirm what
actually exists; if the schema lacks a needed column, stop and propose the migration
as a blocker rather than guessing.

---

## Files to Inspect

Spawn an Explore agent for these:

- `docs/tasks/BE-02.md` — the task's acceptance criteria
- `docs/tasks/archive/completed/phase-0.5/D3-removal-cancellation-lifecycle-docs.md`
  — the canonical lifecycle contract
- `docs/INGESTION.md` — the removal/lifecycle section, if present
- `docs/reference/SCHEMA_v5.sql` + `supabase/migrations/` — confirm actual columns
  and allowed `visibility` / availability values
- `packages/ingestion/src/normalise/dbNormalise.ts` — where canonical writes happen
- `packages/core/src/ingest/orchestrate.ts` and `sweep.ts` — the sweep flow that
  would detect disappearance
- `packages/core/src/normalise/normalise.ts` — `mapAvailabilityGuessToCanonical`
  (does `'cancelled'` already map to a canonical availability?)

---

## Task Instructions

1. Read the D3 design doc and BE-02 in full. Summarise the exact lifecycle contract:
   the trigger conditions, the confirmation policy for disappearance, and the target
   states. List the exact schema fields/values involved, cited from the schema files.

2. If the required schema columns or enum values do **not** exist, stop and report
   the missing migration as a blocker. Do not write tests against fields that do not
   exist. (Adding a migration would be its own approved step.)

3. Assuming the schema supports it, add failing tests. Place them in the test file
   that matches where the logic will live (cancellation mapping → core/normalise
   tests; disappearance detection → ingestion or orchestrate tests). Cover:

   **Test: explicit cancellation is reflected on the canonical event**
   An external event whose source marks it cancelled produces a canonical `events`
   row in the cancelled state defined by the D3 doc (e.g. an availability value
   and/or a visibility transition — use the exact values from the schema).

   **Test: a cancelled event is no longer publicly published (if the doc requires it)**
   Per the D3 contract, assert the resulting `visibility` (or equivalent gate) means
   the public query would exclude it — or includes it with a cancelled badge, per
   whatever the doc actually specifies. Match the doc, not an assumption.

   **Test: disappearance is tracked per sweep**
   When an event previously seen is absent from a sweep's results, the lifecycle
   records that (e.g. updates a last-seen marker or increments a miss counter, per
   the doc).

   **Test: disappearance transitions to archived only after the confirmation policy**
   A single missed sweep does NOT archive the event; the threshold from the D3 doc
   (e.g. N consecutive misses) does. Assert both the below-threshold no-op and the
   at-threshold transition.

   **Test: a reappearing event is restored**
   If a disappeared-but-not-yet-archived event reappears in a later sweep, its
   miss counter resets and it stays published.

4. Run the tests and confirm they fail:
   ```bash
   pnpm --filter @clydeculture/core test
   pnpm --filter @clydeculture/ingestion test
   ```

5. Confirm no existing tests break.

---

## Non-Goals

- Do not implement the lifecycle.
- Do not invent a lifecycle different from the D3 doc.
- Do not add a migration in this prompt (raise it as a blocker if needed).
- Do not delete canonical rows — removal is a state transition (archival), never a
  hard delete (preserve provenance and redirect history).

---

## Validation Commands

```bash
pnpm --filter @clydeculture/core test
pnpm --filter @clydeculture/ingestion test
```

Expected: new tests fail; existing tests pass.

---

## Required Output Format

State the lifecycle contract summary (cited from the D3 doc + schema).
For each test: file path, name, assertion, failure reason.
Flag any missing schema column/value as a blocker.

End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] Lifecycle contract summarised from the D3 doc with exact schema field/value
  citations
- [ ] Tests cover: explicit cancellation, public exclusion/badge per the doc,
  per-sweep disappearance tracking, threshold archival, and reappearance restore
- [ ] No assertion uses an invented field or state name
- [ ] Any missing schema support raised as a blocker (not guessed around)
- [ ] All tests failing for the right reason; existing tests intact
- [ ] No production code written
