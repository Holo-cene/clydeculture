# E2 — Skiddle Connector Pre-flight

## Status
Open

## Purpose
The Skiddle API requires written approval before commercial use. Without approval, building a Skiddle connector is a ToS violation. This task documents the approval request, sets a 2-week deadline, and identifies the fallback strategy if approval is not granted. No connector code until approval is confirmed.

## Classification
- Type: spike (research + decision document)
- Blocks: Skiddle connector build only
- Can run in parallel: yes (with E1, E3–E7, D tasks, H1)
- Must run after: none
- Must run before: Skiddle connector implementation (blocked until approval)

## Files to inspect first
- `docs/tasks/API-03.md` — existing Skiddle task file (check for non-compete clause notes and approval status)
- `docs/CONNECTOR_GUIDE.md` — connector ToS requirements section

## Files allowed to edit
- `docs/tasks/API-03.md` — update with sent-email date, fallback strategy, deadline

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any connector source files

## Non-goals
- Do not write any Skiddle connector code.
- Do not make API calls to Skiddle without approval.
- Do not delay other work waiting for Skiddle's reply.

## Required steps
1. Read `docs/tasks/API-03.md` in full. Note any non-compete clause concerns and prior approval status.
2. Send (or document as sent) a written approval request to dev@skiddle.com. The request must include:
   - Project description (non-profit Glasgow cultural noticeboard, link-first, no republication).
   - Intended use: read-only event listing, link-back to Skiddle.
   - Expected query volume.
3. Record in `docs/tasks/API-03.md`:
   - Date approval request was sent (use today's date: 2026-06-03).
   - 2-week reply deadline: 2026-06-17.
   - What happens if no reply: escalate to fallback strategy.
4. Document the fallback strategy options if Skiddle refuses or does not reply:
   - **Option A:** Gigs in Scotland (check API availability and ToS).
   - **Option B:** Songkick (check API status — note it was deprecated for third parties; verify current state).
   - **Option C:** Accept the Skiddle coverage gap and focus on Ticketmaster + DICE + iCal/HTML sources.
5. Assess non-compete clause risk: does Skiddle's ToS prohibit listing events that compete with Skiddle's own discovery product? Document the risk assessment.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/tasks/API-03.md
```

## Acceptance criteria
- [ ] `docs/tasks/API-03.md` records the date the approval email was sent.
- [ ] The 2-week deadline (2026-06-17) is documented.
- [ ] Fallback options (Gigs in Scotland, Songkick, accept gap) are assessed.
- [ ] Non-compete clause risk is documented.
- [ ] No Skiddle connector code is written.

## Stop condition
Stop when `docs/tasks/API-03.md` is updated with all required information. Report:
- whether the approval request has been sent (and to whom)
- non-compete risk assessment outcome
- recommended fallback if refused
- recommended next prompt: check back on 2026-06-17 if no reply
