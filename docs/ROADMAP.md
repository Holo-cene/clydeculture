# Clyde Culture — Build Roadmap

> **Superseded by [ADR 0008](decisions/0008-tracer-bullet-delivery.md).** Delivery is now
> tracer-bullet / vertical-slice; "the engine ships before the frontend" no longer holds
> ("engine-first" is a quality bar, not a sequencing rule). The live plan is the
> tracer-bullet PRD (GitHub issues); this horizontal roadmap is retained as reference.

The engine ships before the frontend. Stable, low-maintenance sources (Tier 1 APIs and
managed Apify actors) land before the HTML scrapers that will require occasional upkeep.
ADR 0001 (Astro frontend) and ADR 0002 (Trigger.dev runtime) are accepted; M6 is unblocked.

The maintenance target — 1–3 hours/month post-launch — is achieved structurally, not by
discipline: API and Apify connectors provide ~75% of coverage with low ongoing cost,
and the HTML scrapers that do break are isolated and auto-detected before any manual check
is needed. Each milestone below is sized so it can be completed and tested independently
before the next begins.

---

## Milestone 0 — Repository foundation

Everything downstream depends on the monorepo layout, shared types, and the live database
schema. Nothing else begins until this is stable.

- [ ] pnpm workspaces configured with packages: `shared`, `core`, `connectors`; apps: `web` (`packages/ingestion` removed — Trigger.dev replaces it; `packages/publishing` removed — no sync adapter needed)
- [ ] `supabase/migrations/` holds the v5 schema; applied to a live Supabase project
- [ ] `packages/shared` exports: TypeScript types matching the v5 schema, taxonomy enums, db client (Supabase JS), shared config shape
- [ ] Secrets pattern established: no secrets in committed files; env vars and Supabase Vault documented in `docs/OPERATIONS.md`
- [ ] Basic CI: type-check and lint pass on every push

**Definition of done:** `pnpm build` passes across all packages; a Supabase project exists with the v5 schema applied; no committed secrets.

---

## Milestone 1 — Tier 1 API connectors (ingestion backbone)

These three sources are the highest-ROI work in the project. They provide the majority of
event coverage, use stable external IDs for incremental sync, and require almost no
ongoing maintenance once running. They must land before any HTML scraper, and before the
normalisation pipeline is built, because they define the realistic data shape that the
normaliser will handle.

- [ ] `packages/connectors/src/connector.ts` defines the shared connector interface (fetch, parse, return typed `RawEvent[]`)
- [ ] Ticketmaster Discovery API connector — Glasgow geo query, incremental sync by `modified_since`, stores `external_id` from API response
- [ ] DICE.fm connector — Apify actor; Phase 1 coverage for underground/club events; community actor pinned to specific version
- [ ] Eventbrite connector — Apify location scrape; replaces deprecated public API (removed Dec 2019); Tier 2 confidence — see ADR 0003
- [ ] Skiddle API connector — **gated on written commercial approval (API-03)**; Glasgow region filter, club/nightlife category coverage
- [ ] Trigger.dev cron task wrapping each connector; writes one `ingest_runs` row per connector run
- [ ] Break detection runs after each task: if `parsed_count` drops >70% below the connector's 14-day median, set `sources.status = 'degraded'`, write an `ingest_alerts` row, and trigger a Trigger.dev alert
- [ ] Each connector can be disabled independently via `sources.enabled` without affecting others
- [ ] All connectors store raw payloads in `external_events` with stable `(source_id, external_id)` upsert keys

**Definition of done:** Ticketmaster, DICE, and Eventbrite (Apify) connectors run end-to-end; `external_events` is populated; `ingest_runs` logs are written; a simulated count-drop triggers an `ingest_alerts` row.

---

## Milestone 2 — Normalisation and deduplication

Raw `external_events` rows are shaped, classified, and deduplicated into canonical
`events` records. This is `packages/core`. It runs as a post-ingestion step and must
handle all four connector types (built here for API shape; extended in later milestones
for RSS/iCal/HTML shape).

