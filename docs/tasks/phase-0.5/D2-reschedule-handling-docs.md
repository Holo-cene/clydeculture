# D2 — Specify Rescheduled Event Handling

## Status
Open

## Purpose
The normalisation pipeline has no documented path for what happens when a connector re-ingests an event with a changed date. Without this, implementations may create duplicate published rows (a ghost row at the old date plus a new row at the new date), or silently update the canonical event's dedupe key without checking for collisions. This task documents the full reschedule/update path in `docs/NORMALISATION.md` Step 8 and `docs/DEDUPLICATION.md`. No code.

## Classification
- Type: docs-only
- Blocks: normaliser implementation (specifically: merge step and reschedule path)
- Can run in parallel: yes (with D1, D3, D4, D5, D6)
- Must run after: none
- Must run before: C5 (merge behaviour tests reference the reschedule path)

## Files to inspect first
- `docs/NORMALISATION.md` — Step 8 (current merge/update content)
- `docs/DEDUPLICATION.md` — current reschedule content, if any
- `docs/reference/SCHEMA_v5.sql` — `external_events` fields: `event_id`, `dedupe_key`; `events` fields: `dedupe_key`, `needs_review`, `availability`, `visibility`

## Files allowed to edit
- `docs/NORMALISATION.md` — Step 8 update path
- `docs/DEDUPLICATION.md` — reschedule section

## Files not allowed to edit
- Any TypeScript source files
- Any migration files

## Non-goals
- Do not implement any reschedule logic.
- Do not change the schema.

## Required steps
1. Read `docs/NORMALISATION.md` Step 8 and `docs/DEDUPLICATION.md`.
2. Read the relevant columns in `docs/reference/SCHEMA_v5.sql`.
3. Update `docs/NORMALISATION.md` Step 8 with the reschedule path:
   - An `external_events` row has `event_id` set (already linked to a canonical event).
   - Incoming re-ingest has a different `dedupe_key` (start time changed).
   - **Safe path:** update the canonical event's `dedupe_key`, `start_at`, and `availability` in place. Set `availability = 'rescheduled'`. Set `needs_review = true`.
   - **Unsafe path:** the new `dedupe_key` collides with a *different* canonical event → flag `needs_review = true`, surface as merge candidate, do not auto-update.
   - Old canonical row must not remain `visibility = 'published'` as a ghost duplicate after a reschedule.
4. Update `docs/DEDUPLICATION.md` with a "Reschedule" section confirming the above and clarifying: one event ingested → rescheduled → re-ingested → exactly one canonical event, not two published rows.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/NORMALISATION.md docs/DEDUPLICATION.md
```

## Acceptance criteria
- [ ] `docs/NORMALISATION.md` Step 8 includes the safe and unsafe reschedule paths.
- [ ] `availability = 'rescheduled'` is specified to set `needs_review = true`.
- [ ] Ghost duplicate prevention is explicitly stated.
- [ ] `docs/DEDUPLICATION.md` has a "Reschedule" section.
- [ ] The invariant "one event → rescheduled → re-ingested → one canonical event" is stated.

## Stop condition
Stop after both doc files are updated. Report:
- what was added to each file
- any ambiguity about what constitutes an "unsafe" key collision
- recommended next prompt: `Implement docs/tasks/phase-0.5/C5-merge-behaviour-red-tests.md` (which depends on this doc)
