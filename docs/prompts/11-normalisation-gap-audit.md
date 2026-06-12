# 11 — Normalisation Gap Audit

## Purpose

Produce a precise, file:line-cited gap list for the normalisation pipeline. This is
the **gate** that drives prompt `12` — it determines which (if any) of Audit 2's
M-tasks are genuinely still open against the *current* code.

This is read-only. Do not make code changes.

> **Why this matters.** Audit 2 was a point-in-time snapshot. A review on
> 2026-06-11 found that significant remediation has landed *since* the audit:
> M-3 (field-complete write), M-4 (TBA threading), `calculateConfidence`, and
> `mapSourceCategoryToEventType` all appear implemented. Do not trust the audit's
> "incomplete" labels — verify every item against the live code and report only
> gaps you can reproduce. The cost of a false "incomplete" is high: prompt `12`
> could otherwise regress working code.

---

## Skill / Agent

Spawn an **Explore** subagent to read file groups in parallel. Do not use production
implementation tools.

## Parallelization

This prompt must run **before** prompt `12` (remediation). Prompts `13` (merge) and
`14` (removal lifecycle) are independent and do not depend on this audit.

---

## Context

Clyde Culture's ingestion pipeline writes external events from connectors into
`external_events`, then normalises them into canonical `events`. Audit 2 (June 2026)
flagged that several product-critical fields (`end_at`, `doors_at`, `price_min`,
`price_max`, `is_free`, `availability`, `time_tba`, `is_all_day`) were not written to
canonical events **at the time of the audit**.

Known completed M-tasks: M-1 (identity-first updates), M-2 (package boundary:
`packages/ingestion` extracted), M-5 (error isolation). The 2026-06-11 review
additionally found M-3 and M-4 appear landed — confirm or refute this.

Specific things the review flagged to re-check:
- The canonical write applies **link-first gating** (e.g. prices only when
  `pricesAllowed`). Note this so any later fix preserves it.
- `deriveDedupeKey` **normalises its title input internally** — so the M-7 "use
  trimmed title" concern is largely moot; the only residual is SQL ↔ TS
  `normaliseTitle` parity. Check whether they diverge.
- **Doc/code drift:** `docs/NORMALISATION.md` shows `base_score: 40` (example) while
  `calculateConfidence` uses Tier 1 = 50. Confirm and report this as a doc fix.

Tasks to verify — M-3, M-4, M-6, M-7:

- **M-3** — Field-complete canonical write: `end_at`, `doors_at`, prices,
  `availability`, `time_tba`, `is_all_day` must reach canonical `events`.
- **M-4** — `timeTba` threads through the full contract:
  parser → `RawEvent.timeTba` → `external_events.time_tba_guess` → `events.time_tba`.
- **M-6** — Zero-parsed runs record `status = 'success'`; all `alert_type` values
  written in TS match the DB CHECK constraint.
- **M-7** — Dedupe key update uses the stored/trimmed `normalised_title`, not
  re-derived from `normaliseTitle(raw_title)`.

---

## Files to Inspect

Spawn an Explore agent and read these in parallel groups:

**Group 1 — normalisation write path:**
- `packages/ingestion/src/normalise/dbNormalise.ts` (full file)
- `packages/core/src/normalise/normalise.ts` (full file)
- `packages/core/src/ingest/orchestrate.ts`

**Group 2 — connector and upsert contract:**
- `packages/connectors/src/connector.ts`
- `packages/shared/src/db/upsertExternalEvents.ts`
- `packages/connectors/src/api/ticketmaster/parse.ts`

**Group 3 — schema and constraints:**
- `supabase/migrations/` — list all files; read the most recent 3 in full
- `docs/reference/SCHEMA_v5.sql` — `events` table columns only

**Group 4 — tests and docs:**
- `packages/ingestion/src/normalise/dbNormalise.test.ts`
- `packages/core/src/ingest/orchestrate.test.ts`
- `docs/NORMALISATION.md` (Steps 4 and 8)

---

## Task Instructions

1. Spawn an Explore agent to read all files above in parallel groups.

2. For **M-3**, open `packages/ingestion/src/normalise/dbNormalise.ts`. Find the
   object passed to `.upsert()` or `.update()` on the `events` table. For each field
   below, record whether it is present and which line number it appears on:
   - `end_at`
   - `doors_at`
   - `price_min`, `price_max`, `is_free`
   - `availability`
   - `time_tba`
   - `is_all_day`

3. For **M-4**, trace the `timeTba` path:
   - Does `parse.ts` set `timeTba: true` on `RawEvent` for `noSpecificTime` events?
   - Does `upsertExternalEvents.ts` write `time_tba_guess` from `RawEvent.timeTba`?
   - Does `dbNormalise.ts` read `time_tba_guess` and write `time_tba` to canonical events?

4. For **M-6**, check `orchestrate.ts`:
   - Does a run that returns `parsedCount: 0` record `status = 'success'`?
   - List every `alert_type` string written in TS. Check each against the DB CHECK
     constraint (find it in the migration files). Report any mismatch.

5. For **M-7**, find where the `dedupe_key` is computed for an update operation on an
   existing linked event. Does it use `event.normalised_title` (stored) or call
   `normaliseTitle(raw)` again?

6. Run the test suite and record output verbatim:
   ```bash
   pnpm --filter @clydeculture/ingestion test
   pnpm --filter @clydeculture/core test
   pnpm --filter @clydeculture/connectors test
   pnpm typecheck
   ```

7. Record any pre-existing failures honestly — do not fix them here.

---

## Non-Goals

- Do not implement any fix.
- Do not run database migrations or modify seed data.
- Do not call live APIs.
- Do not change any file in `packages/`, `trigger/`, `supabase/`, or `apps/`.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/ingestion test
pnpm --filter @clydeculture/core test
pnpm --filter @clydeculture/connectors test
pnpm typecheck
```

---

## Required Output Format

### M-Task Status Table

| M-Task | Status | Evidence (file:line) |
|---|---|---|
| M-3: end_at written to events | Done / Incomplete | |
| M-3: doors_at written | Done / Incomplete | |
| M-3: price_min/max/is_free written | Done / Incomplete | |
| M-3: availability written | Done / Incomplete | |
| M-3: time_tba written | Done / Incomplete | |
| M-3: is_all_day written | Done / Incomplete | |
| M-4: parser sets timeTba | Done / Incomplete | |
| M-4: upsert writes time_tba_guess | Done / Incomplete | |
| M-4: normaliser reads/writes time_tba | Done / Incomplete | |
| M-6: zero-parsed = success status | Done / Incomplete | |
| M-6: alert_types match DB CHECK | Done / Incomplete | |
| M-7: dedupe uses stored normalised_title | Done / Incomplete | |

### Test Results

Verbatim output of all four commands above.

### Gap List for Prompt 12

The actionable output. List every **confirmed-open** gap with its file:line evidence
and the canonical source of truth for the correct value (live code / migration /
NORMALISATION.md). If no gaps reproduce, say so explicitly — prompt `12` becomes a
no-op and the pipeline is field-complete. Also record the NORMALISATION.md
`base_score` doc-drift here if confirmed.

### Decisions to Record

List any architectural choices discovered (e.g. new migration columns not yet wired
in TS) as draft entries for `docs/DECISIONS_LOG.md`. Do not write the file yet.

---

## Acceptance Criteria

- [ ] Every M-task row has file+line evidence — no "probably" or "looks like".
- [ ] Test output pasted verbatim.
- [ ] Pre-existing failures reported, not silently fixed.
- [ ] No production files changed.
- [ ] Decisions log entries drafted in the response.