- [ ] Normaliser in `packages/core`: maps `external_events` fields to the canonical `events` schema — title, `start_at`, `event_type_id`, tags, `venue_id`, `source_url`
- [ ] `event_type_id` classification from source category fields via `source_type_category_map`; falls back to `other`; stores pre-normalisation guess in `external_events.event_type_guess`
- [ ] Confidence scoring (0–100); events below threshold land in `needs_review = true` rather than `visibility = published`
- [ ] Within-source deduplication: upsert by `(source_id, external_id)` on each run
- [ ] Cross-source deduplication: compute `dedupe_key` as SHA-256 of `venue_id | start_bucket | normalised_title`; duplicate candidates written to `event_merge_candidates`
- [ ] Auto-merge: when candidates share a `dedupe_key`, prefer the API-sourced record as canonical; scraped records link to it
- [ ] Festival detection: event is tagged with `festival_id` if source domain, title, or URL matches a known festival slug, and the event date falls inside the festival's start/end window
- [ ] Venue matching: `venue_name` from raw data matched against `venues.name` (normalised); unmatched venues land in `needs_review`

**Definition of done:** API-sourced events flow from `external_events` into `events` with correct `event_type_id`, confidence scores, and `dedupe_key`; a synthetic duplicate across two sources resolves to one canonical record.

---

## Milestone 3 — Venue directory and reference data

The canonical venue and festival tables need seed data before scrapers and the frontend
can use them meaningfully.

- [ ] `venues` table seeded with Phase 1 priority venues: SWG3, St Luke's, The Flying Duck, Mono, The Old Hairdressers, The Pipe Factory — including geocoded lat/lng, slug, and website
- [ ] `festivals` table seeded with reference data for Celtic Connections, Glasgow Comedy Festival, Glasgow Film Festival, Glasgow International, Tectonics — including start/end dates and slug
- [ ] Every Phase 1 API-ingested event that references a known venue is linked to the correct `venue_id`

**Definition of done:** `venues` and `festivals` tables populated; spot-check confirms API events are linking to venue records correctly.

---

## Milestone 4 — Phase 1 HTML / iCal scrapers

HTML scrapers carry higher maintenance risk than APIs. They land after the normalisation
pipeline and break detection are proven, so that any new scraper failure is caught
automatically and does not affect the connectors already running.

Build order within this milestone prioritises the venues with iCal validation available
(Mono, Flying Duck), which reduces scraper fragility, then the structured-HTML-only
venues.

- [ ] Mono connector — HTML listing page scrape, iCal link extracted per event for `start_at` validation
- [ ] The Flying Duck connector — HTML listing page scrape, iCal link extracted per event for `start_at` validation
- [ ] SWG3 connector — structured HTML selector extraction; break detection active from first run
- [ ] St Luke's connector — structured HTML, categorised pages (Music / Comedy); break detection active
- [ ] All four connectors run through the same normalisation and deduplication pipeline as Tier 1 APIs
- [ ] Each scraper stores `last_success_at` in `sources`; count-drop break detection applies

**Definition of done:** all four venue scrapers run end-to-end; events appear in `external_events` and normalise into `events`; a simulated selector change triggers a `degraded` status without affecting any other connector.

---

## Milestone 5 — Submission queue and moderation (backend)

The public submission path is backend-only at this milestone. A frontend form comes later,
once ADR 0001 is resolved.

- [ ] `event_submissions` table accepts inbound submissions with fields: title, description, date/time, venue details, event type, tags, optional source URL
- [ ] Submission `status` flow: `pending` → `approved` (creates canonical event) or `rejected`
- [ ] Moderation interface: minimal — Supabase Studio row-level review is sufficient for MVP; no custom admin UI required at this stage
- [ ] Approved submission writes a canonical event with `confidence = 100`, `needs_review = false`, source type `manual`

**Definition of done:** a submission row inserted directly into `event_submissions` can be approved and results in a correctly formed `events` row.

---

## Milestone 6 — Schema migration + Astro frontend

ADR 0001 is accepted (Astro + Supabase direct read). This milestone is now unblocked.

**Schema migration (prerequisite — complete before any `apps/web` work):**
- [ ] Drop Webflow-only tables: `publish_mappings`, `publish_jobs`, `publish_job_items`
- [ ] Drop Webflow denormalised columns from `events`: `event_type_label`, `venue_name_display`, `venue_slug_display`, `festival_name_display`, `festival_slug_display`, `tags_display`, `location_display`
- [ ] Add `'apify'` to `sources.source_type` CHECK constraint
- [ ] Retain: `is_festival_event`, `is_sold_out`, `has_image`, `availability_note`, `ticket_url_label`, `age_restriction`, `is_online`

**`packages/publishing` removed.** Shared Supabase query helpers move to `packages/shared`.

