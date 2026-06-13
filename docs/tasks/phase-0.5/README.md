# Phase 0.5 Task Backlog

This directory now contains only active Phase 0.5 task briefs. Completed task files were
moved to `docs/tasks/archive/completed/phase-0.5/`.

The immediate project direction remains the accepted vertical slice: prove one
Ticketmaster path end to end, then use real data quality to finish the remaining tests.
Do not run these task files automatically during backlog review.

## Active Phase 0.5 Tasks

| File | Status | Needed? | Missing or blocker |
|---|---|---|---|
| [F1-public-submission-gate.md](F1-public-submission-gate.md) | Open | Phase 2 | Public submission scope is gated; missing final security/rate-limit implementation plan. |
| [F2-link-only-enforcement.md](F2-link-only-enforcement.md) | Open | Yes | Link-only storage is documented, but typed source enforcement and tests are missing. |
| [F3-gdpr-retention.md](F3-gdpr-retention.md) | Open | Phase 2 | Retention policy and deletion/anonymisation implementation remain unresolved. |
| [G1-trigger-sweep-orchestration.md](G1-trigger-sweep-orchestration.md) | Partial | Yes | Core sweep tests/code exist, but source `last_*` stamps, source status updates, deletion handling, and Trigger schedule wiring need review. |

## Completed In Archive

The following Phase 0.5 files were reviewed as complete and moved to
`docs/tasks/archive/completed/phase-0.5/`:

- A1, A2, A3
- B1, B2, B3, B4, B5
- C1, C7
- D1, D2, D3, D4, D5, D6
- E1
- H1

## Working Rules

- `docs/NORMALISATION.md` is canonical for normalisation behaviour.
- `docs/reference/SCHEMA_v5.sql` and migrations are canonical for table fields, column
  names, enum values, and RLS assumptions.
- The two-step TDD workflow in `AGENTS.md` applies to implementation tasks.
- Docs-only, planning, and pre-flight tasks do not need tests, but they must not run
  ingestion or mutate external services unless their own task explicitly requires it.
- Archived task files are evidence only. If an active task needs historical detail, it
  should link to the archived file rather than moving it back into the active backlog.
