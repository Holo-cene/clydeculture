# Clyde Culture — Platform Specification

> The platform's source of truth for scope and design intent. Brand and tone of voice
> live in the companion document `DESIGN_LANGUAGE.md` (and the working tone-of-voice
> guide). The authoritative database schema is `SCHEMA_v5.sql`, which supersedes the
> illustrative data model in Section 8 below.

---

## What Clyde Culture Is

Clyde Culture is Glasgow's shared noticeboard for culture. It makes what's happening
across the city visible and easy to find — music, theatre, workshops, exhibitions,
community events, comedy, club nights, DIY gigs, and more. It showcases independent and
established events, both free and ticketed. It is set up as a non-profit community group
and acts as part of Glasgow's cultural infrastructure.

Technically, clydeculture.com is a lightweight, collaborative cultural index for Glasgow
and the Clyde region. It aggregates "what's on" from reliable sources into a structured,
searchable event platform. It combines API and feed ingestion with community submissions,
normalises event data into a canonical record, and presents it via a frontend layer fed
from Supabase. The goal is low-maintenance, link-first aggregation that respects source
terms, while fostering partnerships and open contribution.

---

## 1. Vision

Clyde Culture is a low-maintenance, scalable, community-driven platform that aggregates
and categorises events happening in Glasgow. It provides structured event summaries with
outbound links to original sources — ticket pages, venue websites, and so on — rather
than republishing third-party content in full. The goal is to become the central
discovery layer for Glasgow culture, combining automated ingestion with community input.

> **Evolving data model.** To house *all* events well — from DIY gigs, community groups,
> and markets to festivals, galleries, and cinema showings — Clyde Culture is evolving
> from a single event/source/venue/category/ticket-link table toward a **cultural graph**
> (events/occurrences, all source links, venues/places, organisers/collectives/artists,
> types/tags, submissions, provenance/trust, media rights), and later Scotland-wide
> coverage. This is phased (NOW / DESIGN-NOW BUILD-LATER / DEFER); details are in
> [ADR 0005](../decisions/0005-event-data-model-for-all-event-coverage.md) and the
> planned-expansion section of [DATA_MODEL.md](../DATA_MODEL.md).

**Platform focus areas**

- Underground arts and exhibitions
- Live music and club culture
- Community meetups
- Independent cultural spaces
- Festivals
- Evergreen venue discovery

---

## 2. Core Principles

**Automation-first ingestion.** The platform ingests events from four source types:
APIs (Ticketmaster, Skiddle, Meetup), RSS feeds (Substack newsletters,
cultural publications), iCal feeds (venue calendars), and structured HTML scraping
and managed Apify actors for venues and platforms such as SWG3, Mono, St Luke's,
and DICE.fm.

**Low maintenance.**

- Stable APIs form the backbone.
- External IDs are stored for incremental sync.
- Scrapers include break detection with automatic failure flags.
- Modular connector design isolates changes to individual sources.

**Normalised data model.** Every event is structured into a canonical record: name,
date/time, venue, location, event type (enumerated taxonomy), tags, short summary,
optional image, source link, and a festival flag where applicable.

**Link-first approach.** Clyde Culture acts as a discovery and routing layer. It does
not republish large amounts of third-party content — it always links back to the
original event source.

**Festival-aware system.** Major festivals — Celtic Connections, Glasgow Comedy Festival,
Glasgow Film Festival, Glasgow International, Tectonics, and others — are first-class
entities. Events can be tagged as festival events, and each festival has a dedicated
page with a banner.

**Evergreen venue layer.** Beyond time-based events, the platform maintains a permanent
cultural directory: venue profiles, a venue map, and a claimable venue system for the
open-source contributor community.

---

## 3. Technical Architecture

### Frontend — presentation layer

The frontend is the presentation layer only. It is **not** the source of truth. Only
approved, high-confidence events are served from it.

**Decision:** Astro + Supabase direct read, anon key scoped by RLS.
See `docs/decisions/0001-frontend-architecture.md`.

- Event listings with filters (date, type, venue, festival)
- Festival pages with banners
- Venue pages and map view
- Tonight / This Weekend dynamic pages
- Public event submission form

### Backend — Supabase (Postgres)

