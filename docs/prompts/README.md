# Clyde Culture Prompt Library

> **Migrated.** The active prompt library (prompts 11–24) was migrated into
> GitHub issues per [ADR 0008](../decisions/0008-tracer-bullet-delivery.md) and
> issue [#8](https://github.com/Holo-cene/clydeculture/issues/8). See
> [`../tasks/MIGRATION_TRIAGE.md`](../tasks/MIGRATION_TRIAGE.md) for the
> classification table.

This directory now holds **only utility/audit prompts** — tools used during
reviews, not work items. The active backlog lives as GitHub issues.

## Utility Prompts (retained)

| File | Purpose |
|---|---|
| [00-repo-status-reassessment.md](00-repo-status-reassessment.md) | Reusable audit after any implementation branch. |
| [01-mvp-acceptance-review.md](01-mvp-acceptance-review.md) | Verify the seeded demo is still demoable. |
| [06-ingestion-orchestration-review.md](06-ingestion-orchestration-review.md) | Review sweep wiring before live multi-connector ingestion. |
| [99-prompt-writing-standards.md](99-prompt-writing-standards.md) | Standards for any new prompt added here. |

## Where to find current work

- Open issues: <https://github.com/Holo-cene/clydeculture/issues>
- Migrated prompt evidence: [`archive/migrated/`](archive/migrated/).
- Superseded prompts: [`archive/superseded/`](archive/superseded/) (do not re-run).
- Historical master logs: [`archive/historical/`](archive/historical/).

## Standards

See [99-prompt-writing-standards.md](99-prompt-writing-standards.md) for rules
that apply when adding any new utility/audit prompt.
