# E1 — Ticketmaster Connector Pre-flight

## Status
Open

## Purpose
Before any Ticketmaster connector code is written, the API geography filtering format, pagination limits, quota model, ToS attribution requirements, and image display permissions must be confirmed. An incorrect geo-filter or a misunderstood quota model could result in connector logic that works in testing but hits daily limits in production. This is a research/spike task. Produce a SPEC.md and a fixture response file.

## Classification
- Type: spike (research + document)
- Blocks: Ticketmaster connector build only
- Can run in parallel: yes (with E2–E7, D tasks, H1)
- Must run after: none
- Must run before: Ticketmaster connector implementation

## Files to inspect first
- `docs/tasks/API-02.md` — existing Ticketmaster task file
- `packages/connectors/src/api/ticketmaster/` — check for any existing SPEC or fixtures
- `docs/CONNECTOR_GUIDE.md` — connector output format requirements

## Files allowed to edit
- `docs/tasks/API-02.md` — update with findings
- `packages/connectors/src/api/ticketmaster/SPEC.md` (new)
- `packages/connectors/src/api/ticketmaster/fixtures/response.json` (new)

## Files not allowed to edit
- `packages/connectors/src/api/ticketmaster/` TypeScript source files
- Any migration files
- Any shared type files

## Non-goals
- Do not write any connector TypeScript code.
- Do not implement any API calls in production code.
- Do not make API calls without first confirming key availability.

## Required steps
1. Read `docs/tasks/API-02.md` for existing context and open questions.
2. Check if `packages/connectors/src/api/ticketmaster/` contains any existing files.
3. Research and document the following in `packages/connectors/src/api/ticketmaster/SPEC.md`:
   a. **Glasgow geo-filter format:** `geoPoint` (geohash) vs `latlong` + `countryCode=GB`. Confirm which the API accepts and the correct Glasgow city centre coordinates.
   b. **Radius and unit:** recommended `radius` and `unit` for ~10km around Glasgow city centre.
   c. **Deep paging cap:** document the 1,000-result maximum per query. Describe the 14-day rolling window strategy (query in date-range slices to stay within this limit).
   d. **Daily quota:** 5,000 calls per day. Model worst-case daily call count for Phase 1 (one sweep per day, multiple date-window queries).
   e. **Attribution requirements:** verbatim ToS requirement for "Buy Tickets" button or equivalent link-back.
   f. **Image URL permissions:** whether image URLs from the API may be displayed publicly, and any caching TTL requirements.
4. Capture a real (or realistic mock) multi-event Glasgow response as `packages/connectors/src/api/ticketmaster/fixtures/response.json`. If a real API key is not available, create a minimal fixture that accurately represents the API response structure.
5. Update `docs/tasks/API-02.md` with a summary of findings and mark open questions as resolved or still-open.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
ls packages/connectors/src/api/ticketmaster/
git diff docs/tasks/API-02.md
```

## Acceptance criteria
- [ ] `packages/connectors/src/api/ticketmaster/SPEC.md` exists and answers all 6 questions above.
- [ ] `packages/connectors/src/api/ticketmaster/fixtures/response.json` exists with a plausible multi-event structure.
- [ ] `docs/tasks/API-02.md` is updated with findings.
- [ ] Worst-case daily call count is modelled.
- [ ] Attribution requirements are quoted verbatim (or linked).

## Stop condition
Stop when SPEC.md and fixtures are written. Report:
- answers to each of the 6 research questions
- whether a real API key was available for fixture capture
- any open questions that could not be resolved
- whether Ticketmaster quota allows Phase 1 scope
- recommended next prompt: Ticketmaster connector implementation (Wave 5)