**RLS policies (prerequisite — must be correct before any route is deployed):**
- [ ] `events`: public read where `visibility = 'published' AND confidence >= 60`
- [ ] `venues`: public read where `status IN ('active', 'temporary')`
- [ ] `event_types`, `tags`, `festivals`, `event_series`, `venue_aliases`: public read
- [ ] `event_tags`: public read where parent event is published
- [ ] `event_submissions`: public insert only
- [ ] All other tables: no public access (service role only)

**`apps/web` — Astro application:**
- [ ] Event listings with filters: date range, event type, venue, festival
- [ ] Festival pages populated from `festivals` table; active festival banner when within start/end window
- [ ] Venue pages with map view (lat/lng from `venues`)
- [ ] Tonight / This Weekend pages (date-range filter shortcut)
- [ ] Public event submission form wired to `event_submissions` backend

**Definition of done:** the public site is live; a newly ingested event moves from `external_events` through normalisation into `events` and is immediately queryable via Supabase anon key; a public submission can be received and, after approval, appears on the site.

---

## Milestone 6.5 — All-event data model foundations (ADR 0005, Tranche A)

Land **before** the RSS/iCal/HTML connector build-out populates real data, so the
single-source / single-venue / single-category / single-link assumptions are not baked
in. Gated by the data-model expansion design & gap audit (prompt `17`). Greenfield +
pre-launch = cheap now, expensive later. The target is a cultural graph, not an events
table. See [ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md),
[ADR 0006](decisions/0006-confidence-trust-and-completeness.md),
[ADR 0007](decisions/0007-editorial-override-and-field-locking.md).

**Revised priority order** (also in ADR 0005 and `docs/prompts/README.md`):

1. [ ] **`event_links` + public RLS (A1):** projection (or RLS-guarded view) surfacing every source/ticket link for a canonical event, anon-readable for published events. Truest link-first. Prompts `18a`/`18b`.
2. [ ] **Confidence trust × completeness split (A3 / ADR 0006):** gate on "is it real?" AND "is it complete enough?", so real sparse grassroots events are not suppressed. Prompt `20`.
3. [ ] **Editorial override & field-locking (A5 / ADR 0007):** `field_overrides` the normaliser/merge must respect. **Land before heavy sweep/re-normalisation** or human fixes get clobbered. Prompts `22a`/`22b`.
4. [ ] **Multi-type events + venue types (A2):** `event_event_types` join; retain `primary_event_type_id`. Prompts `19a`/`19b`.
5. [ ] **Community submission + moderation model (A6):** submit event/venue/organiser, repeat helper, submission↔ingestion reconciliation, moderation, PII/UK GDPR. `docs/SUBMISSIONS.md`; UK GDPR policy in `docs/OPERATIONS.md`; design prompt `23`.
6. [ ] **Organisers / collectives entities (B2a):** `cultural_entities` + `entity_aliases` + `event_entities`. `docs/ENTITIES.md`; design prompt `24`.
7. [ ] **Work/occurrence + parent-child grouping (B1) — design only:** accept the showings shape before cinema/theatre connectors. Prompt `21`. Build deferred (M7.5).
8. [ ] **Geography: neighbourhood now, `places` graph designed (A4 / B3):** nullable `neighbourhood`/`area`/`region` on `venues`; do not hard-code Glasgow.
9. [ ] **Per-source media/rights policy (B4):** `docs/MEDIA_POLICY.md`; `display_permitted` field later.
10. [ ] **Source-type classes + field-level provenance (A7):** `api/feed/scrape/partner/community/editor`; survivor pointer on merged events (A1-007).
11. [ ] Structured entry-model + accessibility/age — design-now, build-later.
12. [ ] Shed Webflow denormalisation last (see Milestone 6 schema migration).

**Definition of done:** an event surfaces all its source/ticket links and belongs to more than one category via the public anon-key read; the confidence split + grassroots protection are documented and tested; field-locking is in place before heavy re-normalisation; the submission model, entities, and work/occurrence shapes are accepted in their docs/ADRs.

---

## Phase 2 — Extended coverage and community tools

Phase 2 begins after the public site is live and the Phase 1 connectors are running
stably. The order within Phase 2 is loose; items can be parallelised.

**M7 — Extended API, RSS, and Apify coverage**
- [ ] Meetup API connector — community meetups, tech groups, social events in Glasgow
- [ ] Glasgow Art Map RSS connector (Substack endpoint) — arts editorial coverage
- [ ] Bandsintown API connector — evaluate for artist-tracking features; defer if artist-page feature is not yet scoped
- [ ] StubHub Apify connector — ticketing coverage for larger events not on Ticketmaster