- Canonical event database
- Venue and festival reference tables
- Source connector registry and health tracking
- Deduplication logic
- Moderation queue (submissions and venue claims)
- Publish sync to the frontend

### Ingestion layer

- Scheduled daily jobs
- API connectors, RSS/iCal parsers, HTML scrapers
- Change detection with auto-flagging of degraded connectors

---

## 4. Event Taxonomy

Broad categories are kept intentionally wide. Tags carry the granular detail — techno,
indie, improv, sculpture, poetry, and so on.

**Event types**

- Live Music
- Club Night / DJ
- Comedy
- Theatre
- Arts / Exhibition
- Workshop / Class
- Talk / Lecture
- Film
- Family
- Sport
- Community / Meetup
- Food & Drink
- Other

---

## 5. Data Flow

1. Ingest raw events from APIs, RSS feeds, iCal feeds, and HTML scrapers.
2. Store raw payloads in `external_events`.
3. Normalise into canonical `events` records.
4. Deduplicate across sources using title normalisation, venue matching, and datetime
   bucketing.
5. Attach venue from the `venues` table.
6. Detect festival membership and attach `festival_id`.
7. Push approved events to the frontend for public display.

---

## 6. Source Landscape

Sources are organised into four tiers based on integration stability and maintenance
burden.

### Tier 1 — API Backbone (low maintenance, high ROI)

These run on scheduled daily ingestion, store stable external IDs, and sync
incrementally. They form the coverage backbone for gigs, clubs, and community events.

| Source | Coverage | Integration | Risk | Notes |
| --- | --- | --- | --- | --- |
| Ticketmaster Discovery | Major venues, arenas, tours | Official REST API | Very low | Strong Glasgow coverage; venue geo, categories, images included |
| Skiddle | Clubs, nightlife, promoters | Official API | Medium | Excellent underground/club coverage. **Gated — written commercial approval required from dev@skiddle.com before connector build** — see API-03. |
| DICE.fm | Underground, clubs, live music | Apify actor | Medium | No public API. Strong Glasgow coverage for independent/club events. Phase 1 via Apify actor. |
| Eventbrite | Community, workshops, arts | Apify actor | Medium | Public API location search removed Dec 2019, unsupported 2025. Coverage via Apify location scrape. Tier 2 confidence (not Tier 1 API). See ADR 0003. |
| Bandsintown | Artist-led touring data | Official API | Low | Best used for artist tracking features — Phase 2 |
| Meetup | Community meetups | Official API | Low | Strong for tech, community, and social groups — Phase 2 |
| Ents24 | UK live entertainment | Licensed API | Medium | Requires commercial agreement — high coverage if viable — Phase 2 |
| Songkick | Live music discovery | Partnership API | Medium–High | Requires partnership — evaluate in Phase 2 |

### Tier 2 — RSS / iCal Feeds (very stable)

RSS parsing is extremely stable and ideal for the low-maintenance model. iCal links,
where available, serve as a reliable datetime truth source.

| Source | Coverage | Integration | Risk | Notes |
| --- | --- | --- | --- | --- |
| Glasgow Art Map (Substack) | Arts editorial | RSS | Low | Substack RSS endpoint; excellent structured data |
| Venue Substacks | Arts / community | RSS | Low | Many independent venues use Substack newsletters |
| Mono | Live events | HTML + ICS | Medium | Event pages expose iCal link for date/time validation |
| The Flying Duck | Club / live events | HTML + ICS | Medium | iCal available on event pages |

### Tier 3 — Structured HTML (medium maintenance)

HTML scrapers use CSS selector extraction. Each connector stores a "last successful
parse" timestamp and auto-flags if the parsed event count drops below 70% of its 14-day
median.

| Source | Coverage | Integration | Risk | Notes |
| --- | --- | --- | --- | --- |
| SWG3 | Music, clubs, arts | Structured HTML | Medium | Predictable listing layout; ticket links can be enriched via Ticketmaster/Skiddle |
| St Luke's | Music, comedy | Structured HTML | Medium | Categorised pages (Music / Comedy / etc.) already structured |
| The Old Hairdressers | Arts, music | Structured HTML | Medium | Consistent event listing page |
| The Pipe Factory | Arts | Embedded calendar | Medium | Likely Google Calendar embed — identify iCal feed before scraping |
| Gigs in Scotland | Tours, gigs | Structured HTML | Medium–High | Strong "What's On" UI; implement break detection and throttling |
| See Tickets | Ticketing | Not recommended | High | Enrich via venue scrape rather than scraping See Tickets directly |

