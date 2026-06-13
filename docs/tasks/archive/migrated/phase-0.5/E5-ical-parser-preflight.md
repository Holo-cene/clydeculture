> **ARCHIVED 2026-06-13.** Retained as DESIGN-DOC. iCal parser contract is durable design; no near-term Thread alignment. See `docs/tasks/MIGRATION_TRIAGE.md`.

# E5 — iCal Parser Pre-flight and Parser Spec

## Status
Open

## Purpose
iCal sources (Mono, The Flying Duck) produce events with multiple time formats: UTC timestamps, TZID-qualified local times, floating-times, and VALUE=DATE all-day events. RRULE recurring events need a capping strategy. Without a precise parsing spec, connectors will silently store the wrong UTC times, miss all-day events, or expand infinite recurrences. This task produces the parser spec and updates the existing task file. No code.

## Classification
- Type: spike (spec documentation)
- Blocks: Mono and Flying Duck iCal connector builds
- Can run in parallel: yes (with E1–E4, E6, E7, D tasks, H1)
- Must run after: none
- Must run before: iCal connector implementation

## Files to inspect first
- `docs/tasks/API-04.md` — existing iCal task file
- `docs/NORMALISATION.md` — Step 1 (UTC conversion requirement added by C7)
- `docs/reference/SCHEMA_v5.sql` — `events.is_all_day` column (added by A1)

## Files allowed to edit
- `docs/tasks/API-04.md` — update with is_all_day decision and parsing decisions

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any connector implementations

## Non-goals
- Do not implement the iCal parser.
- Do not write TypeScript code.

## Required steps
1. Read `docs/tasks/API-04.md` in full.
2. Read `docs/NORMALISATION.md` Step 1 (UTC conversion requirement, added in C7).
3. Update `docs/tasks/API-04.md` with the following resolved decisions:

   **RRULE expansion:**
   - Cap at 90 days from the current ingestion date.
   - Expansion produces one `external_events` row per occurrence, each with a unique `externalId` derived from: `{original_uid}_{occurrence_start_UTC}`.
   - UTC output for each occurrence (convert using the event's TZID or `Europe/London` default).

   **Floating-time DTSTART (no TZID):**
   - Interpret as `Europe/London` local time.
   - Convert to UTC before storing in `start_at`.

   **TZID-qualified DTSTART:**
   - Convert from the named IANA zone to UTC.
   - If the IANA zone is unrecognised, log an error and skip the event (do not store a corrupted timestamp).

   **UTC DTSTART (ends in Z):**
   - Store as-is in `start_at`. No conversion needed.

   **VALUE=DATE DTSTART (all-day events):**
   - Set `start_at = start-of-day UTC` (midnight UTC on that date).
   - Set `is_all_day = true` (column added in A1).
   - Frontend must not display `00:00` for all-day events — this is a display requirement, not a storage requirement.

   **RRULE with no COUNT or UNTIL (indefinitely recurring):**
   - Cap expansion at 90 days. Do not store beyond this window.
   - Log a warning when truncation occurs.

4. Confirm: does `events.is_all_day` exist in the schema after A1? If A1 is not yet applied, note this as a dependency.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/tasks/API-04.md
```

## Acceptance criteria
- [ ] `docs/tasks/API-04.md` specifies all 5 DTSTART format handling decisions.
- [ ] RRULE expansion cap (90 days) is documented.
- [ ] `externalId` derivation for recurring occurrences is specified.
- [ ] `is_all_day` handling is documented.
- [ ] Frontend display requirement (no `00:00` for all-day) is noted.

## Stop condition
Stop when `docs/tasks/API-04.md` is updated with all decisions. Report:
- which decisions were already documented vs. added
- whether `is_all_day` dependency on A1 is a blocker
- recommended next prompt: iCal connector implementation (Wave 5)
