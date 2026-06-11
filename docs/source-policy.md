# Source Policy and Link-First Compliance

This document defines what data Clyde Culture is permitted to store, what must only be
linked to, and what is prohibited for each source type. It applies to all connector
authors, reviewers, and anyone enabling a new source in the database.

**Before enabling any source:** read this document and the relevant connector SPEC.md
or pre-flight notes. If a source is listed as blocked or deferred below, do not enable
it without completing the listed prerequisite.

---

## 1. The Link-First Model

Clyde Culture is a discovery and routing layer, not a publisher. Every event on the
platform must link back to its origin. This is a hard rule — it applies regardless of
what the source technically permits.

### What "link-first" means in practice

**`externalUrl` is required on every `RawEvent`.** If a connector cannot produce a valid
HTTPS URL for a record, that record must be skipped. Push a descriptive error to
`IngestResult.errors`. Do not emit a `RawEvent` without an `externalUrl`.

### RawEvent fields: metadata vs. content

**Metadata fields — always permitted (where the source provides them):**

| Field | Notes |
|---|---|
| `externalId` | Stable upstream identifier — required |
| `externalUrl` | Source event page URL — required |
| `title` | Event name — required |
| `startAt` | ISO 8601 start time — optional |
| `endAt` | ISO 8601 end time — optional |
| `doorsAt` | ISO 8601 doors time — optional |
| `venueName` | Venue name string — optional |
| `eventTypeGuess` | Category hint from source — optional |
| `tagsGuess` | Tag hints from source — optional |
| `priceMinGuess` | Minimum price (GBP) — optional |
| `priceMaxGuess` | Maximum price (GBP) — optional |
| `isFreeGuess` | Free event flag — optional |
| `ticketUrlGuess` | Ticket purchase URL — optional |
| `ticketUrlLabelGuess` | CTA label (e.g. "Buy on Ticketmaster") — optional |
| `availabilityGuess` | Availability status hint — optional |
| `raw` | Full upstream payload, kept for debugging — required |

**Content fields — require ToS review per source:**

| Field | Notes |
|---|---|
| `imageUrlGuess` | Image CDN URL. Store only if provider ToS permits hot-linking or image display. See ADR 0004 for Ticketmaster. Never download or proxy-cache image binaries. |

There is no `description` or `summary` field in `RawEvent` by design. The normalisation
pipeline may store a short summary (≤ 280 characters) in `events.summary` only where the
source's terms permit and the content is genuinely factual (e.g. a venue-provided blurb).
Even then, link-first takes precedence: the `externalUrl` is the canonical content.

### What is prohibited under link-first

- Storing full event descriptions or promotional copy from any source.
- Downloading or proxy-caching image binaries from any source.
- Reproducing event listings in a way that removes the need to visit the source.
- Storing any content from sources whose ToS explicitly prohibit reproduction
  (Resident Advisor, Instagram — see §2 below).
- Setting `imageUrlGuess` for any source whose image display terms have not been reviewed
  and documented.

---

## 2. Per-Source Policy

### API Sources (Tier 1)

#### Ticketmaster

**Status:** Connector built; source disabled pending live API key and sweep validation.
See [ADR 0004](decisions/0004-ticketmaster-image-usage.md) for image handling.