### Tier 4 — Cultural Directories & Festivals (enrichment layer)

Used for festival detection, event tagging, and editorial enrichment rather than raw
ingestion.

| Site / Source | Category | Integration | Notes |
| --- | --- | --- | --- |
| Visit Glasgow Events Calendar | Tourism + major festivals | HTML / manual tagging | Useful for major event coverage |
| Creative Glasgow | Creative community | HTML scrape | Community listings |
| The Skinny — Glasgow What's On | Arts / culture listings | Structured HTML | Strong existing categorisation |
| Glasgow Comedy Festival | Festival | HTML scrape (seasonal) | Festival flag required |
| Celtic Connections | Festival | Structured HTML | Festival flag required |
| Glasgow International | Contemporary art festival | HTML scrape | Festival flag required |
| Glasgow Film Festival | Film festival | HTML scrape | Festival flag required |
| Tectonics Festival | Contemporary music | HTML scrape | Festival flag required |
| CCA Glasgow | Arts / exhibitions | HTML / RSS | Varied — may require light HTML parsing |
| GoMA | Arts | HTML | Institutional calendar |
| Tramway | Arts / performance | HTML | Institutional calendar |
| Royal Conservatoire of Scotland | Classical / performance | HTML / iCal | Often stable HTML structure |
| RSNO | Orchestral | HTML / iCal | Structured listings |
| Resident Advisor | Club / electronic | Link-out only | Do not store descriptions or images — link-first only |

### Sources to avoid or treat as link-only

Some sources present significant legal or technical risk. For these, store minimal
metadata and always link to the original source — never store descriptions or images.

| Source | Reason to avoid / limit |
| --- | --- |
| Instagram | Terms of service prevent scraping; structure is highly unstable |
| WhatsOnGlasgow | Scraping risk; duplicates API sources |
| Resident Advisor | Link-first policy; no API; images and descriptions should not be stored |

---

## 7. Major Glasgow Venues

Good scrape, RSS, or iCal candidates. Most use WordPress or a standard CMS, have
consistent event listing pages, and some expose iCal feeds.

**Priority venues (Phase 1)**

- SWG3
- St Luke's
- The Flying Duck
- Mono
- The Old Hairdressers
- The Pipe Factory

**Extended venue list (Phase 2)**

- Òran Mór
- King Tut's
- Barrowland Ballroom
- The Glad Cafe
- The Hug & Pint
- Stereo
- The Art School
- The Pavilion Theatre
- Citizens Theatre
- Tron Theatre
- Theatre Royal
- SEC / Hydro

---

## 8. Data Model

> Illustrative. **Canonical source: `supabase/migrations/`** — the applied migration
> stack (starting from `SCHEMA_v5.sql`) defines the live schema. `DATA_MODEL.md` is the
> human-readable companion. Where this section and those sources differ, those sources
> win; fix the drift here.

### `events` — canonical event record

The primary table. It is what gets published to the frontend and displayed on the site.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| title | text | Required |
| slug | text | Unique |
| summary | text | Short, optional |
| description | text | Optional — do not over-store from scraped sources |
| image_url | text | Optional |
| start_at | timestamptz | Required |
| end_at | timestamptz | Optional |
| timezone | text | Default: Europe/London |
| event_type_id | smallint FK | References `event_types`; see taxonomy in Section 4 |
| venue_id | uuid FK | References `venues` |
| festival_id | uuid FK | Null if not a festival event |
| is_festival_event | boolean | Generated from `festival_id IS NOT NULL` |
| availability | text | on_sale / sold_out / low_stock / postponed / rescheduled / cancelled / not_on_sale; null = unknown. Separate from `visibility` — a cancelled event stays `visibility='published'` with `availability='cancelled'` |
| visibility | text | draft / published / hidden / archived |
| confidence | smallint | 0–100; below threshold triggers `needs_review` |
| needs_review | boolean | Manual moderation flag |
| dedupe_key | text | SHA-256 of venue + date bucket + normalised title |

Tags are stored via the `event_tags` junction table (`event_id`, `tag_id`) referencing
the `tags` reference table — not as a `text[]` column on `events`.

