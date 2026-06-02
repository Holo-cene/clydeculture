# ADR 0002: Ingestion runtime

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** Jamie

## Context

Connectors are TypeScript/Node modules in a pnpm monorepo. The original `INGESTION.md`
described the orchestrator running inside a Supabase Edge Function, which runs on Deno.
Deno is incompatible with Node built-ins (`node:crypto`), npm packages installed via
pnpm, and pnpm workspace cross-package imports — without an explicit, undocumented
bundle step. This blocked every downstream decision: connector imports, test setup,
CI/CD, and whether Crawlee (a Node library) could run in-process.

Three execution hosts were considered:

- **Option A — Supabase Scheduled Edge Functions.** Deno runtime, 150-second
  wall-clock limit per invocation, Node/npm incompatibility, complex bundle step
  required for pnpm workspace packages.

- **Option B — External Node worker (GitHub Actions / Render / Railway cron).** Node
  runtime, no wall-clock limit, full npm compatibility, straightforward pnpm workspace
  import. More infrastructure to manage than Option A.

- **Option C — pg_cron + pg_net.** Hardest to test locally, least visibility. Not
  recommended.

## Decision

**Trigger.dev v3, running as a Node/Bun worker alongside the Supabase project.**

Trigger.dev is TypeScript-native and handles scheduling (cron triggers), retries,
fan-out across multiple tasks, realtime run logs, and failure alerting out of the
box. It runs as a Node process, eliminating the Deno incompatibility. The existing
connector interface (`run() → IngestResult`) maps directly to a Trigger.dev task
with no interface change. Each connector becomes one Trigger.dev task; the
orchestrator sweep becomes a parent task that fans out to per-connector tasks.

Trigger.dev's managed infrastructure replaces the custom orchestrator (`packages/ingestion`)
that was planned. The `packages/ingestion` directory is removed from the monorepo.

## Consequences

**`packages/ingestion` is removed.** Trigger.dev handles:
- Cron scheduling (daily sweep trigger)
- Per-connector task isolation (a failing task does not affect others)
- Retries and exponential backoff
- Fan-out for parallel connector runs
- Realtime run logs visible in the Trigger.dev dashboard
- Failure alerting (Trigger.dev alert rules fire on task failure)

**`ingest_runs` is retained in the schema.** Trigger.dev's run dashboard provides
task-level logs, but `ingest_runs` gives Supabase-side access to Clyde Culture-specific
metrics (`parsed_count`, `created_events_count`, `updated_events_count`) that
Trigger.dev cannot surface. This enables:
- Break detection (14-day rolling median of `parsed_count`) as a Postgres query
- Admin dashboard queries joining run history against `sources` and `events`
- The Supabase Studio view as the single health surface alongside Trigger.dev's UI

Each Trigger.dev task writes its own `ingest_runs` row on start and updates it on
completion. Break detection runs as a follow-up check inside the same task after the
`ingest_runs` row is written. The break detection logic (comparing `parsed_count`
against the 14-day median) remains a Postgres function called via the Supabase client.

**Crawlee runs in-process inside Trigger.dev tasks.** Crawlee is a Node.js library;
it runs wherever Node runs. HTML scraper connectors use Crawlee internally and remain
in `packages/connectors/src/html/`. No separate worker or package is needed.

**Apify connectors call the Apify API from a Trigger.dev task.** The task triggers
an Apify actor run, polls for completion, fetches the output dataset, converts to
`RawEvent[]`, and writes to `external_events`. The connector interface is unchanged;
the Apify HTTP calls are implementation details inside the connector's `run()` method.

**Secrets.** Trigger.dev tasks connect to Supabase using `SUPABASE_SERVICE_ROLE_KEY`
set as a Trigger.dev environment secret. Third-party API keys (`TICKETMASTER_API_KEY`,
`APIFY_API_KEY`, etc.) are also set as Trigger.dev secrets. This is consistent with
the existing secrets model: no secrets in committed files or in `sources.config`.

**Resolved tasks:** BE-01 (runtime conflict), BE-05 (fan-out for long sweeps),
API-07 (cold-start detection — Trigger.dev handles zero-result task alerts), BE-08
(dead-letter path — Trigger.dev retry + failure alert), DOC-02 (logging convention —
Trigger.dev structured logs), INF-02 (CI/CD for the worker — Trigger.dev deploy CLI).
