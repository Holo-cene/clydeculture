# Prompt Archive

Archived prompt files are retained for project history and review evidence. They are not
active prompts.

## Migrated (2026-06-13, issue #8)

Files in `migrated/` were migrated into GitHub issues per
[ADR 0008](../../decisions/0008-tracer-bullet-delivery.md) and issue
[#8](https://github.com/Holo-cene/clydeculture/issues/8). Every migrated prompt
carries a one-line `ARCHIVED 2026-06-13` pointer at the top to its target issue
or to its retained DESIGN-DOC status. The classification table for the whole
migration is [`../../tasks/MIGRATION_TRIAGE.md`](../../tasks/MIGRATION_TRIAGE.md).

## Completed Prompts

Files in `completed/` were one-off implementation or planning prompts whose requested
outcome has landed.

| File | Completion evidence |
|---|---|
| `03-frontend-publishing-decision.md` | ADR 0001 and CC-NEW-1 settled Astro/Supabase direct read and removed Webflow publish mappings. |
| `04-ticketmaster-fixture-e2e-red-test.md` | Ticketmaster fixture/E2E test coverage exists in `packages/core`. |
| `05-ticketmaster-fixture-e2e-implementation.md` | The fixture path implementation and tests exist. |
| `07-source-policy-and-link-first-compliance.md` | `docs/source-policy.md` and link-first normalisation docs exist. |
| `08-demo-data-to-realistic-demo-urls.md` | Demo seed URLs no longer use `example.org`; demo source label was updated. |
| `09-ci-validation-workflow.md` | `.github/workflows/ci.yml` exists. |
| `10-next-source-fixture-plan.md` | `docs/next-source-plan.md` exists. |

## Historical Master Logs

Files in `historical/` are the old master prompt logs that were later split into
task files. They are useful for provenance only and should not be treated as active
work instructions.
