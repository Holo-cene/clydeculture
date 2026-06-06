# Deduplication

Clyde Culture ingests the same event from multiple sources routinely. A Saturday-night gig at SWG3 may appear on Ticketmaster, Skiddle, and the venue's own HTML page. Without deduplication, each source produces a separate listing. This document specifies the two-stage strategy that collapses those rows into one canonical event record.

---

## Stage 1 — Within-source deduplication (upsert by external ID)

Every source supplies a stable identifier for each of its events: a Ticketmaster event ID, a Skiddle event ID, an RSS GUID, an iCal UID. These are stored in `external_events.external_id`. The `external_events` table carries a unique constraint on `(source_id, external_id)`.

On every ingestion run, the connector upserts into `external_events` on this pair. If the record already exists, the extracted fields are overwritten and `last_seen_at` is refreshed. If it is new, a row is inserted. This means re-running a connector is always idempotent: no duplicates accumulate, and updated metadata (a rescheduled time, a new ticket link) lands correctly without manual intervention.

Within-source deduplication requires no additional logic. It is enforced at the database level by the unique constraint, and the upsert pattern handles all update, re-ingestion, and incremental-sync cases in a single operation.

---

## Stage 2 — Cross-source deduplication (dedupe_key hash)

When a different source ingests the same event, there is no shared external ID to match on — a Ticketmaster ID means nothing to a venue HTML scraper. Cross-source deduplication is instead based on a deterministic hash of three normalised fields: resolved venue, time bucket, and normalised title.

### The dedupe_key

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

`start_at` is truncated in UTC to avoid session-timezone dependency (BE-09) — using the session timezone would produce different hashes depending on where the normaliser runs. The result is stored in `events.dedupe_key`, which carries a `UNIQUE` index. When the normalisation pipeline tries to insert a second canonical event that hashes to the same key, the constraint violation is caught and converted to an update of the existing record.

### Normalisation rules

**Venue.** The hash uses `venue_id` (a UUID), not the raw venue name string. Venue resolution must therefore happen before the dedupe key is computed. The pipeline calls `resolve_venue(venue_name)`, which checks `venues.name` first, then the `venue_aliases` table. A venue listed as "Barrowlands", "The Barrowland Ballroom", and "Barrowland Ballroom" across three sources all resolve to the same UUID and therefore the same key component.

If `resolve_venue` returns null, `auto_create_venue` creates a bare `venues` row (`auto_created = true`, `needs_review = true`, `status = 'pending'`) and returns its new UUID. Two different sources using two different unrecognised name variants for the same venue will generate two different UUIDs and two different dedupe keys. Those records will not automatically merge; instead they become fuzzy-match candidates (see below). This is a deliberate trade-off: unresolved venues create separate canonical records rather than false deduplications.

**Title.** `normalise_title(text)` strips all non-alphanumeric characters, collapses internal whitespace to a single space, and lowercases the result. "Mogwai: Live in Glasgow!" and "Mogwai - Live in Glasgow" both normalise to `mogwai live in glasgow`. The function is marked `IMMUTABLE` and is safe to use in index expressions.

**Time bucket.** `start_at` is truncated to the hour in UTC using `DATE_TRUNC('hour', start_at AT TIME ZONE 'UTC')` (BE-09 — using the session timezone would produce different hashes depending on where the normaliser runs). An event listed at 20:00 by Ticketmaster and at 20:30 by Skiddle both truncate to the same `2026-06-14-19` UTC bucket and produce the same hash component.

### Bucket size trade-off: hourly vs. 30-minute

Hourly bucketing (the current choice) tolerates the most common timing mismatches. API sources often report start times in round hours while scraper sources report the same event at a 30-minute offset. Hourly buckets collapse these naturally.

The cost is a higher theoretical false-positive rate: two different events at the same venue starting within the same clock hour with similar titles (two back-to-back DJ sets, two workshop sessions) could hash to the same key. In practice, this is rare for the Glasgow cultural calendar; venues rarely schedule two events of identical type within a single hour. If that use case becomes common, reducing the bucket to 30 minutes narrows the merge window at the cost of needing more precise source data. The bucket size is isolated to `compute_dedupe_key` and can be adjusted in a single migration.

