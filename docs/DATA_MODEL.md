# Data Model

Schema v5. 20 tables, 7 helper functions, 2 Postgres extensions (`pgcrypto`, `pg_trgm`). The SQL source of truth is `supabase/migrations/20260531000000_schema_v5_initial.sql`; this document explains the design.

---

## Table Map

```
Reference          event_types, tags
Connector registry sources, source_type_category_map
Venues             venues, venue_aliases
Events             festivals, event_series, events, event_tags,
                   external_events
Ingestion          ingest_runs, ingest_alerts
Deduplication      event_merge_candidates
Publishing         publish_mappings, publish_jobs, publish_job_items  ← RETIRED (ADR 0001, CC-NEW-1)
Community (Ph.2)   event_submissions, venue_claims, moderation_log
```

---

## Reference Tables

### event_types

A static lookup of 13 event categories seeded at migration time. Rows are effectively immutable in production.

| Column | Type | Notes |
|---|---|---|
| id | smallint identity PK | Referenced by events, tags, source_type_category_map |
| slug | text unique | Machine key used in connector logic and URL paths |
| label | text | Display string pushed to the frontend |
| sort_order | smallint | Controls display sequence |

### tags

Descriptive labels applied to events. Tags describe what an event *is* — "techno", "sculpture", "family-friendly" — not what state it is in. Transactional states (sold-out, cancelled) live in `events.availability`.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| slug | text unique | |
| parent_event_type_id | smallint → event_types | Null for cross-category tags; set for category-specific tags |

`parent_event_type_id` creates a shallow hierarchy. "sculpture" → arts_exhibition, "techno" → club_night, "improv" → comedy. Tags without a parent ("late-night", "outdoor") can appear on any event type.

The parent serves two purposes: normalisation uses it to classify an event whose source category is ambiguous (a tag of "techno" resolves the event to club_night); and the frontend can sub-filter a category page by child tags (the Arts / Exhibition page can filter by "sculpture", "painting", etc.).

The junction table `event_tags` (composite PK `event_id, tag_id`) links events to tags.

---

## Connector Registry

### sources

The authoritative registry of every connector and its current health. Every row here corresponds to one running connector; ingest_runs and external_events both reference it.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | Machine name; used to look up the connector at runtime |
| source_type | text | `api`, `rss`, `ical`, `html`, `manual` |
| tier | smallint 1–4 | Data quality / confidence tier. Tier 1 = structured API (Ticketmaster). Tier 4 = LLM-extracted RSS. Feeds the confidence score during normalisation. |
| config | jsonb | Connector-specific settings (endpoint, query params, pagination). Credentials are in Vault/env — never here. |
| status | text | `ok`, `degraded`, `broken`, `disabled` — the connector's aggregated health state |
| enabled | boolean | Soft switch; disabled connectors are skipped by the scheduler |
| last_run_at | timestamptz | Set on every run start |
| last_success_at | timestamptz | Set when a run finishes `success` or `partial` |
| last_error_at | timestamptz | Set on failure |
| last_error | text | Last error message, for diagnostics |

`status` is coarser than individual run outcomes. A single failed run does not flip the connector to `degraded`. Break detection flips it when `parsed_count` drops more than 70% below the 14-day median.

### source_type_category_map

Maps source-specific category strings to canonical event_type_ids. A Ticketmaster classification ID or an Apify actor output category resolves here rather than being hard-coded in connector code.

Unique constraint: `(source_id, source_category)`.

---

## Venues

### venues

One row per physical location. The public RLS policy exposes only `status IN ('active', 'temporary')` rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | |
| status | text | `active`, `temporary`, `closed`, `pending` |
| auto_created | boolean | True when created by auto_create_venue() from an unknown venue name |
| needs_review | boolean | True when the record is bare (auto-created) and awaits manual enrichment |
| lat / lng | numeric(9,6) | Nullable; set during manual enrichment |
| accessibility_info | text | Free text in Phase 1. Intended to become structured JSONB in Phase 2 if accessibility filtering is needed. |
| capacity | integer | Approximate max capacity; set by manual enrichment. Null = unknown. |
| claimable | boolean | Whether venue operators can claim the record (Phase 2 feature) |

The `needs_review` partial index (only where `needs_review = true`) keeps the moderation queue query cheap.

### venue_aliases

Cross-source name matching. A venue listed as "Barrowlands", "The Barrowland Ballroom", and "Barrowland Ballroom" across three sources gets one canonical venues row and one venue_aliases row per name variant.

`resolve_venue(name)` checks `venues.name` first, then this table. The unique constraint on `normalised_alias` prevents duplicate alias rows.

---

## Festivals

### festivals

Festival entities that events are attributed to. Enables festival-page views and the `is_festival_event` derived boolean on events.

