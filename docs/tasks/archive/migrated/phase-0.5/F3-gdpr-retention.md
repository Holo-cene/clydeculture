> **ARCHIVED 2026-06-13.** Migrated to issue #14 (GDPR retention). Consolidated with SEC-06. See `docs/tasks/MIGRATION_TRIAGE.md`.

# F3 — GDPR / Retention Documentation

## Status
Open

## Purpose
Clyde Culture will eventually collect email addresses via a public event submission form. Before any form is launched, GDPR lawful basis, retention policy, DSAR process, and a privacy notice must be in place. This task updates the SEC-06 task file and OPERATIONS.md with the required policy documentation. No implementation.

## Classification
- Type: docs-only (task file + operations doc update)
- Blocks: public submission form deployment only
- Can run in parallel: yes (with all other tasks)
- Must run after: none
- Must run before: public submission form implementation (Phase 2)

## Files to inspect first
- `docs/tasks/SEC-06.md` — existing GDPR task file
- `docs/OPERATIONS.md` — check for any existing privacy/GDPR section
- `docs/reference/SCHEMA_v5.sql` — `event_submissions` table, `submitter_email` field

## Files allowed to edit
- `docs/tasks/SEC-06.md` — update with policy requirements
- `docs/OPERATIONS.md` — add GDPR/privacy section

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any Edge Function implementations

## Non-goals
- Do not implement the retention function.
- Do not implement the Trigger.dev retention task.
- Do not build any public form.

## Required steps
1. Read `docs/tasks/SEC-06.md` and `docs/OPERATIONS.md` in full.
2. Update `docs/tasks/SEC-06.md` with:
   - **Lawful basis:** Legitimate interests (processing event submissions to fulfil the platform's community purpose). Document this choice and note that it should be reviewed by someone with legal expertise before the form launches.
   - **Retention policy:** Rejected `event_submissions` → delete after 30 days. Approved submissions → anonymise `submitter_email` after the event date passes.
   - **`delete_rejected_submissions()` migration:** SQL function that deletes rejected submissions older than 30 days. Reference as a migration task.
   - **Trigger.dev task:** A daily Trigger.dev task calls the retention function after the sweep.
   - **DSAR process:** Submitters can request deletion of their data by emailing hello@jamiecoop.com (project owner email). Response SLA: 30 days.
3. Add a GDPR / Privacy section to `docs/OPERATIONS.md` covering:
   - Lawful basis.
   - What data is collected (email, submission content).
   - Retention periods.
   - DSAR contact and process.
   - Privacy notice link requirement (noted as: "add privacy notice URL before form launches").
4. Mark both as "Not implemented — Phase 2".

## Test command / verification
No automated test — verify by git diff.

```bash
git diff docs/tasks/SEC-06.md docs/OPERATIONS.md
```

## Acceptance criteria
- [ ] `docs/tasks/SEC-06.md` documents lawful basis, retention periods, and DSAR process.
- [ ] `docs/OPERATIONS.md` has a GDPR/Privacy section.
- [ ] `delete_rejected_submissions()` retention function is described (not implemented).
- [ ] Privacy notice requirement is documented.
- [ ] Both are marked as Phase 2.

## Stop condition
Stop when both files are updated. Do not implement. Report:
- what was added
- any policy decisions that require legal review before launch
- recommended next prompt: any parallel F or D task
