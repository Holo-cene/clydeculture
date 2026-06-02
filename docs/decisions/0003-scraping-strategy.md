# ADR 0003: Scraping and source integration strategy

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** Jamie

## Context

The original Phase 1 plan assumed three Tier 1 API connectors: Ticketmaster, Skiddle,
and Eventbrite. Two of those three have problems:

- **Eventbrite:** Public event search by location (`GET /v3/events/search/` with
  `location.*` parameters) was removed in December 2019. The API is unsupported as of
  2025. There is no way to discover Glasgow events on Eventbrite by location without
  already knowing their event or organisation IDs. Eventbrite cannot fulfil its
  Phase 1 role.

- **Skiddle:** API terms include a non-compete clause (API-03) requiring written
  approval before building. Connector build is gated until that approval is received.

The grassroots/community/workshop coverage tier that Eventbrite was assigned has no
replacement. Additional Phase 1 sources (SWG3, Mono, St Luke's, Flying Duck) require
HTML scraping. Several high-value sources (DICE.fm, StubHub) have no public API and
require rendered-page extraction.

A pure Node `fetch` + CSS-selector approach for HTML scraping requires reinventing
browser management, rate limiting, and JS rendering. Managed scraping platforms
(Apify) and purpose-built scraping frameworks (Crawlee) address these directly.

## Decision

**Source preference order per connector:**

> API → RSS/iCal → JSON-LD → static HTML (Crawlee) → Playwright (Crawlee) → Apify actor

Apply the earliest option that provides sufficient structured data. Higher-tier
sources are always preferred over lower-tier ones when the same event is available
from multiple sources.

**Crawlee for in-process HTML scrapers.** Crawlee (the Node.js scraping framework
from Apify, also available as a standalone npm package) replaces raw `fetch` +
`cheerio` for HTML connectors. Crawlee connectors run inside Trigger.dev tasks as
normal Node processes — no separate worker. Connectors are placed in
`packages/connectors/src/html/` as before. Crawlee's `CheerioCrawler` handles
static HTML; `PlaywrightCrawler` handles JS-rendered pages when needed.

**Apify for hard cloud sources.** Sources where scraping is complex, JS-heavy, or
where a maintained public actor already exists on the Apify Store are handled via
an Apify connector. A Trigger.dev task calls the Apify API to trigger an actor run,
polls for completion, fetches the output dataset, and converts it to `RawEvent[]`.
The connector interface (`run() → IngestResult`) is unchanged.

For the proof-of-concept sprint, use community actors from the Apify Store. Pin to
a specific actor version. Document the actor name and version in the connector's
source file. Migrate to an owned actor if a community actor is unreliable or breaks.

**JSON-LD is a parse step, not a new source type.** Many venue websites embed
structured event data as `<script type="application/ld+json">` (schema.org
`Event`). This is extracted during the HTML connector's `run()` step, before
falling back to CSS selector extraction. The `source_type` enum is unchanged;
the extraction strategy is configured via `sources.config.extraction`:

```json
{ "extraction": "jsonld" }        // try JSON-LD first, CSS fallback
{ "extraction": "css" }           // CSS selectors only
{ "extraction": "playwright" }    // JS-rendered — use PlaywrightCrawler
```

This key only applies to `source_type = 'html'` connectors. Apify connectors
(`source_type = 'apify'`) use `sources.config` for actor ID, input parameters,
and actor version — not an `extraction` key.

**Apify gets its own `source_type`.** The `sources.source_type` CHECK constraint is
extended to include `'apify'`. A `sources` row with `source_type = 'apify'` has a
`config` that includes the Apify actor ID, input parameters, and the actor version
to pin to.

## Sources by integration strategy

### Phase 1 — confirmed

| Source | Strategy | Notes |
|---|---|---|
| Ticketmaster | `api` Tier 1 | Glasgow geo filter, incremental sync by `modified_since` |
| DICE.fm | `apify` Tier 2 | Strong Glasgow underground/club coverage; no public API; Apify Store actor |
| Eventbrite | `apify` Tier 2 | Location-based scrape via Apify actor; replaces deprecated API |
| SWG3 | `html` Crawlee Tier 3 | JSON-LD preferred; CSS fallback |
| St Luke's | `html` Crawlee Tier 3 | Categorised pages (Music / Comedy) |
| Mono | `html` + `ical` Tier 3 | iCal link per event for `start_at` validation |
| The Flying Duck | `html` + `ical` Tier 3 | iCal link per event for `start_at` validation |
| Skiddle | `api` Tier 1 | **Gated — build only after written approval received (API-03)** |

### Phase 1 — pre-flight required

Before building any HTML connector, confirm:
1. `robots.txt` does not disallow the events path.
2. Event listing page renders in a static fetch (no JS required) — or document that
   `PlaywrightCrawler` is needed.
3. JSON-LD is present — or document that CSS selectors are required.

Record findings in the connector's source file header before opening a PR.

### Sources to avoid

| Source | Reason |
|---|---|
| Instagram | ToS prevents scraping; structure is unstable |
| Resident Advisor | No API; link-first only — do not store descriptions or images |
| WhatsOnGlasgow | Scraping risk; duplicates API sources |

## Consequences

**New `source_type = 'apify'`** added to the `sources` table CHECK constraint.
This is part of the schema migration that drops the Webflow fields (ADR 0001).

**Confidence weighting for Apify-sourced events.** Eventbrite coverage via Apify is
`tier = 2` (managed scrape, not a direct API). Events from Apify-backed sources carry
a lower base confidence score than Tier 1 API events. The initial `needs_review` flag
may be set to `true` for all Apify-sourced events during the proof-of-concept sprint
until output quality is validated.

**DICE.fm added to the source landscape.** DICE.fm is a significant Glasgow
underground and club events platform with no public API. It is added as a Phase 1
Apify-backed source. The SPEC and ROADMAP are updated accordingly.

**`packages/ingestion` removed.** Trigger.dev replaces the custom orchestrator
(ADR 0002). Crawlee connectors run inside Trigger.dev tasks.

**Resolved tasks:** API-01 (Eventbrite replacement strategy), API-06 (JS rendering
SPIKE — PlaywrightCrawler handles this within the existing connector model).
