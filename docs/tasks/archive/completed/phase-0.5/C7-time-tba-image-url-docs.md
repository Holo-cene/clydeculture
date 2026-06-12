# C7 — Document time_tba Placeholder Convention and UTC Conversion Requirement

## Status
Done

## Purpose
`docs/NORMALISATION.md` contains a direct contradiction: `start_at` is `NOT NULL` in the schema, but NORMALISATION.md says "if `start_at` is null, `time_tba = true`" — meaning connectors need to store *something* when no start time is available. The midnight placeholder convention is undocumented, which means connectors can silently collide with genuine midnight events. Similarly, the UTC conversion requirement and `image_url` HTTPS validation are not specified, allowing connectors to store local time strings as UTC or malformed image URLs. This is a documentation-only task.

## Classification
- Type: docs-only
- Blocks: connector code (connectors cannot correctly implement these without the spec)
- Can run in parallel: yes (independent of all other tasks)
- Must run after: none
- Must run before: all connector implementations

## Files to inspect first
- `docs/NORMALISATION.md` — Step 1 (current start_at and image_url handling)
- `docs/reference/SCHEMA_v5.sql` — confirm `start_at NOT NULL` and `time_tba` column definitions
- `packages/connectors/src/connector.ts` — check current `RawEvent` fields for `startAt`, `isFreeGuess`

## Files allowed to edit
- `docs/NORMALISATION.md` — Step 1 additions only

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any connector implementations

## Non-goals
- Do not implement any conversion logic.
- Do not change the schema.
- Do not add a new migration for `time_tba` (it should already exist in the schema).

## Required steps
1. Read `docs/NORMALISATION.md` Step 1 in full and note the current `start_at` / `time_tba` wording.
2. Read `docs/reference/SCHEMA_v5.sql` to confirm: `start_at TIMESTAMPTZ NOT NULL`, `time_tba boolean`, `is_all_day boolean` (added in A1).
3. Update `docs/NORMALISATION.md` Step 1 with three additions:

   **a) UTC conversion requirement:**
   > Connectors are responsible for converting extracted times to UTC before populating `start_at`. Never store a local time string as if it were UTC. The IANA timezone used for conversion must come from `sources.config.timezone` if set, or `'Europe/London'` as the default.

   **b) `time_tba` placeholder convention:**
   > When a connector cannot extract a start time, it must:
   > - Set `time_tba = true`
   > - Set `start_at = date_trunc('day', <event_date_in_local_tz> AT TIME ZONE 'Europe/London')` — midnight of the event day in local time, converted to UTC.
   > - Known limitation: this may collide with a genuine midnight event. The collision is documented and accepted as a Phase 1 limitation.

   **c) `image_url` HTTPS validation:**
   > `imageUrlGuess` is stored as `image_url` only if it is a valid absolute HTTPS URL (same check as `isValidHttpsUrl()`). Any non-empty string that fails this check — including relative paths, `"N/A"`, `"https://"`, or other malformed values from scrapers — must be set to null before the canonical event is written. This prevents `has_image = true` for invalid values.

4. Verify there is no remaining contradiction in Step 1 between `start_at NOT NULL` and the `time_tba` null path.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/NORMALISATION.md
```

## Acceptance criteria
- [ ] `docs/NORMALISATION.md` Step 1 specifies the UTC conversion requirement.
- [ ] Step 1 specifies the midnight placeholder convention and documents the known collision limitation.
- [ ] Step 1 specifies the `image_url` HTTPS validation requirement.
- [ ] The `start_at NOT NULL` contradiction is resolved (the placeholder convention is the resolution).
- [ ] No connector can produce `has_image = true` for a non-HTTPS or malformed `image_url`, per the spec.

## Stop condition
Stop after `docs/NORMALISATION.md` is updated. Report:
- what was changed and where
- whether any contradiction in Step 1 remains
- recommended next prompt: proceed with any Wave 2 task that was waiting on these specs