`start_date` and `end_date` are nullable: a festival can be created for title-matching purposes before dates are confirmed. The date-window matching logic only applies when both are set.

`match_domains`, `match_title_terms`, and `match_url_slugs` are text arrays used by normalisation to detect festival membership from incoming event data.

---

## Event Series

### event_series

Groups recurring events (e.g. "Sub Club Thursdays") under a common entity. Used for series-page views and to assist deduplication of recurring events across sources.

`normalised_title` carries a GIN trigram index for fuzzy series matching. `recurrence_hint` is an informal label ("weekly", "monthly") rather than a machine-parseable pattern.

---

## Events

### external_events

The landing zone for all ingested data. Every connector writes here, keyed by `(source_id, external_id)`. The unique constraint on this pair makes every connector run an upsert: new data overwrites the extracted fields; `last_seen_at` is refreshed on every run.

If a record stops appearing in API responses, `last_seen_at` stops updating. Break detection marks it `is_deleted = true` after N missed runs, which propagates to the canonical event.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| source_id | uuid → sources | |
| external_id | text | Source's own identifier |
| raw | jsonb | The full payload from the source, unmodified |
| title, start_at, end_at, doors_at | extracted | Pre-normalisation field extraction |
| venue_name | text | Raw venue string from source, before resolution |
| event_type_guess | text | Source category, before mapping |
| price_min_guess, price_max_guess, is_free_guess | extracted pricing | |
| availability_guess | text | Source-reported availability; mapped to canonical availability values during normalisation |
| venue_id_guess, series_id_guess | uuid | Resolution results, written back by normalisation |
| event_id | uuid → events | Null until normalised; set when the canonical record is created or matched |
| first_seen_at | timestamptz | When this external record first appeared |
| last_seen_at | timestamptz | Refreshed on every run; used for removal detection |
| is_deleted | boolean | Set when the record is no longer appearing in source responses |

The partial index on `last_seen_at WHERE is_deleted = false` supports efficient removal-detection queries without scanning deleted rows.

### events

The canonical event table. Every event on the frontend has exactly one row here. It is never written directly by connectors; all writes are mediated by the normalisation pipeline.

**Identity and content**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text | Normalised display title |
| normalised_title | text | Output of normalise_title(); used in deduplication and trigram search |
| slug | text unique | Convention: `normalised-title-YYYY-MM-DD`. Collisions get `-2`, `-3` suffix. |
| summary | text | Short description for cards; link-first sources get minimal text |
| description | text | Longer description; stored only for sources that permit it |

**Links and ticketing**

| Column | Type | Notes |
|---|---|---|
| source_url | text | Link back to the original source |
| ticket_url | text | Direct booking link |
| ticket_url_label | text | "Book from Ticketmaster", "Book from Venue Website", etc. |

**Temporal**

| Column | Type | Notes |
|---|---|---|
| start_at | timestamptz | Not null |
| end_at | timestamptz | Nullable |
| doors_at | timestamptz | Nullable; "Doors 7pm, Show 8pm" |
| timezone | text | Defaults to Europe/London |
| time_tba | boolean | When set, frontend shows "Time TBA" rather than 00:00 |

**Classification**

| Column | Type | Notes |
|---|---|---|
| event_type_id | smallint → event_types | Normalised FK; not null |
| venue_id | uuid → venues | Nullable (online events have no venue) |
| festival_id | uuid → festivals | Nullable |
| is_festival_event | boolean generated | `festival_id IS NOT NULL` |
| series_id | uuid → event_series | Nullable |

**Pricing**

| Column | Type | Notes |
|---|---|---|
| price_min, price_max | numeric(8,2) | Nullable |
| is_free | boolean | |
| price_display | text | "£15", "£10–£25", "Free", "PWYC" |

**Availability**

| Column | Type | Notes |
|---|---|---|
| availability | text | `on_sale`, `sold_out`, `low_stock`, `postponed`, `rescheduled`, `cancelled`, `not_on_sale`; null = unknown |
| availability_note | text | Custom badge text when standard text is insufficient: "Rescheduled to March 20" |
| is_sold_out | boolean generated | `COALESCE(availability = 'sold_out', false)` |

**Moderation and quality**

| Column | Type | Notes |
|---|---|---|
| visibility | text | `draft`, `published`, `hidden`, `archived` |
| confidence | smallint 0–100 | Quality score; see below |
| confidence_inputs | jsonb | Structured breakdown of score components |
| needs_review | boolean | Puts the event in the human review queue regardless of confidence |

**Deduplication**

| Column | Type | Notes |
|---|---|---|
| dedupe_key | text unique | SHA-256 hash; see below |

### event_tags

