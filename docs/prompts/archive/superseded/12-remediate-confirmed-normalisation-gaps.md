> **ARCHIVED 2026-06-13.** SUPERSEDED. Findings-driven remediate — no open gaps drive ongoing work; venue parity covered by issue #10. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 12 — Remediate Confirmed Normalisation Gaps

## Purpose

Fix only the normalisation gaps that prompt `11` confirmed are still open against
the live code. Most of Audit 2's M-3/M-4 field-completeness work and the
`calculateConfidence` / `mapSourceCategoryToEventType` functions have already
landed — so this prompt is deliberately **findings-driven, not prescriptive**.

> **Do not assume any specific gap exists.** Audit 2 was a point-in-time snapshot;
> the code has moved past it. Act only on gaps that prompt `11` verified against the
> current code, with a file:line citation. If `11` found no open gaps, this prompt
> is a no-op — say so and stop.

This prompt covers the TDD two-step internally: write the failing test for a
confirmed gap, then implement the smallest fix. Treat each gap as its own
red→green cycle.

---

## Skill / Agent

Use `/implement-test-first` for each gap's red test. Use `/run-checks` after each
implementation. Use `/code-review low` on every changed production file.

## Parallelization

Run **after** `11`. Because every likely gap touches
`packages/ingestion/src/normalise/dbNormalise.ts` (and its single test file),
do **not** parallelise the gaps in this prompt across sessions — they would
conflict in the same file. Work them serially within one session.

---

## Context

Prompt `11` produces a gap table with file:line evidence. Known candidates that
*may* still be open (verify each — do not assume):

- **M-6 alert/status semantics** — does a zero-parsed run record
  `status = 'success'`? Do all `alert_type` strings written in TS match the
  `ingest_alerts` DB CHECK constraint?
- **M-7 dedupe parity** — `deriveDedupeKey` already normalises its title input
  internally, so passing raw vs. pre-normalised title is *not* a functional gap.
  The only residual concern is **SQL ↔ TS `normaliseTitle` parity** (the SQL
  `normalise_title()` function vs. the TS `normaliseTitle()` must produce identical
  output for the same input). Only act if `11` confirmed a divergence.
- **Any field genuinely absent** from the canonical `events` write that `11` proved
  missing with a file:line citation.

**Critical constraint discovered during review:** the canonical write applies
link-first gating — e.g. price fields are written only when `pricesAllowed` is true
(see `dbNormalise.ts`). Any fix must preserve existing gating logic. Do **not**
replace a gated assignment (`pricesAllowed && ... ? x : undefined`) with an
ungated one (`x ?? null`). Read the surrounding code before editing.

The Astro website currently displays seeded demo data. This proves the public
display path, not live ingestion. Do not treat the demo as evidence a gap is closed.

---

## Files to Inspect

Read these before touching anything; confirm the current state yourself rather than
trusting this prompt or the audit:

- The gap table output from prompt `11`
- `packages/ingestion/src/normalise/dbNormalise.ts` — the canonical write path
- `packages/ingestion/src/normalise/dbNormalise.test.ts` — existing tests + mock client
- `packages/core/src/ingest/orchestrate.ts` — run status / alert recording
- `packages/core/src/dedupe/dedupe.ts` — `deriveDedupeKey` (note it normalises internally)
- `packages/core/src/normalise/normalise.ts` — `normaliseTitle` (for SQL parity check)
- `supabase/migrations/` — the `ingest_alerts` CHECK constraint; the
  `normalise_title()` SQL function for parity comparison

---

## Task Instructions

For **each** gap that prompt `11` confirmed open (and only those):

### Step 1 — Red test (no production code)

1. Re-verify the gap exists in the current code. Cite the file:line. If it does
   not reproduce, record "already resolved" and skip — do not write a test for a
   non-gap.

2. Write the smallest failing test in the appropriate existing test file. Fit the
   existing mock-client / fixture pattern; do not invent a new harness.

3. Derive every expected value from the **canonical source** (the live code, the
   migration, or `docs/NORMALISATION.md`) — never from a number written in this
   prompt or the audit. For example, confidence base scores live in
   `calculateConfidence` and NORMALISATION.md, not here.

4. Run the test; confirm it fails for the right reason (the gap), not a typo or a
   type error. Pause here and report before implementing.

### Step 2 — Smallest implementation

5. Make the minimal change to pass the test. Preserve all existing gating logic
   (link-first, `pricesAllowed`, visibility). No opportunistic refactors.

6. Run the targeted test, then:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

7. Append one row to `docs/DECISIONS_LOG.md` per gap fixed (date, gap, decision,
   rationale, files). If `11` flagged the NORMALISATION.md `base_score` doc/code
   drift (doc says 40, code uses 50), correct the doc to match the code and log it.

---

> **Conflict with field-locking (ADR 0007).** This prompt's M-1 identity-first
> re-normalisation overwrites canonical fields from the latest source each sweep. Once
> editorial field-locking lands (prompts `22a`/`22b`,
> [ADR 0007](../decisions/0007-editorial-override-and-field-locking.md)), re-normalisation
> MUST skip locked fields — otherwise it clobbers human corrections. If field-locking is
> already implemented when you run this prompt, respect the lock check; if not, do not
> expand re-normalisation's scope until `22a`/`22b` are in place.

## Non-Goals

- Do not act on any gap not confirmed by prompt `11`.
- Do not re-implement `calculateConfidence`, `mapSourceCategoryToEventType`, the
  M-3 field writes, or M-4 TBA threading — review confirmed these already exist.
- Do not change confidence weights, tier base scores, or category mappings to match
  a value from this prompt or the audit. The code + NORMALISATION.md are canonical.
- Do not remove or weaken existing link-first / pricing gates.
- Do not implement the removal/cancellation lifecycle (that is prompt `14a`/`14b`).

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Plus the targeted package test for each gap touched.

---

## Required Output Format

### Gap Remediation Table

| Gap (from prompt 11) | Reproduced? | Test added | Fix applied | Files |
|---|---|---|---|---|

### Test Results

Verbatim output of `pnpm test`, `pnpm typecheck`, `pnpm lint`.

### Decisions Logged

The `docs/DECISIONS_LOG.md` rows added.

### No-Op Note

If no gaps reproduced, state that plainly: the normalisation pipeline is
field-complete and this prompt made no changes.

---

## Acceptance Criteria

- [ ] Every change traces to a prompt `11` gap with a file:line citation
- [ ] No expected value was copied from this prompt or the audit; all derived from
  live code / migrations / NORMALISATION.md
- [ ] Existing link-first and pricing gates preserved (verified by reading the code)
- [ ] All previously passing tests still pass
- [ ] `docs/DECISIONS_LOG.md` updated for each fix (or a no-op note recorded)
