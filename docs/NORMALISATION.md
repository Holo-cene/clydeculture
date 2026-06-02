# Normalisation

Normalisation is the pipeline stage that turns staged `external_events` rows into
canonical `events` records. It runs as a Trigger.dev task after each connector
ingestion completes, or as a scheduled sweep that processes any `external_events`
rows where `event_id IS NULL`.

This document is the authoritative contract for `packages/core`. Nothing in
`packages/core` should be implemented or changed without updating this document
first.

---

## Overview

```
external_events (staged, raw)
        │
        ▼
  Step 1: Field extraction mapping
  Step 2: Venue resolution
  Step 3: Event type classification
  Step 4: Confidence scoring
  Step 5: Deduplication
  Step 6: Festival detection
  Step 7: Moderation flag assignment
  Step 8: Canonical record upsert
        │
        ▼
events (canonical, published)
```

The normaliser never modifies the source `external_events` row, except to write
back the resolved `event_id`, `venue_id_guess`, and `series_id_guess` at the end
of Step 8.

---

## Step 1 — Field extraction mapping

Map `external_events` extracted fields to the canonical `events` schema. These are
direct assignments before any resolution logic runs.

| events field | Source | Notes |
|---|---|---|
| `title` | `external_events.title` | Strip leading/trailing whitespace; truncate at 500 chars |
| `normalised_title` | `normalise_title(title)` | SQL function: lowercase, strip non-alphanumeric, collapse whitespace |
| `summary` | source-dependent | Short extract only; omit for link-first sources (RA, Instagram) |
| `source_url` | `external_events.external_url` | Required — the link-first contract |
| `ticket_url` | `external_events.ticket_url_guess` | Null if not provided by source |
| `ticket_url_label` | `external_events.ticket_url_label_guess` | e.g. "Book from Ticketmaster" |
| `image_url` | `external_events.image_url_guess` | Null for link-first sources |
| `price_min` | `external_events.price_min_guess` | |
| `price_max` | `external_events.price_max_guess` | |
| `is_free` | `external_events.is_free_guess` | Defaults to false if null |
| `price_display` | derived | "Free", "£10", "£10–£25", "PWYC" — compose from price fields |
| `start_at` | `external_events.start_at` | Required; if null, `time_tba = true` |
| `end_at` | `external_events.end_at` | Nullable |
| `doors_at` | `external_events.doors_at` | Nullable |
| `timezone` | `'Europe/London'` | Default; override if source provides IANA timezone |
| `time_tba` | `start_at IS NULL` | True when `start_at` cannot be extracted |
| `availability` | mapped from `availability_guess` | See availability mapping table below |
| `availability_note` | source-dependent | Custom badge text; null for standard states |
| `is_online` | `false` | Default; set `true` if source explicitly marks online |
| `age_restriction` | source-dependent | "18+", "All Ages" — null if not provided |
| `primary_source_id` | `external_events.source_id` | |

### Availability mapping

Source-specific availability strings map to the canonical `availability` enum:

| Source | Source value | Canonical |
|---|---|---|
| Ticketmaster | `onsale` | `on_sale` |
| Ticketmaster | `offsale` | `not_on_sale` |
| Ticketmaster | `cancelled` | `cancelled` |
| Ticketmaster | `postponed` | `postponed` |
| Ticketmaster | `rescheduled` | `rescheduled` |
| Skiddle | `sold_out = true` | `sold_out` |
| Skiddle | `cancelled = true` | `cancelled` |
| Apify / Eventbrite | `live` | `on_sale` |
| Apify / Eventbrite | `canceled` | `cancelled` |
| Apify / Eventbrite | `sold_out` | `sold_out` |
| Any | null / unknown | `null` |

Unknown strings are mapped to `null` (no badge). Do not guess — unknown
availability is safer than a wrong badge.

### Link-first enforcement

Some sources are designated link-only (Resident Advisor, and any source where the
connector sets `externalUrl` but explicitly omits summary and image). For these,
the normaliser must enforce `summary = null`, `image_url = null`, and
`description = null` regardless of what the connector extracted. The designation
is recorded in `sources.config` as `{ "link_only": true }`. This is a hard
constraint, not a soft default.

---

## Step 2 — Venue resolution

Venue resolution must run before deduplication because `dedupe_key` uses `venue_id`
(UUID), not the raw venue name string.

```
resolve_venue(external_events.venue_name)
  → check venues.name (case-insensitive, trimmed)
  → check venue_aliases.normalised_alias
  → if match: return venue_id
  → if no match: auto_create_venue(venue_name, source_slug)
                  → insert venues row (auto_created=true, needs_review=true, status='pending')
                  → insert venue_aliases row for this name variant
                  → return new venue_id
```