| Item | Policy |
|---|---|
| Permitted data | `externalId`, `externalUrl`, `title`, `startAt`, `endAt`, `doorsAt`, `venueName`, `eventTypeGuess`, `tagsGuess`, `priceMinGuess`, `priceMaxGuess`, `isFreeGuess`, `ticketUrlGuess`, `ticketUrlLabelGuess`, `availabilityGuess`, `imageUrlGuess` (HTTPS CDN URL only — hot-link at render time) |
| Prohibited | Downloading or caching image binaries. Storing descriptions. Displaying events without attribution. |
| Attribution required | `ticket_url_label = "Buy on Ticketmaster"` must appear adjacent to any Ticketmaster-sourced image and event listing. The `externalUrl` must always link to the Ticketmaster event page. |
| Images | Permitted — store CDN URL, hot-link at render time, re-check on each sweep. ADR 0004 accepted. |
| ToS reference | [developer.ticketmaster.com/support/terms-of-use](https://developer.ticketmaster.com/support/terms-of-use/) — reviewed in E1 pre-flight, `packages/connectors/src/api/ticketmaster/SPEC.md` §8. |

#### Skiddle

**Status:** Blocked — written approval required before building. See API-03.

| Item | Policy |
|---|---|
| Current status | **Blocked.** The Skiddle API terms include a non-compete clause (API-03) that requires written approval before building a connector or enabling the source. |
| What is needed | Obtain written approval from Skiddle before writing any connector code or enabling the source in the database. |
| Permitted data | Title, start time, venue name, external URL, ticket URL, price range — subject to confirmation in their API terms once approval is received. |
| Prohibited | Do not enable, build, or test the Skiddle connector until written approval is in hand and reviewed. |

#### Data Thistle

**Status:** Staging-only — internal ingestion permitted; **public display licence-gated.**
See `packages/connectors/src/api/datathistle/SPEC.md` and the policy module
`packages/shared/src/sourcePolicy.ts` (`allowStagingCollection: true`,
`productionEnabled: false`, `allowPublicDisplay: false`).

| Item | Policy |
|---|---|
| Permitted data (staging) | `externalId` (composite `event_id` + `place_id` + performance timestamp), `externalUrl` (HTTPS website or typed booking link), `title`, `startAt`, `endAt` (structured duration only), `venueName`, event-attached `place_id` (venue matching only), `eventTypeGuess`/`tagsGuess` (source tag text preserved), `priceMinGuess`/`priceMaxGuess`/`isFreeGuess` (structured GBP only), `ticketUrlGuess`, `availabilityGuess`, minimal sync identifiers in `raw`. |
| Prohibited | Descriptions and long copy. Images, image URLs, image metadata, hotlinking, caching, proxying. Rich place data and reusable venue enrichment. Ticket description text. **Any public display while `productionEnabled = false`.** |
| Attribution required | Data Thistle attribution (logo + link + update-route links) is required by their API terms before any public display; exact wording/asset unresolved — one of the production blockers in SPEC.md §14.2. |
| Auth | `Authorization: Bearer` JWT from `DATA_THISTLE_ACCESS_TOKEN`; optional refresh via `DATA_THISTLE_REFRESH_TOKEN`/`DATA_THISTLE_AUTH_BASE_URL`. Secrets in env/secret stores only. |
| ToS reference | [api.datathistle.com/terms](https://api.datathistle.com/terms) and [datathistle.com/terms](https://www.datathistle.com/terms/) — cache/refresh limits, Place Data restrictions, and attribution requirements reviewed in SPEC.md §10–§11. |

---

### RSS and iCal Sources (Tier 2)

RSS and iCal connectors ingest structured feeds published voluntarily by venues and
promoters. They are the preferred source type after direct APIs because they are stable,
low-maintenance, and generally involve minimal ToS friction.

**Typically permitted for RSS/iCal:**

- Event title
- Start and end times (from the `<pubDate>`, `<startDate>`, or iCal `DTSTART` field)
- Venue name (where included in the feed)
- External URL (`<link>` or iCal `URL`)
- A short summary or description if provided by the feed — subject to ToS (see below)
- Image URL if included and if the source's ToS permit display

**Typically prohibited for RSS/iCal:**

- Copying the full article body or newsletter content. RSS items from Substack
  newsletters (e.g. Glasgow Art Map) are newsletter posts, not structured event records.
  Their `<content:encoded>` fields contain long-form writing that must not be stored.
  Store only the title and link; leave `startAt` absent for newsletter-type RSS sources.
- Caching full images from RSS items. Store only the image URL; never download binaries.
- Treating the `<pubDate>` of a newsletter RSS item as `startAt` — it is the
  publication date of the post, not the date of any event described inside it.

**Venue iCal feeds (e.g. a Glasgow venue's own `/events.ics`):**

Venue iCal feeds are low-risk because venues publish them specifically to share event
data. Before enabling any venue iCal connector:

1. Confirm the feed URL is publicly documented or linked on the venue's website.
2. Check for a ToS or usage policy on the venue site.
3. Record the feed URL and any usage restrictions in the connector's source file header.

No pre-flight checklist (robots.txt / JS rendering) is needed for iCal — it is a
data feed, not a page scrape.

---

### Apify / Scraper Sources (Tier 2–3)

#### Eventbrite via Apify

**Status:** Stub connector exists (`packages/connectors/src/apify/eventbrite/`). Not implemented. Do not implement until compliance documentation is complete.

| Item | Policy |
|---|---|
| Current status | **Implementation gated.** Do not implement until `docs/connectors/eventbrite/COMPLIANCE.md` has been written and reviewed. This file does not yet exist. |
| What is needed | Write and review `docs/connectors/eventbrite/COMPLIANCE.md`, documenting Eventbrite's ToS position on third-party scraping, what data fields are permitted, and what must be omitted. |
| Permitted data | To be confirmed in compliance review. Likely: title, start/end time, venue name, external URL, price range, availability. |
| Prohibited | Full descriptions. Binary image caching. Any data that Eventbrite's ToS prohibits. |
| Note | Eventbrite's public event search API (location-based) was deprecated in 2019. The Apify actor is a scrape of the Eventbrite web interface. This carries higher ToS risk than a direct API. The compliance review must address this explicitly. |

#### DICE.fm

**Status:** Deferred — policy research required before any code is written.

| Item | Policy |
|---|---|
| Current status | **Deferred.** ADR 0003 added DICE.fm as a Phase 1 Apify source but gated implementation behind task CC-NEW-2 (DICE.fm pre-flight). CC-NEW-2 must be completed before any connector code is written. |
| What is needed | CC-NEW-2: verify Apify actor output schema; confirm ToS compliance; document permitted fields and attribution requirements. |
| Permitted data | To be confirmed in CC-NEW-2. |
| Prohibited | Do not build, test, or enable the DICE.fm connector until CC-NEW-2 is complete. |

#### Venue HTML Scraping (SWG3, Mono, St Luke's, The Flying Duck)

**Status:** Planned. Pre-flight required before any connector is built.

HTML connectors are the most fragile source type and carry the most ToS risk. Before
writing any code for an HTML connector, complete the pre-flight checklist in
`docs/CONNECTOR_GUIDE.md` §8 and record findings in the connector's source file header.

**Required pre-flight steps for each venue:**

1. Check `https://<domain>/robots.txt` — does it allow crawling the events listing path?
   If the events path is disallowed, do not build the connector.
2. Check the venue site's Terms of Service for any prohibition on automated access.
   If ToS prohibits scraping or automated access, do not build the connector.
3. Check whether the events page embeds JSON-LD (`<script type="application/ld+json">`
   with `schema.org/Event`). If present, prefer JSON-LD extraction over CSS selectors.
4. Confirm whether the events listing page renders in a plain `fetch()` (static HTML) or
   requires JavaScript execution (use `PlaywrightCrawler` if JS is required).
5. Record all findings in the connector source file header before opening a PR.

**Permitted data from venue HTML scraping:**

- Event title
- Start time and end time (where visible in the HTML)
- Venue name (typically the site being scraped)
- External URL to the specific event page
- Ticket URL (where present)
- Price information (where present in the HTML)
- Image URL (where present and if venue ToS does not prohibit display)

**Prohibited:**

- Full event descriptions or promotional copy.
- Binary image caching.
- Scraping any path explicitly disallowed by `robots.txt`.
- Building a connector for a venue whose ToS prohibits automated access.

**Cloudflare-protected venues:** see §3 below.

---

### Manual and Community Submissions

Events submitted via the public submission form are stored as `source_type = 'manual'`
rows with `visibility = 'pending'` and `needs_review = true`. They are not published
automatically.

| Item | Policy |
|---|---|
| Storage | Full submission data stored in `external_events` and normalised into `events` with `visibility = 'pending'`. |
| Moderation | A human moderator must review and approve before `visibility` is set to `'published'`. |
| Content | The contributor's own words are stored. No link-first restriction applies to community-submitted content — it is original to the submitter. |
| Attribution | The submission is attributed to the community source, not to an external platform. |

---

## 3. Cloudflare and Anti-Scraping Policy

**Cloudflare-protected pages may not be bypassed without explicit operator agreement.**

Using Crawlee's `PlaywrightCrawler`, rotating proxies, or any other technique to bypass
Cloudflare bot detection or similar anti-scraping measures is prohibited unless the site
operator has explicitly agreed in writing that automated access is permitted.

If a target venue's events page is behind Cloudflare or returns bot-detection responses:

1. Do not attempt to bypass it.
2. Check whether the venue publishes an RSS or iCal feed (preferred alternative).
3. Contact the venue to request a data feed or explicit scraping permission.
4. If no alternative exists and no permission is granted, document the venue as
   unscrapeable and do not build a connector for it.

This applies to all connector types. Apify actors running on Apify's infrastructure are
subject to the same rule — even if the Apify actor technically bypasses Cloudflare,
doing so without operator agreement violates the platform's principles and likely the
venue's ToS.

The rationale is in ADR 0003: Clyde Culture is a community non-profit and relies on
goodwill from venues and platforms. Aggressive scraping or bot-detection evasion risks
those relationships.

---

## 4. Procedure for Adding a New Source

Follow these steps in order before writing any connector code or enabling a source.

1. **Identify the source type.** API / RSS / iCal / HTML / Apify. Apply the earliest
   option in the preference order: API → RSS/iCal → JSON-LD → static HTML (Crawlee) →
   Playwright (Crawlee) → Apify actor. See `docs/CONNECTOR_GUIDE.md` §1.

2. **Locate and read the source's ToS or API Terms.** For APIs: check the developer
   portal terms. For websites: check the site's terms of service and `robots.txt`.
   For Apify actors: check both the Apify actor's documented source and the upstream
   platform's ToS.

3. **Check whether a connector SPEC.md or pre-flight document already exists.** If it
   does, read it before writing any code. It may contain field mapping decisions,
   known ToS constraints, or explicit gates.

4. **Document the permitted fields, prohibited fields, and attribution requirements.**
   Record these findings:
   - In the connector's source file header (for HTML and Apify connectors, as required
     by the pre-flight checklist in `docs/CONNECTOR_GUIDE.md` §8).
   - In a new SPEC.md file inside the connector directory (for API connectors).
   - Or as a new ADR in `docs/decisions/` if the decision affects multiple connectors
     or sets a cross-cutting policy.

5. **Record the review outcome before writing production code.** If the source is
   permitted: document what is stored and what is not. If gated: document what approval
   or research is needed. If prohibited: close the task and document why.

6. **Only then enable the source in the database.** Add a migration or seed row to
   `supabase/migrations/` that inserts the `sources` row with `enabled = false`.
   Set `enabled = true` only via a follow-up migration after the connector is tested.

---

## 5. Deferred and Blocked Sources

The following sources cannot be enabled until the listed prerequisites are completed.
Do not build connectors or enable database rows for these sources until the block is
resolved.

| Source | Status | What is needed |
|---|---|---|
| Skiddle | **Blocked** | Written approval from Skiddle required (API-03). Do not build until received. |
| DICE.fm | **Deferred** | CC-NEW-2 pre-flight must be completed: actor schema verification and ToS confirmation. |
| Eventbrite (Apify) | **Gated** | `docs/connectors/eventbrite/COMPLIANCE.md` must be written and reviewed before implementation. |
| Instagram | **Prohibited** | ToS prohibits scraping. Structure is unstable. Do not build. |
| Resident Advisor | **Link-only** | No API. May be added as a link-out source only — do not store descriptions or images. |
| WhatsOnGlasgow | **Avoid** | Scraping risk; duplicates API sources. Do not build. |

---

## Per-Source Policy Summary Table

| Source | Type | Tier | Permitted data | Prohibited | Status | Attribution required |
|---|---|---|---|---|---|---|
| Ticketmaster | API | 1 | Title, times, venue, URL, price, availability, image CDN URL | Binary image caching, descriptions, display without attribution | Built; disabled pending live key | "Buy on Ticketmaster" label adjacent to listings and images |
| Skiddle | API | 1 | TBD (pending approval) | All until written approval received | **Blocked: API-03** | TBD |
| Data Thistle | API | 1 | Title, times, venue name, event-attached place id, URL, booking link, GBP price summary, tags/categories (staging only) | Descriptions, images/hotlinking, rich place data, ticket copy, **all public display** | **Staging-only: production licence-gated** (SPEC.md §14.2) | Logo + link + update routes required before display; wording TBD |
| Eventbrite (Apify) | Apify | 2 | TBD (pending compliance review) | Full descriptions, binary images, unapproved fields | **Gated: COMPLIANCE.md required** | TBD |
| DICE.fm | Apify | 2–3 | TBD (pending CC-NEW-2) | All until CC-NEW-2 complete | **Deferred: CC-NEW-2** | TBD |
| SWG3 (HTML) | HTML | 3 | Title, times, URL, venue, price, image URL | Full descriptions, disallowed paths, Cloudflare bypass | Pre-flight required | None specified |
| Mono (HTML + iCal) | HTML/iCal | 3 | Title, times, URL, venue, price | Full descriptions, Cloudflare bypass | Pre-flight required | None specified |
| St Luke's (HTML) | HTML | 3 | Title, times, URL, venue, price | Full descriptions, Cloudflare bypass | Pre-flight required | None specified |
| The Flying Duck (HTML + iCal) | HTML/iCal | 3 | Title, times, URL, venue, price | Full descriptions, Cloudflare bypass | Pre-flight required | None specified |
| Venue iCal/RSS feeds | iCal/RSS | 2 | Title, times, URL, short summary (if ToS permits) | Full article body, binary images | Pre-flight recommended | None typically required |
| Community submissions | Manual | — | Submitter's own content | — | Live (moderation required) | Attributed to submitter |
| Instagram | — | — | — | Everything | **Prohibited: ToS** | — |
| Resident Advisor | — | — | Link only | Descriptions, images | **Link-only** | — |
| WhatsOnGlasgow | — | — | — | — | **Avoid: duplicates API sources** | — |
