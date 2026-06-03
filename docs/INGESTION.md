# Ingestion

This document describes how Clyde Culture pulls data from upstream sources, stages it in the database, normalises it into canonical events, monitors run health, and handles connector failures. The full schema is in [docs/DATA_MODEL.md](DATA_MODEL.md). The normalisation stages that follow ingestion are described in [docs/ARCHITECTURE.md](ARCHITECTURE.md).

---

## Source types and stability tiers

Every upstream source is assigned a `source_type` and a `tier` (1–4). Both are stored on the `sources` row and feed the `confidence` score that the normalisation pipeline computes for each canonical event.

**Tier 1 — APIs.** Structured JSON responses with stable identifiers, versioned endpoints, and documented field semantics. Examples: Ticketmaster, Skiddle (gated on commercial approval), Meetup. These connectors run on incremental sync using stable external IDs and require near-zero maintenance once built. They form the coverage backbone — roughly 45% of events — and their records are preferred as canonical when cross-source duplicates are merged.

**Tier 2 — Apify actors and RSS/iCal feeds.** Managed scraping actors (DICE.fm, Eventbrite via Apify — the Eventbrite direct API was deprecated in 2019; see ADR 0003) and semi-structured feeds (venue iCal feeds, Substack RSS). iCal feeds provide machine-readable datetimes and UIDs; RSS feeds vary in field completeness. Apify actor versions are pinned; the main maintenance trigger is an actor output schema change. Feed formats are extremely stable. Tier 2 covers roughly 30% of events.

**Tier 3 — Structured HTML.** Connectors that parse HTML page structure using Crawlee (`CheerioCrawler` for static pages, `PlaywrightCrawler` for JS-rendered pages). These are the most fragile: a layout change on the source site breaks the scraper immediately, with no upstream error signal. Where a venue page embeds `schema.org/Event` JSON-LD, that is extracted first before falling back to CSS selectors. Examples: SWG3, St Luke's, Mono, The Flying Duck, The Old Hairdressers, Gigs in Scotland. (Mono and The Flying Duck additionally use iCal links for `start_at` validation.) Break detection (described below) is particularly important for Tier 3 sources because their failure mode is a silent drop in parsed records rather than an HTTP error. Tier 3 covers roughly 15% of events and requires occasional manual fixes — a few times per year, each isolated to one connector.

**Tier 4 — Cultural directories and enrichment.** Festival microsites, cultural directories, and other sources where structured data is not available and extraction may require inference. Examples: Glasgow Comedy Festival, Celtic Connections, Glasgow International, The Skinny. These are used for festival detection, event tagging, and editorial enrichment rather than as primary coverage sources, and carry the lowest confidence weight in normalisation.

The expected maintenance load across tiers, from the platform specification:

| Tier | Coverage share | Maintenance |
|---|---|---|
| Tier 1 (APIs) | ~45% | Near zero — incremental sync, stable IDs |
| Tier 2 (Apify / RSS / iCal) | ~30% | Low — actor version pinning; very stable feed formats |
| Tier 3 (HTML scrapers — Crawlee) | ~15% | Occasional — a few fixes per year, isolated to one connector |
| Community submissions | ~5% | Moderation only |

---

## Connector interface

Every connector is a TypeScript module that implements the `Connector` interface defined in `packages/connectors/src/connector.ts`:

```ts
export interface Connector {
  readonly slug: string;     // stable machine name, e.g. "ticketmaster" or "swg3"
  readonly type: SourceType; // "api" | "rss" | "ical" | "html" | "apify" | "manual"
  run(): Promise<IngestResult>;
}
```

`run()` must not throw. All errors — network failures, parse errors, unexpected payloads — are returned inside `IngestResult.errors` as strings. This is the isolation contract: a failing connector cannot propagate an unhandled exception to the orchestrator and cannot disrupt other connectors running in the same job.

`IngestResult` carries four fields: `fetchedCount` (raw records retrieved from upstream), `parsedCount` (records successfully extracted into `RawEvent` form), `items` (the parsed array), and `errors` (diagnostic strings for any failures). The gap between `fetchedCount` and `parsedCount` is the first signal that a source is changing shape.

Each `RawEvent` must include an `externalId` — a stable upstream identifier (API ID, RSS GUID, iCal UID, or a content hash for sources with no native identifier) — and an `externalUrl`. The URL is required because Clyde Culture is link-first: every event on the platform must route back to its origin. Connectors are organised under `packages/connectors/src/` by type: `api/`, `rss/`, `ical/`, `html/`, `apify/`. See `docs/CONNECTOR_GUIDE.md` before adding a new one.

---

## Scheduled-job model

Ingestion jobs are Trigger.dev tasks defined in the `trigger/` directory and run on the Trigger.dev cloud worker. Each connector maps to one Trigger.dev task; a parent sweep task fans out to per-connector tasks in parallel. Scheduling is configured via Trigger.dev's built-in cron triggers — no separate cron infrastructure is needed. Jobs can also be triggered manually via the Trigger.dev dashboard or CLI. See [ADR 0002](decisions/0002-ingestion-runtime.md) for the full rationale.

For each connector, the orchestrator:

