# Engineering Backlog

> **Work-truth = GitHub issues.** Per [ADR 0008](../decisions/0008-tracer-bullet-delivery.md),
> all work items live as `ready-for-agent` vertical-slice issues in the
> [Holo-cene/clydeculture](https://github.com/Holo-cene/clydeculture/issues) issue
> tracker, consumed by the `.sandcastle/` runtime. `docs/tasks/` no longer holds an
> active backlog.

This directory now contains:

- **`MIGRATION_TRIAGE.md`** — the classification table used to migrate the legacy
  `docs/tasks/` and `docs/prompts/` backlog into issues. Every active file in
  those directories has one classification row anchored to an ADR or existing
  issue. Retained as evidence of the migration decisions.
- **`archive/`** — every legacy task file:
  - `archive/completed/{top-level,phase-0.5}/` — outcome landed in code/docs/migrations.
  - `archive/migrated/{top-level,phase-0.5}/` — migrated into an issue or retained as a design-doc; each file carries a one-line pointer.
  - `archive/superseded/{top-level,phase-0.5}/` — approach changed by a later ADR; do not re-run.

`phase-0.5/` retains its own README for traceability but is empty of active tasks.

## Where to find current work

- Open issues: <https://github.com/Holo-cene/clydeculture/issues>
- PRD / tracer-bullet plan: see issue [#2](https://github.com/Holo-cene/clydeculture/issues/2).
- ADRs (durable architecture decisions): `docs/decisions/`.

## Working rules (still in effect for whichever issue you pick up)

- `docs/NORMALISATION.md` is canonical for normalisation behaviour.
- `supabase/migrations/` and `docs/reference/SCHEMA_v5.sql` are canonical for
  table fields, column names, enum values, and RLS assumptions.
- The two-step TDD policy in `CLAUDE.md` applies to implementation work.
- Archived files are evidence only — do not re-run them as instructions. If an
  active issue needs historical detail, link to the archived file.
