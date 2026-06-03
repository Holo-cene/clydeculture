# E3 — DICE.fm Apify Connector Pre-flight

## Status
Open

## Purpose
DICE.fm has no public API. The Phase 1 plan is to use an Apify actor (managed scraping platform) to extract Glasgow events from dice.fm. Before any connector code is written, the correct actor must be identified, its output schema confirmed, ToS/robots.txt compliance verified, and the stable `externalId` strategy resolved. A critical rule: never use Apify dataset item ID as `externalId` — use the upstream event ID if available; otherwise a content hash of `title | startAt | venueName`.

## Classification
- Type: spike (research + decision document)
- Blocks: DICE.fm connector build only
- Can run in parallel: yes (with E1, E2, E4–E7, D tasks, H1)
- Must run after: none
- Must run before: DICE.fm connector implementation

## Files to inspect first
- `docs/tasks/CC-NEW-2.md` — DICE.fm pre-flight requirements
- `packages/connectors/src/apify/dice/` — check for any existing SPEC or actor selection
- `docs/CONNECTOR_GUIDE.md` — Apify connector output format requirements

## Files allowed to edit
- `packages/connectors/src/apify/dice/SPEC.md` (new)
- `docs/tasks/CC-NEW-2.md` — update with findings

## Files not allowed to edit
- `packages/connectors/src/apify/dice/` TypeScript source files
- Any migration files
- Any shared type files

## Non-goals
- Do not write any connector TypeScript code.
- Do not run the Apify actor in production.
- Do not use Apify dataset item ID as `externalId`.

## Required steps
1. Read `docs/tasks/CC-NEW-2.md` in full.
2. Check `packages/connectors/src/apify/dice/` for any existing files.
3. Research Apify actor marketplace for a DICE.fm / dice.fm Glasgow events actor:
   - Actor name, URL, and pinned version.
   - Maintenance status (is it actively maintained?).
   - Cost per run estimate.
4. Map the actor output schema to `RawEvent` fields (all 17 fields from B4). Specifically confirm:
   - Whether a stable upstream DICE event ID is available in the output.
   - If not: confirm content hash strategy: `SHA256(title | startAt | venueName)`.
   - Glasgow-only filtering: is it an actor input parameter or post-processing?
5. Confirm ToS compliance: read dice.fm `robots.txt` for the events page path. Note any Disallow directives.
6. If no suitable Apify actor exists: document the decision to scope a custom actor vs. accept the DICE.fm coverage gap.
7. Write `packages/connectors/src/apify/dice/SPEC.md` with all findings.
8. Update `docs/tasks/CC-NEW-2.md` with a summary.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
ls packages/connectors/src/apify/dice/
git diff docs/tasks/CC-NEW-2.md
```

## Acceptance criteria
- [ ] `packages/connectors/src/apify/dice/SPEC.md` exists.
- [ ] SPEC.md names the selected actor (or documents the gap decision).
- [ ] `externalId` strategy is confirmed: upstream event ID or content hash.
- [ ] Glasgow-only filtering approach is confirmed.
- [ ] ToS / robots.txt for dice.fm is documented.
- [ ] `docs/tasks/CC-NEW-2.md` is updated.

## Stop condition
Stop when SPEC.md is written. Report:
- actor found (name, version) or not found
- `externalId` strategy confirmed
- ToS/robots.txt compliance assessment
- recommended next prompt: DICE.fm connector implementation (Wave 5, after E3 is complete)