Write the resolved `venue_id` back to `external_events.venue_id_guess` for
diagnostic queries. Use this UUID as the `venue_id` on the canonical event.

**Auto-created venues** produce a bare stub: `name`, `slug`, `city = 'Glasgow'`,
`auto_created = true`, `needs_review = true`, `status = 'pending'`. No address,
lat/lng, or website. The venue appears in the moderation queue for manual enrichment.
A canonical event linked to an auto-created venue gets `needs_review = true` on the
event as well (see Step 7).

**Race condition note.** `auto_create_venue` is not atomic across concurrent
normalisation runs. If two connector runs produce the same previously-unknown venue
simultaneously, two venue stubs may be created. The deduplication merge candidate
process handles the downstream consequence (two canonical events for the same venue);
a subsequent manual alias addition collapses them on the next ingestion run. This is
acceptable for Phase 1 where normalisation runs sequentially inside a single
Trigger.dev task.

---

## Step 3 — Event type classification

Map `external_events.event_type_guess` (a raw source category string) to a canonical
`event_type_id` using the `source_type_category_map` table.

```
lookup: source_type_category_map
  WHERE source_id = external_events.source_id
    AND source_category = lower(trim(external_events.event_type_guess))
  → event_type_id

fallback (no mapping row exists): event_type_id = id of 'other'
```

If no mapping row exists, a secondary keyword check is attempted against the
`normalised_title` before falling back to `other`. Known keyword hints:

| Title contains | Inferred event_type slug |
|---|---|
| "comedy", "stand-up", "standup", "sketch" | `comedy` |
| "film", "cinema", "screening" | `film` |
| "workshop", "class", "course" | `workshop` |
| "exhibition", "gallery", "art" | `arts_exhibition` |
| "talk", "lecture", "panel" | `talk_lecture` |
| "club night", "dj set", "rave" | `club_night` |
| "family", "kids", "children" | `family` |

A classification resolved via keyword hint is flagged with `confidence_inputs.type_source = 'keyword'`.
A classification resolved via `source_type_category_map` is flagged with `confidence_inputs.type_source = 'map'`.
A classification defaulting to `other` is flagged with `confidence_inputs.type_source = 'fallback'`.

---

## Step 4 — Confidence scoring

Confidence is a 0–100 integer assembled from discrete weighted inputs. It is stored
in `events.confidence` and its breakdown stored in `events.confidence_inputs` (JSONB).

### Base score by source tier