1. Checks `sources.enabled`. Disabled connectors are skipped entirely; no run row is written for them.
2. Opens an `ingest_runs` row with `status = 'running'` and stamps `sources.last_run_at`.
3. Calls the connector's `run()` method and collects the `IngestResult`.
4. Upserts each item in `IngestResult.items` into `external_events` by `(source_id, external_id)`.
5. Updates the `ingest_runs` row with final counts and status, and stamps `sources.last_success_at` or `sources.last_error_at` accordingly.
6. Runs break detection against the completed run.

The Trigger.dev task wrapper catches any thrown exception — a violation of the contract — and logs it as a failed run without halting the remaining connector tasks.

---

## Raw to normalised: external_events → events

`external_events` is the landing zone. Every connector run upserts into this table, keyed by `(source_id, external_id)`. On a repeat run for the same upstream record, `last_seen_at` is refreshed and changed fields are overwritten; `first_seen_at` and the full `raw` jsonb payload are preserved. Storing the complete upstream payload allows the ingestion record to be re-parsed if the normalisation logic changes, without re-fetching from the source.

The extracted fields on `external_events` — `title`, `start_at`, `end_at`, `venue_name`, `event_type_guess`, price and availability guesses — are pre-normalisation. They reflect what the source said, not what the canonical schema requires.

Once an `external_events` row exists, `packages/core` takes over in three stages:

**Normalisation.** The normaliser reads the `_guess` fields and resolves them into canonical values. `venue_name` is matched against `venues` (then `venue_aliases`) via `resolve_venue()`; if no match is found, `auto_create_venue()` creates a bare stub with `auto_created = true` and `needs_review = true`. `event_type_guess` is mapped to the taxonomy enum via `source_type_category_map`. A `confidence` score (0–100) is assembled from source tier, field completeness, venue resolution success, and cross-source corroboration. Events below the confidence threshold, or with `needs_review = true`, stay at `visibility = 'draft'` and enter the moderation queue.

**Deduplication.** Within a single source, upsert by `(source_id, external_id)` handles everything cleanly. Across sources, `compute_dedupe_key(venue_id, start_at, title)` produces a SHA-256 hash. If an `events` row with that key already exists, the normaliser updates it; if not, a new `events` row is created at `visibility = 'draft'`. Fuzzy near-matches — same venue and time bucket, similar but not identical title — are written to `event_merge_candidates` for human review. When duplicates are confirmed, the API-sourced record is preferred as canonical over scraped records.

**Festival detection.** The event's source domain, normalised title, and URL are checked against festival match rules. A match that also falls within the festival's date window sets `festival_id` and marks `is_festival_event = true`.

After normalisation, `external_events.event_id` is written back to link the staged row to its canonical record. Multiple `external_events` rows from different sources can point to the same `events` row — if Ticketmaster and Skiddle both carry the same gig, two external records share one canonical event.

---

## Per-run logging

Every connector execution writes one row to `ingest_runs`. The key columns:

| Column | Meaning |
|---|---|
| `fetched_count` | Raw records retrieved from the source before parsing |
| `parsed_count` | Records that produced a valid `RawEvent`; the input to break detection |
| `upserted_external_count` | Rows written or updated in `external_events` |
| `created_events_count` | New canonical `events` rows created in this run |
| `updated_events_count` | Existing `events` rows updated in this run |
| `errors_count` | Number of entries in `IngestResult.errors` |
| `status` | `running` → `success` \| `partial` \| `failed` |

A run is `success` when there are no errors and `parsed_count > 0`. It is `partial` when some records were processed but errors also occurred. It is `failed` when no records were produced or the connector threw despite the contract. Historical `ingest_runs` rows are the primary audit trail for connector reliability and are the direct input to break detection.

---

## Break detection

After each run, the Trigger.dev sweep task computes a 14-day rolling median of `parsed_count` across all non-failed runs for that connector. If the current run's `parsed_count` drops more than 70% below that median, the connector is considered broken.

On a break event:

1. `sources.status` is set to `degraded`.
2. A row is inserted into `ingest_alerts` with `alert_type = 'count_drop'`, referencing the `ingest_runs` row and recording the observed count, the median, and the percentage drop.
3. An email notification is sent to the platform maintainers.

`ingest_alerts` carries a partial index on `resolved = false`, so the active-alert query stays fast regardless of historical volume. Alerts are resolved manually once the underlying issue is fixed and a healthy run confirms recovery.

**Cold-start exception.** New connectors have no 14-day baseline. During the cold-start period (fewer than 14 days of completed runs in `ingest_runs`), the percentage-drop rule cannot apply. Instead, a simpler rule governs: if `parsed_count = 0` on any run during the cold-start period, the connector is flagged immediately — `sources.status` is set to `degraded`, an `ingest_alerts` row is created with `alert_type = 'count_drop'` (the CC-NEW-1 migration will add a dedicated `'cold_start_zero'` value to the `alert_type` CHECK constraint), and a notification is sent. This catches a connector that was broken from day one before a baseline has accumulated.

`sources.status` (`ok`, `degraded`, `broken`, `disabled`) is a separate field from `sources.enabled`. Status reflects observed health; `enabled` is the operational on/off switch. A connector can be `status = 'broken'` and `enabled = true` while a fix is being deployed, or `status = 'ok'` and `enabled = false` while temporarily paused. Disabling a connector stops all future scheduler runs for it without deleting the connector module, its `ingest_runs` history, or any `external_events` rows. Re-enabling resumes normal scheduling immediately.
