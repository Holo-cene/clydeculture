# 05 — Ticketmaster Fixture E2E Implementation

## Purpose

Implement the smallest production code needed to pass the red E2E test written in
prompt `04`. This is a Step 2 prompt — only run it after prompt `04` has produced a
failing test.

---

## Prerequisite

You must have already completed prompt `04`:
- The E2E test file exists.
- The test was run and confirmed to fail (red) for the right reason.
- The failure output was reported.

If you have not done this, stop and run prompt `04` first.

---

## Context

The Ticketmaster connector parser is complete and tested. The failing E2E test
specifies the full chain from fixture to public query. The missing wiring may include
one or more of:

- A test Ticketmaster source row in the database (or test setup that inserts one).
- The `upsertExternalEvents` helper being called with Ticketmaster-shaped data.
- The normalisation step (`normaliseExternalEventsForSource`) being called for the
  Ticketmaster source.
- A `source_type_category_map` row mapping a Ticketmaster segment ID to an
  `event_types` slug.
- Confidence scoring producing a score >= 60 for a well-formed Ticketmaster event.
- `auto_publish = true` in the test source's config (or a manual visibility check
  that confirms `'draft'` is acceptable for this phase).

The implementation must not:
- Call the live Ticketmaster API.
- Add new connector types beyond Ticketmaster.
- Redesign the normalisation logic.
- Add new dependencies.
- Change the demo seed data or break the MVP demo.

---

## Files to Inspect

Read all of these before implementing:

- The test file written in prompt `04` (check exactly what it requires).
- `packages/connectors/src/api/ticketmaster/fixtures/response.json`
- `packages/connectors/src/api/ticketmaster/parse.ts`
- `packages/shared/src/db/upsertExternalEvents.ts`
- `packages/core/src/normalise/dbNormalise.ts` — or wherever
  `normaliseExternalEventsForSource` now lives after prompt `02`.
- `packages/core/src/normalise/normalise.ts` — `calculateConfidence` signature
- `supabase/migrations/20260606000000_source_category_map_seed.sql` — existing
  category map entries (check whether Ticketmaster segment IDs are already mapped)
- `supabase/migrations/20260607000000_fix_ticketmaster_segment_ids.sql` — segment
  ID corrections
- `supabase/seed.sql` — confirm test source does not conflict with demo seed

---

## Task Instructions

Make the smallest production change needed to pass the failing E2E test. Work through
these steps:

### Step 1: Diagnose the specific failure

Re-read the failure output from prompt `04`. Identify which step in the chain is
failing:
- Missing source row?
- Upsert not called?
- Normalisation not called?
- Category map missing for Ticketmaster segment ID?
- Confidence below 60?
- Event stuck at `'draft'` when test expects `'published'`?

### Step 2: Fix only what is broken

Address only the specific cause of the red test. Do not refactor surrounding code.

If the test requires a Ticketmaster source row: add the minimal insert to a new
Supabase test migration or to a test setup fixture. Do not modify `supabase/seed.sql`.

If a `source_type_category_map` entry is missing for a Ticketmaster segment ID used
in the fixture: check whether the segment ID mapping exists in the migrations. If it
does not exist, add a mapping entry — either in a new migration or as test setup data.

If confidence is below 60: read `calculateConfidence` to understand why. Adjust the
fixture or the test source config (not the scoring algorithm) to produce a well-formed
event that genuinely earns >= 60.

### Step 3: Run targeted tests first

```bash
supabase db test
# or
pnpm --filter @clydeculture/shared test
```

Report the output. If the targeted test passes, continue.

### Step 4: Run full workspace checks

```bash
pnpm test
pnpm typecheck
pnpm lint
```

### Step 5: Confirm the MVP demo is intact

```bash
supabase db reset
supabase db test
pnpm --filter @clydeculture/web build
```

The MVP demo seed data must still produce 10 published events. The Ticketmaster test
must not break or alter the demo seed.

---

## Non-Goals

- Do not call the live Ticketmaster API.
- Do not redesign the normalisation algorithm.
- Do not add new connector types.
- Do not modify `apps/web` layout, styling, or components.
- Do not refactor any code beyond what the failing test requires.
- Do not add dependencies.
- Do not break the MVP demo.

---

## Validation Commands

```bash
supabase db test
pnpm test
pnpm typecheck
pnpm lint
```

Also run the MVP acceptance check (abbreviated):

```bash
supabase db reset
supabase db test
```

Confirm the demo seed still produces 10 published events.

---

## Required Output Format

### Summary

One paragraph: what was failing, what minimal change was made, and whether the test
now passes.

### Root Cause

What specific gap in the wiring caused the red test to fail.

### Files Changed

| File | Change |
|---|---|
| (list each file) | (what changed) |

### Tests Run

| Command | Result |
|---|---|
| (targeted test) | Pass / count |
| `pnpm test` | Pass / count |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |

### MVP Demo Intact

Confirm: `supabase db reset && supabase db test` produces 10 published events from
the demo seed alongside (and separate from) the new Ticketmaster fixture event.

### Remaining Risks

List anything not yet proven:
- Live API key ingestion path not tested.
- Specific Ticketmaster segment IDs not covered by fixture.
- Venue resolution not tested for unmapped venue names.
- Any other gaps.

---

## Acceptance Criteria

- The E2E test from prompt `04` passes green.
- The MVP demo still has 10 published events from `Demo Eventbrite Feed`.
- No live Ticketmaster API call was made.
- The Ticketmaster fixture event has `source_url` pointing to a Ticketmaster URL.
- `source_slug = 'ticketmaster'` — not `'demo-eventbrite-feed'`.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass.