Junction table. Composite PK `(event_id, tag_id)` enforces uniqueness. Index on `tag_id` supports reverse lookups (all events for a tag). Rows cascade-delete when the event is deleted.

---

## The events / external_events Relationship

`external_events` is the staging area; `events` is the settled canonical store.

1. A connector fetches a page of events from a source and writes one row per record to `external_events`, upserting on `(source_id, external_id)`.
2. The normalisation pipeline reads the `_guess` fields from the new/updated external_events rows, resolves the venue, maps the category, computes the dedupe_key, and upserts into `events`.
3. It then writes `external_events.event_id = <canonical id>` to link the two rows.

Multiple external_events rows can point to the same events row. If Ticketmaster and Skiddle both carry the same gig, two external_events rows share one events row. The API-sourced record is preferred as canonical when a merge is resolved.

When an external record disappears from the source, `is_deleted = true` propagates to the canonical event. Expiry is handled by the visibility transition to `archived` — the `archive_past_events()` function sets `visibility = 'archived'` on published events more than 7 days past their end/start time, after which they are excluded by RLS.

---

## dedupe_key Derivation

```sql
compute_dedupe_key(venue_id uuid, start_at timestamptz, title text)
  → SHA-256(
      COALESCE(venue_id::text, 'no-venue')
      || '|'
      || TO_CHAR(DATE_TRUNC('hour', start_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD-HH24')
      || '|'
      || normalise_title(title)
    )
```

`normalise_title` strips all non-alphanumeric characters and collapses whitespace to a single lowercase space. `start_at` is bucketed to the hour in UTC (BE-09 — avoids session-timezone dependency), so a Ticketmaster event listed at 20:00 and a Skiddle event listed at 20:30 produce the same bucket and, if the titles match, the same key — one canonical record.

The `UNIQUE` index on `events.dedupe_key` enforces this at the database level. A second normalised event with the same key causes a constraint violation, which the pipeline catches and converts to an update of the existing record.

The key uses `venue_id` (not venue name), so venue resolution must happen first. If resolve_venue() returns null and auto_create_venue() is called, a new uuid is generated, producing a different key than another source's record for the same venue under a different name. This means unresolved venues create separate canonical events that become merge candidates rather than false deduplications.

---

## visibility vs. confidence / needs_review

These three fields are independent and serve different purposes.

**visibility** is the publication lifecycle state:

- `draft` — not yet reviewed; the default for new events
- `published` — approved for the frontend; the RLS policy exposes only this value to public queries
- `hidden` — manually suppressed (duplicates, spam, scope mismatch)
- `archived` — past events; archive_past_events() moves `published` events here 7 days after `COALESCE(end_at, start_at)`

**confidence** (0–100) is a quality score assembled from multiple inputs logged in `confidence_inputs` (jsonb): source tier, field completeness, venue resolution success, cross-source corroboration, category confidence. An event with confidence below the threshold (currently 60) stays at `draft`.

**needs_review** is a boolean override. It is set when the pipeline encounters something uncertain — an auto-created venue, a low-confidence category assignment, an LLM-extracted event. It sends the event to the human review queue regardless of the confidence score.

An event reaches `published` only when `confidence >= threshold` AND `needs_review = false`. An operator can manually override to `published` for edge cases.

**availability** is entirely separate. It tracks the ticket/event state and is refreshed on every ingestion run:

| availability | User-facing badge | CTA |
|---|---|---|
| `on_sale` | (none) | "Book from [source]" |
| `sold_out` | "Sold Out" | Hidden or disabled |
| `low_stock` | "Last Few Tickets" | "Book from [source]" |
| `postponed` | "Postponed" | Hidden |
| `rescheduled` | "Rescheduled" + note | "Book from [source]" |
| `cancelled` | "Cancelled" | Hidden |
| `not_on_sale` | (none) | "More Info" |
| null | (none) | "Book from [source]" |

A cancelled event keeps `visibility = 'published'` — users who booked need to see the badge. A hidden duplicate has `visibility = 'hidden'` and is never shown. These are different problems that require different fields.

---

## Denormalised Fields on events (v5 schema — pending migration)

The v5 schema carries 13 fields that are derivable from foreign-key relationships:
`event_type_label`, `venue_name_display`, `venue_slug_display`, `festival_name_display`,
`festival_slug_display`, `tags_display`, `location_display`, `has_image`, `is_festival_event`,
`is_sold_out`, `availability_note`, `ticket_url_label`, `age_restriction`.

The first 7 of these (`event_type_label`, `venue_name_display`, `venue_slug_display`,
`festival_name_display`, `festival_slug_display`, `tags_display`, `location_display`)
existed solely to give the Webflow sync job a flat document to push. **ADR 0001
(accepted 2026-06-02) selected Astro + Supabase direct read and rejected Webflow.**
These 7 fields were therefore redundant and were dropped in the CC-NEW-1 migration. The Astro frontend derives these values via joins at query time.