| Tier | Description | Base score |
|---|---|---|
| 1 | Structured API (Ticketmaster) | 50 |
| 2 | Managed scrape / RSS / iCal (Apify, DICE, Eventbrite via Apify) | 40 |
| 3 | HTML scraper (Crawlee — SWG3, St Luke's, Mono, etc.) | 30 |
| 4 | Enrichment / manual | 20 |

### Additive inputs (max 50 additional points)

| Condition | Points | confidence_inputs key |
|---|---|---|
| `start_at` is not null and `time_tba = false` | +10 | `has_start_at` |
| `venue_id` resolved to an existing (non-auto-created) venue | +10 | `venue_resolved` |
| `event_type_id` is not `other` | +10 | `type_classified` |
| Title is at least 3 words | +5 | `title_quality` |
| `ticket_url` or `source_url` is present | +5 | `has_url` |
| Cross-source corroboration (another `external_events` row already resolved to the same `events.id`) | +10 | `corroborated` |

### Score to action mapping

| Score | Action |
|---|---|
| ≥ 60 | `visibility = 'draft'`; eligible for auto-publish if `needs_review = false` |
| < 60 | `visibility = 'draft'`; `needs_review = true` (stays in moderation queue) |

The publishing threshold (currently 60) is stored in `sources.config` at the
platform level and is applied by the publishing query, not hardcoded in
normalisation code. See BE-19.

### confidence_inputs JSON structure

```json
{
  "tier": 2,
  "base_score": 40,
  "has_start_at": true,
  "venue_resolved": true,
  "type_classified": true,
  "type_source": "map",
  "title_quality": true,
  "has_url": true,
  "corroborated": false,
  "total": 75
}
```

---

## Step 5 — Deduplication

Deduplication runs in two passes. Full detail in `docs/DEDUPLICATION.md`.

### Within-source (automatic)

Handled at the `external_events` layer by the `UNIQUE (source_id, external_id)`
constraint. The orchestrator upserts; no further action needed in normalisation.

### Cross-source (dedupe_key)

Compute the `dedupe_key` using the helper function:

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

Note: `start_at` is truncated in UTC to avoid session-timezone dependency (BE-09).

**Collision resolution (determines the write path in Step 8):**
- If an `events` row with the same `dedupe_key` already exists: Step 8 will
  UPDATE that row. Flag as update path. Note which source is higher-tier for
  field preference logic in Step 8.
- If no collision: Step 8 will INSERT a new `events` row.

The dedup step does not write to `events`. It computes the key, performs the
lookup, and passes a `{ mode: 'insert' | 'update', existingId?: uuid }` result
to Step 8.

**Fuzzy-match candidates** (see `docs/DEDUPLICATION.md` for threshold detail):
After the canonical record is written in Step 8, a secondary pass checks for
near-matching `events` rows (same venue, same time bucket, similar but not
identical `normalised_title`). Pairs above the similarity threshold are written
to `event_merge_candidates` for human review.

---

## Step 6 — Festival detection

Festival detection runs after venue resolution and before the canonical record is
written. Full detail in `docs/FESTIVALS.md`.

Rules evaluated in priority order:

1. **Source domain match** — connector's configured domain in `festivals.match_domains`
2. **Title match** — `normalised_title` contains a term from `festivals.match_title_terms`
3. **URL slug match** — `external_events.external_url` contains a slug from `festivals.match_url_slugs`
4. **Manual mapping** — entry in the festival manual-override table (BE-16, Phase 1.5)

When a rule fires, validate that `start_at` falls within `[festivals.start_date, festivals.end_date]`
(inclusive). Only then set `festival_id`. If the date is outside the window, log an
alert and leave `festival_id = null`.

---

## Step 7 — Moderation flag assignment

Set `needs_review = true` if any of the following is true:

| Condition | Reason |
|---|---|
| Venue was auto-created (`venues.auto_created = true`) | Venue data is a bare stub; event needs venue enrichment |
| `event_type_id` resolved to `'other'` | Classification uncertain |
| `start_at IS NULL` (`time_tba = true`) | Date not extractable |
| Source tier is 4 | Low-confidence enrichment source |
| Source is Apify-backed AND this is a new actor (< 14 days of run history) | Output quality unvalidated |
| `confidence < 50` | Below the minimum threshold for any trust |
| `title` is fewer than 3 characters | Extraction failure |

Events with `needs_review = true` stay at `visibility = 'draft'` regardless of their
confidence score. A human operator must clear the flag before the event can be
published.

`needs_review = false` does not guarantee publication — the event must also meet the
confidence threshold.

---

## Step 8 — Canonical record upsert

**Insert path (no existing dedupe_key match):**

1. Compute `slug`: `normalise_title(title)` + `'-'` + `to_char(start_at, 'YYYY-MM-DD')`.
   If the slug already exists in `events`, append `-2`, `-3`, etc. until unique.
2. Insert the `events` row with all resolved fields from Steps 1–7,
   `visibility = 'draft'`.
3. Insert `event_tags` rows for each tag in `external_events.tags_guess` that
   maps to a known `tags.slug`. Unknown tags are silently skipped (not auto-created).
4. Write back `external_events.event_id = new events.id`.

**Update path (existing event matched by dedupe_key):**

1. Compare source tier of the incoming connector against `events.primary_source_id`.
   If the incoming source has a numerically lower `tier` (better quality), update
   canonical fields (title, dates, venue, ticket URL, image) from the incoming record.
2. If same or higher tier, update only: `availability`, `availability_note`,
   `updated_at`. Do not overwrite higher-confidence field values.
3. Write back `external_events.event_id = existing events.id`.

**Auto-publish path:**

If `confidence >= 60 AND needs_review = false AND visibility = 'draft'`, set
`visibility = 'published'` immediately for Tier 1 API sources. For Tier 2–4 sources
in Phase 1, keep at `'draft'` until manual review is complete. This conservative
default can be relaxed per-source by setting a flag in `sources.config` once output
quality is validated.

---

## Slug convention

```
{normalised-title}-{YYYY-MM-DD}

Examples:
  mogwai-live-in-glasgow-2026-09-14
  celtic-connections-opening-concert-2027-01-16
  swg3-presents-optimo-2026-07-12

Collision resolution:
  mogwai-live-in-glasgow-2026-09-14      ← first
  mogwai-live-in-glasgow-2026-09-14-2    ← second (different event, same date)
```

Slugs are immutable once set. If an event's title changes (rescheduled, renamed),
the slug does not change. This preserves external links.

---

## Error handling

The normaliser follows the same contract as connectors: errors are returned, not
thrown. If a single `external_events` row fails normalisation (bad JSON, unexpected
null, constraint violation), log the error to the Trigger.dev task log with the
`external_events.id`, skip that row, and continue processing the remaining rows.

A normalisation run is `partial` if some rows succeeded and some failed. It is
`failed` only if zero rows were processed. Partial runs are acceptable and expected
during the early connector testing period.

Write the error count to `ingest_runs.errors_count` alongside the
`upserted_external_count` and `created_events_count` for that run.
