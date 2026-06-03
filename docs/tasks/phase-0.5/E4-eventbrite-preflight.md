# E4 — Eventbrite Connector Pre-flight

## Status
Open

## Purpose
Eventbrite's ToS §5 prohibits scraping ("you agree not to scrape, crawl, or spider any page"). This may block the planned Apify actor approach. Additionally, Eventbrite's public API was deprecated for third parties in 2023. The correct Phase 1 approach for Eventbrite is unresolved. This task produces a compliance assessment and a go/no-go decision. If ToS blocks both scraping and API access, this task removes Eventbrite from Phase 1 scope.

## Classification
- Type: spike (compliance assessment + decision)
- Blocks: Eventbrite connector build (or removes it from scope)
- Can run in parallel: yes (with E1, E2, E3, E5–E7, D tasks, H1)
- Must run after: none
- Must run before: any Eventbrite connector implementation

## Files to inspect first
- `docs/tasks/API-01.md` — existing Eventbrite task file (check Option C: org-scoped API polling)
- `packages/connectors/src/apify/eventbrite/` or `packages/connectors/src/api/eventbrite/` — check existing state
- `docs/CONNECTOR_GUIDE.md` — ToS compliance requirements

## Files allowed to edit
- `docs/tasks/EVENTBRITE-PREFLIGHT.md` (new — create in `docs/tasks/`, not in `phase-0.5/`)
- `docs/connectors/eventbrite/COMPLIANCE.md` (new — create path if needed)
- `docs/tasks/API-01.md` — update with outcome

## Files not allowed to edit
- `packages/connectors/src/apify/eventbrite/` TypeScript source files
- Any migration files

## Non-goals
- Do not write any Eventbrite connector code.
- Do not make any API calls without confirming ToS compliance.
- Do not assume the Apify approach is permitted without confirming it.

## Required steps
1. Read `docs/tasks/API-01.md` in full, especially Option C (org-scoped API polling).
2. Check `packages/connectors/src/apify/eventbrite/` for any existing files.
3. Assess Eventbrite ToS §5 ("no scraping"): does this prohibition extend to:
   a. Third-party Apify actors that scrape the public site?
   b. Operator-controlled scrapers for events the operator organises?
4. Assess Eventbrite API status: is there any current API access path for third parties (as of mid-2026)?
5. Document the findings in `docs/tasks/EVENTBRITE-PREFLIGHT.md`:
   - ToS §5 assessment result.
   - API access current status.
   - Option C assessment (org-scoped API): viable for reading Glasgow events broadly? Or only own-org events?
   - **Go/no-go decision:**
     - If ToS permits AND a viable API path exists: proceed to connector build.
     - If ToS blocks scraping AND no API path: defer Eventbrite to Phase 2, document the decision.
6. If the decision is "no Phase 1": create `docs/connectors/eventbrite/COMPLIANCE.md` documenting why and what the Phase 2 reassessment condition would be.
7. Update `docs/tasks/API-01.md` with the outcome.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
ls docs/tasks/EVENTBRITE-PREFLIGHT.md
git diff docs/tasks/API-01.md
```

## Acceptance criteria
- [ ] `docs/tasks/EVENTBRITE-PREFLIGHT.md` exists with a clear go/no-go decision.
- [ ] ToS §5 scraping prohibition is assessed.
- [ ] API access current status is confirmed.
- [ ] Option C (org-scoped) is assessed.
- [ ] If deferred: `docs/connectors/eventbrite/COMPLIANCE.md` documents the decision.
- [ ] `docs/tasks/API-01.md` is updated.

## Stop condition
Stop when the pre-flight document is complete and a go/no-go decision is documented. Report:
- the decision: Phase 1 or deferred
- which access path (if any) is viable
- recommended next prompt: if go → Eventbrite connector implementation; if no-go → remove from Wave 5 plan