---

## Fuzzy-match candidates

The dedupe key handles exact-match-after-normalisation cases. It does not catch events where the title wording differs materially across sources: "Mogwai" on one source vs. "Mogwai: Live At SWG3" on another will not hash to the same key.

For these cases, the normalisation pipeline runs a secondary pass using trigram similarity (`pg_trgm`). Pairs of canonical events that share a venue and time bucket but have different dedupe keys are scored by title similarity. Any pair at or above the similarity threshold (0.35 in Phase 1; see below) is written to `event_merge_candidates`:

| Column | Notes |
|---|---|
| `event_a_id`, `event_b_id` | Stored in canonical order via `LEAST/GREATEST` to prevent duplicate pairs |
| `similarity` | 0–1 trigram score |
| `match_reasons` | JSONB breakdown: `same_venue`, `same_hour_bucket`, `title_similarity` |
| `status` | `pending`, `merged`, `rejected` |
| `merge_group_id` | Groups three or more candidates relating to the same underlying event |

A `pending` merge candidate surfaces in the moderation queue for manual review. An operator can confirm the merge (setting `status = 'merged'`) or dismiss it (`rejected`). Auto-merge may be enabled in future for pairs above a high-confidence threshold, but requires deliberate configuration.

### Fuzzy-match threshold

The similarity threshold for Phase 1 is **0.35**.

- **Rationale:** 0.35 is intentionally conservative for early ingestion. It is low enough to catch title variants with materially different word order — for example, "Sub Club: Optimo" / "Optimo at Sub Club" (trigram similarity ≈ 0.61) — while high enough not to flood the merge queue with genuinely different events that share one or two common words.
- **Scope:** Global for Phase 1 — one threshold applies to all source types and venue categories. Per-source tuning is deferred.
- **False positives:** At 0.35, short-title events at the same venue on the same day may occasionally be flagged. Human review resolves these. They are not a blocker.
- **False negatives:** Events with very different title formats — for example, "Mogwai" vs. "Mogwai: Live At SWG3" — may score below 0.35 after normalisation and not be caught. These are logged but are not a Phase 1 blocker.

**Worked examples:**

| Normalised title A | Normalised title B | Similarity | Outcome |
|---|---|---|---|
| `sub club optimo` | `optimo at sub club` | ≈ 0.61 | Above 0.35 — merge candidate created |
| `the secret garden party` | `the secret room sessions` | ≈ 0.29 | Below 0.35 — no candidate created |

### Duplicate candidate prevention

Repeated ingestion runs MUST NOT create duplicate `event_merge_candidates` rows for the same pair. The schema enforces this via a unique index on `(LEAST(event_a_id, event_b_id), GREATEST(event_a_id, event_b_id))`.

All inserts into `event_merge_candidates` MUST use `ON CONFLICT DO NOTHING` (or equivalent) against this index. Do not use raw `(event_a_id, event_b_id)` column ordering for the constraint — the pair `(A, B)` and `(B, A)` would bypass a plain equality constraint and create duplicate review rows on repeated ingestion runs.

---

## Doors vs Show Time

Live music listings frequently represent the same event twice — once with the doors time and once with the show time. The typical offset is 30–60 minutes. Without a documented policy, a naive implementation might auto-merge these pairs and discard timing data that is genuinely useful to attendees.

### Detection criteria

A doors-vs-show-time ambiguity is flagged when two `external_events` rows share:

- the same normalised venue (`venue_id`),
- the same normalised title (after `normalise_title`),
- the same calendar date,
- `start_at` values **≤ 90 minutes apart**.

### Policy

These pairs MUST NOT be auto-merged in Phase 1. They MUST be written to `event_merge_candidates` with `match_reasons` including `doors_show_time_ambiguity: true`, and `status = 'pending'` for human review.

**Rationale:** For Glasgow live music, the distinction between doors time and show time is meaningful to attendees. Merging on time ambiguity without confirmation risks discarding a `doors_at` value that a lower-tier source captured but a higher-tier source did not report. Human review is safer.

### Time field precedence

When an operator confirms a merge:

- `start_at` in the surviving canonical event holds the **show time**, taken from the higher-tier source.
- `doors_at` is populated from the lower-tier source if it carried the doors time and the canonical event did not already have one.
- The lower-tier `external_events` row is marked `is_deleted = true` after the merge is confirmed.

### What MUST NOT happen

- MUST NOT auto-merge adjacent-hour same-venue same-title pairs in Phase 1.
- MUST NOT discard the `doors_at` field without human confirmation.
- MUST NOT leave two published canonical events for the same gig after a merge is confirmed.

---

## Multi-Room Venues (Phase 1 Limitation)

Venues like SWG3, the Barrowlands complex, and CCA operate multiple rooms under one brand. In Phase 1, these are modelled as a single `venues` row. Simultaneous events in different rooms share the same `venue_id`, which causes `dedupe_key` collisions and false-positive `event_merge_candidates` rows when titles are similar.

### Known limitation

SWG3 Tech Room, SWG3 Warehouse 23, and SWG3 Galvanizers events can appear as merge candidates even when they are distinct simultaneous events in different rooms. The schema (`events`, `venues`) carries no `room_name` or `parent_venue_id` column in Phase 1.

### Phase 1 decision

Accept this as a known limitation. Multi-room false positives surface in the moderation queue (`needs_review = true`) for human review. Operators SHOULD learn to recognise SWG3 multi-room pairs and reject them. Do NOT implement automated room-name detection or sub-venue splitting in Phase 1.

### Future options (deferred to Phase 1.5)

**Option A — Sub-venue rows with `parent_venue_id`:**
Model SWG3 Tech Room, Warehouse 23 etc. as child `venues` rows linked to a parent via a `parent_venue_id` column. Richer venue data, more schema work.

**Option B — `events.room_name` field:**
Add an optional `room_name` text column to `events`. When non-null, include it as an additional component of `compute_dedupe_key`. Smallest change, most directly resolves hash collisions.

A task MUST be created in Phase 1.5 to decide between these options and implement one.

---

## Canonical record preference: API over scraped

When a merge is resolved — whether by dedupe key collision or by a confirmed `event_merge_candidates` merge — the pipeline must choose which `external_events` row is the authority for the canonical event fields. The rule is: **API-sourced records win over scraped records**.

Source tier (stored in `sources.tier`) determines this ranking:

- **Tier 1** (structured API: Ticketmaster, Skiddle) — authoritative
- **Tier 2** (Apify actors, RSS/iCal feeds: DICE.fm, Eventbrite via Apify) — high trust
- **Tier 3** (HTML scrapers — Crawlee) — supplementary; used when no higher-tier record exists

Where two records from the same tier conflict, the more recently fetched record is preferred. The canonical `events` row is updated to reflect the winning source's fields, but all contributing `external_events` rows retain their individual `event_id` link. This means the system knows that four sources carry the same event, can update the canonical record if the API source changes, and can detect removal if the API source stops returning it.

---

## Reschedule

When a source changes an event's date, time, or venue and the `external_events` row is re-ingested, the normaliser MUST NOT create a ghost duplicate published row.

**Invariant:** one external event, rescheduled and re-ingested, produces exactly one canonical event. Never two published rows.

**Detection:** `external_events.event_id` is already set (the event was previously normalised), but the newly computed `dedupe_key` differs from the existing `events.dedupe_key`.

**Safe path** — the new dedupe_key does not collide with any other canonical event:
- Update the canonical `events` row in place (`dedupe_key`, `start_at`, etc.).
- Set `availability = 'rescheduled'` and `needs_review = true`.
- The `external_events.event_id` link is preserved. No new canonical row is created.

**Unsafe path** — the new dedupe_key collides with a different canonical event:
- MUST NOT auto-update. The update would merge two unrelated events.
- Set `needs_review = true` on both affected canonical events.
- Write a merge candidate to `event_merge_candidates` for human review.

**Upstream availability signal:** if a Tier 1 source explicitly sets `availability = 'rescheduled'` or `'postponed'`, set `needs_review = true` immediately regardless of whether the dedupe_key changed.

Full reschedule path implementation detail is in `docs/NORMALISATION.md` Step 8.

---

## Worked examples

### Example 1 — Exact cross-source match (hash collision)

**Event:** Fontaines D.C. at Barrowland Ballroom, 21:00 on 14 June 2026.

