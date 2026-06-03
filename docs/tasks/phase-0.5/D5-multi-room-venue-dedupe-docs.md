# D5 — Document Multi-Room Venue Dedupe Limitation

## Status
Open

## Purpose
SWG3, the Barrowlands complex, and other Glasgow multi-room venues share a single `venue_id`, causing `dedupe_key` collisions for simultaneous events with similar titles across different rooms. Without documentation, the implementation team will either silently merge these events or be surprised by a flood of merge candidates. This task documents the known limitation and chooses a Phase 1 approach. No code.

## Classification
- Type: docs-only
- Blocks: none (deduplication can proceed with the documented limitation)
- Can run in parallel: yes (with all D tasks)
- Must run after: none
- Must run before: none (but ideally before deduplication implementation)

## Files to inspect first
- `docs/DEDUPLICATION.md` — check for any existing multi-room section
- `docs/reference/SCHEMA_v5.sql` — `venues` table (check for `parent_venue_id` or `room_name` columns)
- `docs/reference/SCHEMA_v5.sql` — `events` table (check for `room_name` column)

## Files allowed to edit
- `docs/DEDUPLICATION.md`

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- The schema

## Non-goals
- Do not add `parent_venue_id` or `room_name` to the schema.
- Do not implement any deduplication changes.
- Do not create a new task file for schema changes (just park them clearly).

## Required steps
1. Read `docs/DEDUPLICATION.md` in full.
2. Read `docs/reference/SCHEMA_v5.sql` to check if `events.room_name` or `venues.parent_venue_id` already exist.
3. Add a "Multi-Room Venues" section to `docs/DEDUPLICATION.md` covering:
   - **Known limitation:** SWG3 Tech Room, SWG3 Warehouse 23, etc. share a single `venue_id`. Simultaneous events with similar titles will generate false-positive `event_merge_candidates` rows.
   - **Phase 1 decision:** Accept as a known limitation. These candidates surface in human review via `needs_review = true`. Document that SWG3 multi-room events will occasionally appear as merge candidates.
   - **Future option 1:** Model sub-venues as child venue rows with `parent_venue_id` — more schema work, deferred to Phase 1.5.
   - **Future option 2:** Add `events.room_name` text field and include it as an optional component of `compute_dedupe_key` when non-null — smallest change, most accurate. Parked as a Phase 1.5 task.
   - **Action required in Phase 1.5:** A task should be created to decide and implement one of the future options.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/DEDUPLICATION.md
```

## Acceptance criteria
- [ ] `docs/DEDUPLICATION.md` has a "Multi-Room Venues" section.
- [ ] Phase 1 decision (accept limitation, rely on `needs_review`) is clearly stated.
- [ ] Future options are documented.
- [ ] Phase 1.5 action is noted.

## Stop condition
Stop after `docs/DEDUPLICATION.md` is updated. Report:
- what was added
- whether `parent_venue_id` or `room_name` already exist in the schema
- recommended next prompt: any parallel D task
