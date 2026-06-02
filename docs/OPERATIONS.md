# Operations Guide

Clyde Culture is designed to run at 1–3 hours of maintenance per month after the
initial build. This document covers environments, secrets, scheduled ingestion,
monitoring, the break-detection alert flow, the moderation queue, and backups.

---

## Environments

**Local** — Run a full Supabase stack on your machine using the Supabase CLI
(`supabase start`). This spins up Postgres, Auth, Storage, and the Edge Functions
runtime in Docker. Migrations are applied automatically from `supabase/migrations/`.
Use `supabase db reset` to tear down and rebuild from scratch. The local Studio UI
is available at `http://localhost:54323` and is the easiest way to inspect tables
during development. Connectors and ingestion jobs run against the local DB by
pointing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at the local instance.

**Production** — A Supabase project (free or Pro tier). Apply migrations with
`supabase db push` or via the Supabase dashboard's SQL editor for one-off fixes.
Never edit the database schema out of band — all changes go through
`supabase/migrations/` so the local and production schemas stay in sync. The
production Supabase project URL and keys are stored in environment variables (see
below) and should never appear in committed files.

---

## Secrets Management

Three categories of secret are in play:

- **Third-party API keys** — Ticketmaster, Skiddle, Eventbrite, Meetup, etc. These
  go in environment variables (`TICKETMASTER_API_KEY`, `SKIDDLE_API_KEY`, and so on).
  In the local environment they live in a `.env` file that is gitignored. In
  production they are set as Edge Function secrets via `supabase secrets set` or
  stored in Supabase Vault for values that must be readable at query time.

- **Supabase project credentials** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  are required by ingestion jobs and the publish adapter. The service role key
  bypasses Row Level Security and must be kept out of client-side code and
  committed files at all times.

- **Connector config (non-secret)** — Each source row in the `sources` table has a
  `config` JSONB column for non-sensitive connector settings (base URL, category
  filters, pagination limits). Secrets are never stored there; only the secret name
  or a Vault key reference belongs in `config`.

Rule: if a value gives access to data or costs money to use, it lives in env or
Vault — never in `config` JSON, never committed.

---

## Scheduled Ingestion

Ingestion needs to run on a daily schedule. Three options exist, each with different
trade-offs:

**Option A — Supabase Scheduled Edge Functions (recommended for Phase 1).** Supabase
supports `pg_cron`-triggered HTTP calls to Edge Functions. A cron entry in
`supabase/migrations/` fires a function once per day; the function iterates over
enabled sources and runs each connector in sequence. This keeps everything inside
the Supabase project with no external dependencies. The downside is that Edge
Functions have a 150-second wall-clock limit per invocation; connectors must be fast
or the orchestrator must fan out across multiple function invocations. This is
workable for Phase 1 because connectors run sequentially and most API connectors
finish in seconds.

**Option B — External cron + Node worker.** A scheduled GitHub Actions workflow,
Render cron job, or similar fires a Node process daily. The worker imports
`packages/ingestion` and runs the full connector sweep. This lifts the 150-second
constraint and makes local debugging easier (`node run-ingestion.ts`). The cost is
one more moving part outside Supabase. Suitable if connector sweep time grows beyond
what Edge Functions can handle.

**Option C — Supabase pg_cron directly.** A `pg_cron` job calls a Postgres function
that triggers connectors via `pg_net` HTTP calls. Lowest infrastructure overhead but
the hardest to test locally and the least visible. Not recommended as the primary
mechanism.

For Phase 1, Option A is the right starting point. The connector isolation guarantee
(a broken connector never affects others) applies equally to all three options, as
long as each connector run is wrapped in its own try/catch and logs to `ingest_runs`
regardless of outcome.

---

## Monitoring

The primary monitoring surface is the `ingest_runs` table. Every connector run —
successful or not — writes one row with `source_id`, timing, counts
(`fetched_count`, `parsed_count`, `upserted_external_count`, `created_events_count`,
`updated_events_count`, `errors_count`), and an `error_message` if applicable.
Status is one of `running`, `success`, `partial`, or `failed`.

