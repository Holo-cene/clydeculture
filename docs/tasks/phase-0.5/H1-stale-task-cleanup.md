# H1 — Stale Task File Cleanup

## Status
Complete

## Purpose
Several existing task files contain stale or incorrect instructions that contradict the Phase 0.5 canonical decisions: references to `packages/ingestion` and `packages/publishing` (replaced by `trigger/`), `is_active` instead of `enabled`, `base_url` that doesn't exist, and stale "add apify later" notes. Leaving these in place means a future Claude Code session could follow stale instructions and create incorrect code. This task is documentation cleanup only.

## Classification
- Type: cleanup (docs only)
- Blocks: nothing directly, but stale docs create implementation risk
- Can run in parallel: yes (provided it only touches the listed files)
- Must run after: none
- Must run before: any Phase 1 implementation that reads these task files

## Files to inspect first (all of these)
- `docs/tasks/INF-01.md`
- `docs/tasks/CC-NEW-2.md`
- `packages/connectors/CLAUDE.md`
- `docs/tasks/BE-03.md`
- `docs/tasks/BE-13.md`
- `package.json` (root) — `scripts` section

## Files allowed to edit
- `docs/tasks/INF-01.md`
- `docs/tasks/CC-NEW-2.md`
- `packages/connectors/CLAUDE.md`
- `docs/tasks/BE-03.md`
- `docs/tasks/BE-13.md`

## Files not allowed to edit
- `package.json` — read-only inspection only (note findings; do not change scripts)
- Any TypeScript source files
- Any migration files
- Any connector implementations
- Files in `docs/tasks/phase-0.5/` — do not modify this new task backlog

## Non-goals
- Do not fix code or implement anything.
- Do not create new tasks or task files.
- Do not merge or combine task files.
- Do not delete task files outright — update them.

## Required steps

### INF-01.md
1. Read `docs/tasks/INF-01.md`.
2. Remove or strike through Steps 5 and 6 if they instruct creating `packages/ingestion` and `packages/publishing`.
3. Add a step referencing `trigger/` scaffolding with `trigger.config.ts` and the Trigger.dev v3 runtime.
4. Update acceptance criteria to remove any reference to `packages/ingestion` or `packages/publishing`.

### CC-NEW-2.md
5. Read `docs/tasks/CC-NEW-2.md`.
6. Replace all occurrences of `is_active` → `enabled`.
7. Remove all references to `base_url` / `baseUrl` (this column does not exist in `sources`).
8. Confirm field names match the `sources` table from `docs/reference/SCHEMA_v5.sql`.

### packages/connectors/CLAUDE.md
9. Read `packages/connectors/CLAUDE.md`.
10. Remove any "add apify later" notes — `'apify'` is now a canonical `SourceType` value (after B3).
11. Verify no other stale notes remain.

### BE-03.md
12. Read `docs/tasks/BE-03.md`.
13. Mark the doc-creation part as "Done".
14. Scope the remaining work to: seed migration only (to be completed in B5).
15. Add a note: "Confidence formula is now specified in docs/NORMALISATION.md Step 4. BE-03 must not contradict it."

### BE-13.md
16. Read `docs/tasks/BE-13.md`.
17. Mark as "Superseded by docs/NORMALISATION.md for formula definition."
18. Scope remaining work to: creating `ConfidenceInputs` type in `packages/shared/src/types/confidence.ts` (done in C2).
19. Add a note: "Do not implement any confidence formula here — NORMALISATION.md is canonical."

### package.json scripts
20. Read the `scripts` section of root `package.json`.
21. Note (in the report only — do not edit) whether any script references `packages/ingestion` or `packages/publishing`. If so, flag for the user to fix in a separate PR.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/tasks/INF-01.md docs/tasks/CC-NEW-2.md packages/connectors/CLAUDE.md docs/tasks/BE-03.md docs/tasks/BE-13.md
```

## Acceptance criteria
- [x] `docs/tasks/INF-01.md` does not instruct creation of `packages/ingestion` or `packages/publishing`.
- [x] `docs/tasks/CC-NEW-2.md` uses `enabled`, not `is_active`; no `base_url` reference.
- [x] `packages/connectors/CLAUDE.md` has no "add apify later" note.
- [x] `docs/tasks/BE-03.md` marks doc-creation as done; scopes to seed migration.
- [x] `docs/tasks/BE-13.md` is marked as superseded by NORMALISATION.md.
- [x] Root `package.json` scripts are inspected and any `packages/ingestion`/`packages/publishing` references are flagged in the report.

## Stop condition
Stop when all five task files are updated. Report:
- files changed and what was changed
- whether `package.json` scripts reference removed packages (flag if so)
- recommended next prompt: begin Wave 2 red-tests (C1–C6, G1) in parallel