### `external_events` — per-source raw records

One row per upstream item. Enables stable external-ID tracking, incremental sync, diff
detection, and cross-source deduplication.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| source_id | uuid FK | References `sources` |
| external_id | text | Stable ID from upstream (API ID, RSS GUID, iCal UID, or hash) |
| external_url | text | Required |
| raw | jsonb | Full raw payload for debugging and re-parsing |
| title | text | Extracted, pre-normalisation |
| start_at | timestamptz | Extracted |
| venue_name | text | Extracted |
| event_type_guess | text | Pre-normalisation classification |
| tags_guess | text[] | Pre-normalisation tags |
| event_id | uuid FK | Linked canonical event (null until matched) |
| first_seen_at | timestamptz | Ingestion timestamp |
| last_seen_at | timestamptz | Updated each run — use for removal detection |
| is_deleted | boolean | Set true when no longer seen upstream |

### `venues` — evergreen venue directory

| Field | Notes |
| --- | --- |
| id, name, slug | Primary identifiers |
| venue_type | club / gallery / theatre / community (flexible string) |
| address, city, postcode | City defaults to Glasgow |
| lat, lng | Geocoded once manually per venue — minimal ongoing cost |
| website, instagram_handle | Contact / social |
| description, hero_image_url | Evergreen content |
| claimable | Whether venue claim is open — supports the open-source collective model |

### `festivals` — festival wrapper

Festivals are reference entities. Events link to them via `festival_id`. Fields include
name, slug, website, description, banner_image_url, start_date, and end_date. The
start/end date window powers the "active now" logic.

### `sources` — connector registry

One row per upstream connector. Tracks operational state alongside configuration.

| Field | Notes |
| --- | --- |
| id, name, slug | Identifiers |
| source_type | api / rss / ical / html / manual / apify |
| config (jsonb) | Connector-specific configuration — secrets in Supabase Vault / env |
| status | ok / degraded / broken / disabled |
| last_run_at, last_success_at | Operational timestamps |
| last_error_at, last_error | Error tracking for break detection |
| enabled | Toggle connector on/off without deletion |

---

## 9. Deduplication Strategy

Events commonly appear across multiple sources — a concert may appear on Eventbrite, the
venue site, Skiddle, and Bandsintown simultaneously. Deduplication is therefore critical.

**Within-source deduplication.** Use the `external_id` from the upstream source as a
stable key. On each ingestion run, upsert by `(source_id, external_id)`. This handles all
updates and re-ingestion cleanly.

**Cross-source deduplication.** When no stable external-ID match exists, compute a
`dedupe_key` from three components:

```
venue_normalized = lower(trim(venue_name))
title_normalized = lower(strip_punctuation(title))
start_bucket     = date_trunc('hour', start_at)   -- or 30-minute buckets for precision
dedupe_key       = SHA-256(venue_normalized + '|' + start_bucket + '|' + title_normalized)
```

Candidate matches above a fuzzy-score threshold are stored in `event_merge_candidates`
for review or auto-merge. When duplicates are confirmed, prefer the API-sourced record as
canonical over scraped records.

---

## 10. Connector Health & Break Detection

Each ingestion run writes a row to `ingest_runs`, recording `fetched_count`,
`parsed_count`, `upserted_external_count`, `created_events_count`, `updated_events_count`,
`errors_count`, `status`, and any error message.

An automated check after each run compares `parsed_count` to the 14-day median for that
connector. If the count drops by more than 70%, the connector is automatically flagged:

- `connector_status` is set to `degraded`
- An `ingest_alert` row is created
- An email notification is sent

This keeps maintenance low — HTML scrapers will break occasionally, but the system
detects failures quickly without manual checking. Connectors can be disabled
independently without affecting others.

---

## 11. Festival Detection

Festival membership is determined automatically during normalisation. An event is tagged
as a festival event if any of the following conditions are met:

- The source domain matches a known festival domain.
- The event title contains the festival name.
- The source URL contains a known festival slug.
- A manually curated mapping table links the event.

When a festival match is detected, the system attaches a `festival_id`, sets
`is_festival_event` to true, and enables the festival banner ribbon on the event listing
page. Festival pages are populated automatically from this data.