To check system health at a glance:

```sql
-- Last run per source, ordered by recency
select s.name, r.status, r.started_at, r.parsed_count, r.errors_count, r.error_message
from ingest_runs r
join sources s on s.id = r.source_id
where r.id in (
  select distinct on (source_id) id
  from ingest_runs
  order by source_id, started_at desc
)
order by r.started_at desc;
```

Open (unresolved) alerts are visible in `ingest_alerts` filtered by
`resolved = false`. The Supabase dashboard Table Editor works fine for this; no
additional observability tooling is needed at Phase 1 scale.

---

## Break Detection and Alert Flow

After each ingestion run, the orchestrator compares `parsed_count` to the 14-day
median for that source. If the count has dropped by more than 70%, the connector is
automatically flagged:

1. The `sources` row is updated: `status = 'degraded'` (or `'broken'` if
   `parsed_count` is zero).
2. An `ingest_alerts` row is inserted with `alert_type = 'count_drop'`, the
   `run_id` of the failing run, and a human-readable `message`.
3. An email notification is sent to the operator address (configured via an
   environment variable — `ALERT_EMAIL`). In the Edge Function path this is sent
   via Supabase's built-in SMTP integration or a transactional email service
   (Resend, Postmark). In the Node worker path, any Node mailer works.

The email contains: the source name, the current `parsed_count`, the 14-day median,
the percentage drop, and a link to the Supabase dashboard filtered to that source's
recent runs. The operator then checks whether the upstream site has changed its HTML
structure, whether the API has changed, or whether it is a transient failure. If the
connector needs a fix, set `enabled = false` via a direct update to the `sources` table
while a fix is being deployed. Once the fix is deployed and a healthy run confirms
recovery, set `enabled = true`, update `sources.status` to `'ok'`, and mark the alert
`resolved = true` with a `resolved_at` timestamp.

At the target maintenance pace (1–3 hours/month), a single HTML scraper breaking
once or twice a year is the expected failure mode. Because connectors are isolated,
the fix is contained to one file in `packages/connectors/src/html/`.

---

## Moderation Queue

**Event submissions.** The public submission form writes to `event_submissions` with
`status = 'pending'`. To review the queue:

```sql
select id, title, start_at, venue_name, submitter_email, created_at
from event_submissions
where status = 'pending'
order by created_at;
```

For each submission, the operator either approves it (normalise into a canonical
`events` row via the ingestion pipeline or a manual insert, then set
`status = 'approved'` and `event_id` to the created event's UUID) or rejects it
(`status = 'rejected'`). Every decision is written to `moderation_log` for
auditability. At Phase 1 volume, this takes minutes. In Phase 2, a minimal admin UI
can surface the queue without requiring direct SQL access.

**Venue claims.** `venue_claims` follows the same pattern. A claimant submits proof
(a confirmation email from the venue domain, a role title, or similar). The operator
reviews the `proof` field, approves or rejects, and writes to `moderation_log`. On
approval, the claimant is granted write access to that venue's profile row (access
control mechanism to be defined when the admin UI is built).

**Merge candidates.** The deduplication process writes candidate pairs to
`event_merge_candidates` with `status = 'pending'`. The operator reviews these
occasionally (not a daily task), confirms true duplicates (`status = 'merged'`), or
marks false positives (`status = 'rejected'`). The preferred canonical record is
the API-sourced one; the scraped record's `event_id` is updated to point to the
canonical row.

---

## Backup and Restore

Supabase Pro projects include daily automated backups with a 7-day retention window,
accessible from the project dashboard under Database → Backups. For the free tier,
take manual backups before any significant migration using `supabase db dump` (which
wraps `pg_dump`) and store the output in a private location outside the repository.

The `supabase/migrations/` directory is the authoritative schema history. Restoring
to a blank Postgres instance is a matter of running `supabase db push` against the
target project, then restoring data from the most recent dump. The frontend is
disposable — if it is lost, re-running the publish sync job from the Supabase source
of truth rebuilds it.
