# Task Archive

Archived task files are retained for evidence and traceability. They are not active
implementation prompts.

## Migrated (2026-06-13, issue #8)

Files in `migrated/{top-level,phase-0.5}/` were migrated into GitHub issues per
[ADR 0008](../../decisions/0008-tracer-bullet-delivery.md) and issue
[#8](https://github.com/Holo-cene/clydeculture/issues/8). Every migrated file
carries a one-line `ARCHIVED 2026-06-13` pointer at the top to its target issue
or to its retained DESIGN-DOC status. The classification table for the whole
migration is [`../MIGRATION_TRIAGE.md`](../MIGRATION_TRIAGE.md).

## Completed

These files moved to `completed/` because their requested outcome has landed in current
docs, migrations, tests, package code, CI, or ADRs.

| Folder | Files | Completion evidence |
|---|---|---|
| `completed/top-level/` | API-01, API-02, API-06, API-07 | ADR 0003, Ticketmaster SPEC/fixtures, and Trigger/alerting decisions cover the original API spikes. |
| `completed/top-level/` | BE-01, BE-03, BE-05, BE-08, BE-09, BE-10, BE-13, BE-14, BE-20 | Runtime ADR, normalisation docs, dedupe/session-timezone correction, and current `RawEvent` contract cover the original backend tasks. |
| `completed/top-level/` | CC-NEW-1, CC-NEW-3, CC-NEW-4 | Schema correction migration and stale-runtime docs work are complete. |
| `completed/top-level/` | DB-01, DB-03, DB-07, DB-08 | CC-NEW-1/ops docs made these complete or moot. |
| `completed/top-level/` | DOC-02, DOC-03 | Error/logging and stale Eventbrite docs were resolved by current docs/ADRs. |
| `completed/top-level/` | INF-01, INF-02 | Workspace package setup and CI are in place. |
| `completed/top-level/` | SEC-01, SEC-10 | Anon-key/service-role policy and Ticketmaster image licensing are documented. |
| `completed/phase-0.5/` | A1, A2, A3, B1, B2, B3, B4, B5, C1, C7, D1, D2, D3, D4, D5, D6, E1, H1 | Phase 0.5 contract, docs, migration, pre-flight, and cleanup tasks landed. |

## Superseded

These files moved to `superseded/` because later decisions changed the approach. Do not
use them as current instructions without rewriting them.

| Folder | Files | Why superseded |
|---|---|---|
| `superseded/top-level/` | BE-04 | Reschedule behaviour is now documented in `docs/DEDUPLICATION.md`; remaining work belongs in focused tests/normalisation code. |
| `superseded/top-level/` | BE-06 | Fuzzy threshold is documented as `0.35`; implementation should be driven by current dedupe tasks, not the old schema idea. |
| `superseded/top-level/` | BE-11 | Webflow denormalised venue-display fields were dropped, so rename propagation is no longer the same task. |
| `superseded/top-level/` | BE-15 | Trigger.dev replaced the old pg_cron/Edge scheduling approach for ingestion orchestration. |
| `superseded/top-level/` | BE-18 | Basic connector test infrastructure exists; any new shared test utility should be a fresh scoped task. |
| `superseded/top-level/` | DB-04 | Scheduled ingestion moved to Trigger.dev; pg_cron assumptions are stale. |