The remaining generated booleans (`has_image`, `is_festival_event`, `is_sold_out`) remain
useful regardless of frontend choice — they enable partial indexes and clean WHERE clauses
without repeating the expression in every query.

`validate_event_consistency()` was updated in the CC-NEW-1 migration to remove the Webflow-era checks. It now checks only two invariants: `is_free = true` requires a non-empty `price_display`, and `image_url` must not be an empty string.

---

## Ingestion Monitoring

### ingest_runs

One row per connector execution, updated as the run progresses.

| Column | Notes |
|---|---|
| fetched_count | Raw records retrieved from the source |
| parsed_count | Records successfully parsed (used by break detection) |
| upserted_external_count | Rows written to external_events |
| created_events_count / updated_events_count | Canonical event changes |
| status | `running`, `success`, `partial`, `failed` |

Break detection compares `parsed_count` against the 14-day median for the source. A drop of >70% triggers a `count_drop` alert and may flip `sources.status` to `degraded`.

### ingest_alerts

One row per open incident. Partial index on `resolved = false` keeps the active-alert query fast.

---

## Deduplication

### event_merge_candidates

When two canonical events share a venue and a time bucket but have different titles (fuzzy match), the deduplication pipeline writes a row here for human review.

| Column | Notes |
|---|---|
| event_a_id, event_b_id | Stored in canonical order via `LEAST/GREATEST` unique constraint — prevents the same pair appearing twice |
| similarity | 0–1 score |
| match_reasons | jsonb breakdown of why the pair was flagged |
| status | `pending`, `merged`, `rejected` |
| merge_group_id | Groups three or more candidates relating to the same underlying event |

---

## Publishing (tables retired — pending schema migration)

The following three tables exist in the v5 schema but are retired under ADR 0001
(Astro + Supabase direct read). They were dropped in the CC-NEW-1 migration.
Do not write new code that depends on these tables.

### publish_mappings

Previously tracked which Postgres entity mapped to which Webflow CMS item. The `content_hash`
let the sync job skip unchanged records. **Retired — no sync job exists on the Astro path.**

### publish_jobs / publish_job_items

Previously an audit log of sync runs. **Retired — no sync job, no sync audit trail.**

The `packages/publishing` package is also removed. Shared Supabase query helpers
(typed wrappers for `getPublishedEvents`, `getVenue`, `getFestival`) live in `packages/shared`.

---

## Community (Phase 2)

### event_submissions

Public event submissions from the community form. Status: `pending` → `approved` or `rejected`. On approval, `event_id` is set to the canonical event created from the submission.

### venue_claims

Venue operators claiming their listing. Manually reviewed; approved claims grant edit access.

### moderation_log

Append-only audit trail across all entity types. No updates or deletes.

---

## Helper Functions

| Function | Purpose |
|---|---|
| `trigger_set_updated_at()` | Trigger on mutable tables; sets `updated_at = NOW()` on every update |
| `normalise_title(text)` | Strips non-alphanumeric characters, collapses whitespace, lowercases. Immutable — safe for index expressions. |
| `compute_dedupe_key(uuid, timestamptz, text)` | Computes the SHA-256 cross-source dedupe hash. Immutable. |
| `resolve_venue(text)` | Looks up a venue by name then alias; returns uuid or null |
| `auto_create_venue(text, text)` | Creates a bare venue record with `auto_created=true`, `needs_review=true`, `status='pending'` when resolve_venue returns null. Race condition documented in the schema; safe with sequential Edge Functions. |
| `validate_event_consistency(uuid)` | Checks two post-CC-NEW-1 invariants: `is_free = true` requires a non-empty `price_display`; `image_url` must not be an empty string. Updated in the CC-NEW-1 migration; the Webflow-era checks (venue/festival display fields) were removed when those columns were dropped. |
| `archive_past_events()` | Sets `visibility = 'archived'` on published events more than 7 days past `COALESCE(end_at, start_at)` |

---

## Row-Level Security

RLS is enabled on all 20 tables. Public policies:

- `event_types`, `tags`, `venue_aliases`, `festivals`, `event_series` — public read
- `venues` — public read where `status IN ('active', 'temporary')`
- `events` — public read where `visibility = 'published' AND confidence >= 60` (the CC-NEW-1 migration tightens the v5 policy to add the confidence check)
- `event_tags` — public read where the parent event is published
- `event_submissions` — public insert (no read)

All other tables (sources, external_events, ingestion, publishing, community moderation) have no public policies; access is via the service role key in Trigger.dev tasks only.