| Source | Raw title | Raw venue | Raw start_at |
|---|---|---|---|
| Ticketmaster | `Fontaines D.C.` | `Barrowland Ballroom` | `2026-06-14 21:00:00+01` |
| Skiddle | `Fontaines DC` | `Barrowlands` | `2026-06-14 21:00:00+01` |

**Normalisation:**

- Both venue strings resolve to the same `venues` row via `venue_aliases` (UUID: `abc-123`).
- `normalise_title('Fontaines D.C.')` → `fontaines dc`
- `normalise_title('Fontaines DC')` → `fontaines dc`
- Both `start_at` values truncate to `2026-06-14-20` in UTC (21:00+01 = 20:00 UTC).
- Both hash to the same `dedupe_key`.

**Result:** The Ticketmaster record inserts the canonical `events` row. The Skiddle upsert hits the unique constraint on `dedupe_key`, and the pipeline updates the existing record rather than inserting. Both `external_events` rows link to the same `events.id`. The Ticketmaster fields are retained as authoritative (Tier 1 over Tier 1 — the earlier-seen record wins by timestamp).

---

### Example 2 — Time offset match

**Event:** Sub Club night, 23:00 on Saturday 20 June 2026.

| Source | Raw title | Raw venue | Raw start_at |
|---|---|---|---|
| Skiddle | `Sub Club: Optimo` | `Sub Club` | `2026-06-20 23:00:00+01` |
| SWG3 scraper | `Optimo at Sub Club` | `Sub Club, Glasgow` | `2026-06-20 23:30:00+01` |

**Normalisation:**

- Both venue strings resolve to the same `venues` row. The scraper's `Sub Club, Glasgow` variant is registered in `venue_aliases`.
- `normalise_title('Sub Club: Optimo')` → `sub club optimo`
- `normalise_title('Optimo at Sub Club')` → `optimo at sub club`
- UTC hourly bucket for both: `2026-06-20-22` (23:00+01 = 22:00 UTC).
- The titles normalise differently, so the hashes do not collide. Two separate canonical events are created.

**Fuzzy pass:** The pipeline detects the pair shares a venue and a time bucket. Trigram similarity between `sub club optimo` and `optimo at sub club` is approximately 0.61, exceeding the 0.35 Phase 1 threshold. A row is written to `event_merge_candidates` (`status = 'pending'`).

**Result:** An operator reviews the candidate, confirms the merge, and the scraper-sourced canonical event is hidden (`visibility = 'hidden'`). The Skiddle record (Tier 1) becomes the surviving canonical. The scraper's `external_events` row has its `event_id` updated to point to the surviving event, so the pipeline continues tracking the scraper's view of the event for removal detection.

---

### Example 3 — Unresolved venue creates separate candidates

**Event:** A pop-up gig at a new venue not yet in the `venues` table.

| Source | Raw title | Raw venue | Raw start_at |
|---|---|---|---|
| Eventbrite (Apify, Tier 2) | `Hyd: Glasgow Tour` | `The Rum Shack` | `2026-07-05 19:00:00+01` |
| Venue HTML scraper (Tier 3) | `Hyd Live` | `Rum Shack Glasgow` | `2026-07-05 19:00:00+01` |

**Normalisation:**

- `resolve_venue('The Rum Shack')` returns null. `auto_create_venue` creates a bare `venues` row with UUID `def-456` (`needs_review = true`).
- `resolve_venue('Rum Shack Glasgow')` also returns null. A second bare row is created with UUID `ghi-789`.
- The two records produce different `venue_id` components and therefore different dedupe keys.

**Fuzzy pass:** The pair is flagged as a merge candidate. `match_reasons` includes `same_hour_bucket` and `title_similarity: 0.82`.

**Result:** An operator resolves the venue alias: `Rum Shack Glasgow` is added to `venue_aliases` pointing to `def-456`. The Eventbrite (Apify) record (Tier 2) is canonical over the Tier 3 HTML scraper record. On the next ingestion run, the scraper's `external_events` row recomputes its dedupe key, now matches the Eventbrite record, and the duplicate canonical event is merged and hidden. The bare `ghi-789` venue row is marked `is_deleted` and queued for cleanup.