> Implementation note: validate that the event's date falls inside the festival's
> start/end window before tagging, to avoid false positives from title or slug matches.

---

## 12. Community Submissions & Venue Claims

**Public event submissions.** A public submission form writes to the `event_submissions`
table. Submissions include title, description, date/time, venue details, event type,
tags, and an optional source URL. Each submission enters a moderation queue
(`status = pending`) and must be approved before becoming a canonical event.

**Venue claims.** Any authenticated user can claim a venue via the `venue_claims` table.
The claim requires proof (for example, an email from the venue domain or a role
confirmation). Approved claimants can then manage that venue's profile, keeping the
directory accurate without central editorial overhead.

---

## 13. Frontend Publishing

The frontend (Astro) reads Supabase directly via the anon key. There is no sync job.
Publishing is a visibility state transition: when `visibility = 'published'`, the event
is immediately queryable by the frontend. RLS enforces this at the database layer.

Only events with `visibility = 'published'` and `confidence >= threshold` are returned
by the public RLS policy. See `docs/PUBLISHING.md` for the full lifecycle.

The `publish_mappings`, `publish_jobs`, and `publish_job_items` tables are retired
and will be dropped in the schema migration (ADR 0001).

---

## 14. MVP Scope

### Phase 1

**Ingestion backbone**

- Ticketmaster API (Tier 1)
- DICE.fm — Apify actor (Tier 2)
- Eventbrite — Apify location scrape (Tier 2; public API deprecated Dec 2019 — see ADR 0003)
- Skiddle API (Tier 1) — **gated on written commercial approval from dev@skiddle.com (API-03)**

**Venue ingestion (Crawlee)**

- SWG3 — JSON-LD preferred, CSS fallback
- Mono — HTML + iCal validation
- The Flying Duck — HTML + iCal validation
- St Luke's — categorised HTML pages (Music / Comedy)

**Core features**

- Event listing by date and category
- Festival flag system with dedicated festival pages
- Venue pages and venue map
- Public submission form with moderation queue

### Phase 2

- Meetup API integration
- Glasgow Art Map RSS
- Expanded venue coverage (Pipe Factory, Old Hairdressers, etc.)
- Venue claim system
- Editorial picks
- Newsletter automation
- Tonight / This Weekend dynamic pages

---

## 15. Long-Term Vision

- Become the central cultural index of Glasgow.
- Open-source connector library maintained by the community.
- Venue self-management and editorial tools.
- Public API for other Glasgow platforms to consume.
- Sponsorship from cultural organisations.
- Optional ticket affiliate revenue.
- Expandable to Edinburgh and other Scottish cities.

---

## 16. Risks & Mitigation

| Risk | Mitigation |
| --- | --- |
| HTML scrapers breaking | Break detection with auto-flag; modular connector design limits blast radius |
| Third-party terms compliance | API-first backbone; link-first approach for scraped sources; minimal content storage |
| Data duplication across sources | External-ID tracking + cross-source `dedupe_key` logic |
| Overengineering too early | Strict Phase 1 scope; avoid building features before validating coverage |
| Maintenance creep without contributor model | Venue claim system and open-source connectors distribute maintenance burden |

---

## 17. Success Criteria

- Comprehensive live music coverage for Glasgow.
- Strong representation of underground arts events.
- Reliable festival tagging with dedicated pages.
- Low weekly maintenance overhead (target: 1–3 hours/month post-launch).
- Clear, consistent event categorisation.
- High-quality, accurate venue directory.
- Community trust evidenced by venue claims and submissions.

---

## 18. Realistic Maintenance Expectations

If built correctly, API and RSS sources will provide roughly 80% of event coverage and
require almost no ongoing maintenance. HTML scrapers will break occasionally — a few
times per year — but with modular connectors and break detection, each fix is isolated
and fast.

| Source tier | Coverage share | Maintenance |
| --- | --- | --- |
| Tier 1 (APIs) | ~60% | Near zero — incremental sync, stable IDs |
| Tier 2 (RSS / iCal) | ~20% | Near zero — very stable feed formats |
| Tier 3 (HTML scrapers) | ~15% | Occasional — a few fixes per year, isolated to one connector |
| Community submissions | ~5% | Moderation — scales with community growth |

Target ongoing effort: 1–3 hours per month after initial build, assuming modular
connectors and no major source API changes.