**M7.5 — Work/occurrence model build + cinema (ADR 0005, Tranche B1 build)**

Triggered by the first high-volume showings source. Build the work/occurrence
structure designed in Milestone 6.5 (prompt `21`), then the cinema connectors that
need it. One film shows many times across many venues, each showing with its own
booking link — without this, cinema floods the flat listing.
- [ ] Build the work ↔ occurrence structure (generalise `event_series`, or a `works` table) per the accepted ADR 0005 design; listing groups by work, not by showing
- [ ] Glasgow Film Theatre connector (direct) — GFT showings as occurrences of film works
- [ ] Cineworld / Vue / Odeon coverage via the Data Thistle connector — cinema showings mapped to the same film works (cross-venue, cross-source de-dup of the same film)
- [ ] Theatre runs and exhibition open-hours reuse the same work/occurrence shape

**M7.6 — People layer (ADR 0005, Tranche B2)**
- [ ] Artists / performers and organisers / promoters entities + event relationships ("every gig featuring X", "everything this promoter is doing"); link-first — name + canonical link, not biographies

**M8 — Extended venue scrapers**
- [ ] The Pipe Factory connector — identify whether a Google Calendar iCal feed is accessible before building an HTML scraper; prefer the feed if available
- [ ] The Old Hairdressers connector — structured HTML
- [ ] Extended venue list (Òran Mór, King Tut's, The Glad Cafe, The Hug & Pint, Stereo, CCA Glasgow, Tramway, Citizens Theatre, Tron Theatre) — each on its own connector; prioritise venues that expose iCal before HTML-only venues
- [ ] Venues table extended with Phase 2 venues

**M9 — Community and editorial tools**
- [ ] Venue claim system: `venue_claims` table; claim requires proof (venue-domain email or role confirmation); approved claimants can edit venue profile
- [ ] Editorial picks: a lightweight curator flag on events that surfaces a small curated selection without ranking or hype language
- [ ] Newsletter automation: scheduled digest drawn from `visibility = published` events for the coming week; plain-text or templated send

---

## Long-term scope

These items have no milestone sequencing yet. They are in scope for the platform's
long-term direction and will be planned when Phase 2 is stable.

- Public API: read-only Supabase-backed API endpoint for other Glasgow platforms to consume event data
- Open-source connector library: documented contribution path so community members can build and maintain connectors for venues they know
- Venue self-management tools: richer admin interface for claimed venues beyond Supabase Studio
- **Expansion to Scotland (then Edinburgh, etc.):** the connector and schema architecture is place-agnostic. The geography columns added in Milestone 6.5 (A4 — `area` / `region` on `venues`) are the foundation; expansion then needs area/region-aware ingestion filters and area browse. Glasgow is built first, then the same model extends to Scotland as a whole (ADR 0005)
- **Enrichment (ADR 0005, Tranche C):** structured filterable accessibility (venue + event level); an entry-model field (free / ticketed / PWYC / donation / RSVP / members-only) for community events; unified faceted / full-text search across title + venue + artist + organiser + tag; user-facing change history beyond the `availability` badge
- Sponsorship and affiliate integration: cultural organisation sponsorship; optional ticket affiliate revenue where terms permit
- Ents24 and Songkick: both require commercial agreements; evaluate only after Tier 1 coverage proves insufficient

---

## Maintenance model

The build order is designed around the maintenance target of 1–3 hours/month post-launch.

| Source tier | Expected coverage | Ongoing cost after launch |
|---|---|---|
| Tier 1 APIs (Ticketmaster, Skiddle¹) | ~45% | Near zero — stable IDs, incremental sync |
| Tier 2 Apify / RSS / iCal (DICE, Eventbrite via Apify, Glasgow Art Map, venue iCal) | ~30% | Low — actor version pinned; update when actor output schema changes |
| Tier 3 HTML scrapers (SWG3, St Luke's, Mono, Flying Duck, others) | ~15% | Occasional — a few fixes per year; break detection catches failures; each fix isolated to one connector |
| Community submissions | ~5% | Moderation — one review session per week, scales with submission volume |

A connector degrading does not affect others. Break detection alerts arrive before any
user notices missing events. The modular connector design means a fix is typically a
CSS selector update in one file, or pinning to a new Apify actor version.

¹ Skiddle gated on commercial approval (API-03).
