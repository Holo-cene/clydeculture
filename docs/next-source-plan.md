# Next Source Fixture Plan

> **Superseded as the live plan by [ADR 0008](decisions/0008-tracer-bullet-delivery.md)
> and the GitHub issue tracker.** The active source-priority ordering and per-source
> preflights are now tracked as issues (RSS preflight + connector: #29; DICE.fm Apify
> preflight: #9; iCal: archived as DESIGN-DOC at
> [`archive/migrated/phase-0.5/E5-ical-parser-preflight.md`](tasks/archive/migrated/phase-0.5/E5-ical-parser-preflight.md);
> HTML: archived as DESIGN-DOC at
> [`archive/migrated/phase-0.5/E7-html-scraper-preflight.md`](tasks/archive/migrated/phase-0.5/E7-html-scraper-preflight.md)).
> This document is retained as reference for the source-comparison analysis it carries.
>
> Planning document only. No connector code, tests, fixtures, database rows, or live
> ingestion are included here.

---

## 1. Introduction

The Ticketmaster connector is the first proven end-to-end path in this repository:
parser tests pass, the fixture E2E path has been proven against local Supabase, and the
connector is structurally complete. The source row exists with `enabled = false` pending
a live API key and sweep validation.

The question this document answers is: **what comes next?**

The answer should minimise legal and technical risk while expanding coverage. RSS and
iCal connector families are the natural next step: they are structurally simple, rely on
intentionally published data feeds, carry minimal ToS friction, and produce stable,
reusable connector patterns. HTML scraping and Apify-based sources come later, after
per-source pre-flight work.

---

## 2. Current Proof State

| Proof point | Status |
|---|---|
| Ticketmaster parser tests (`parse.test.ts`) | Passing |
| Ticketmaster connector contract tests (`connector.test.ts`) | Passing |
| Ticketmaster fixture E2E path (local Supabase) | Proven |
| Ticketmaster source row (`sources` table) | Exists — `enabled = false` |
| Live Ticketmaster ingestion | Not enabled — API key not provisioned |
| Trigger.dev sweep schedule | Not registered |

The fixture E2E test (`ticketmaster-fixture-e2e.integration.test.ts`) demonstrates the
complete path: fixture-derived `RawEvent` → `upsertExternalEvents` → `external_events`
row → `normaliseExternalEventsForSource` → canonical `events` row → `getPublishedEvents`
via the anon key. This pattern is the template for all future fixture E2E tests.

---

## 3. Source-Policy Gate Summary

Derived from `docs/source-policy.md` and task documents.

| Source | Status | Reason |
|---|---|---|
| Ticketmaster | Ready (disabled) | Connector built; source disabled pending live API key. ADR 0004 accepted for image handling. |
| Skiddle | **Blocked** | Non-compete and commercial use clauses in API ToS require written approval from `dev@skiddle.com` before any connector code is written. See API-03. |
| Eventbrite via Apify | **Gated** | `docs/connectors/eventbrite/COMPLIANCE.md` must be written and reviewed before implementation. Eventbrite's public search API was deprecated in 2019; Apify actor is a web scrape with higher ToS risk than a direct API. |
| DICE.fm | **Deferred** | CC-NEW-2 pre-flight must complete: Apify actor discovery, output schema mapping, ToS and robots.txt verification. No code before CC-NEW-2 is done. |
| Venue RSS/iCal | **Ready to plan** | Low ToS risk. Venues publish feeds intentionally. No pre-flight checklist needed for iCal (it is a data feed, not a page scrape). Per-venue confirmation of feed URL and any usage restrictions recommended before enabling. |
| Venue HTML | **Pre-flight required** | robots.txt, ToS, JSON-LD check, and static/JS rendering check required per venue before writing any code. See `docs/CONNECTOR_GUIDE.md` §8. |
| Meetup | **Requires terms review** | No source policy entry exists. API key required. Mentioned in SPEC as an API source but no pre-flight document or ToS review recorded. |
| Instagram | **Prohibited** | ToS prohibits scraping. Structure is unstable. |
| Resident Advisor | **Link-only** | No API. May be a link-out source only. No descriptions or images may be stored. |
| WhatsOnGlasgow | **Avoid** | Scraping risk; duplicates API sources. |
| Community submissions | Live | Already in production with `visibility = 'pending'` and moderation gate. |

---

## 4. Candidate Assessment

| Candidate | Type | Tier | Policy risk | Technical complexity | Coverage value | Fixture availability | Status | Prerequisites |
|---|---|:---:|---|---|---|---|---|---|
| Generic iCal connector | iCal | 2 | Low | Low | High | Easy (synthetic RFC 5545) | Ready to plan | Confirm `ical` dependency (e.g. `ical.js` or `node-ical`) not yet in connectors package |
| Generic RSS connector | RSS | 2 | Low | Low | High | Easy (synthetic Atom/RSS 2.0) | Ready to plan | `rss-parser` documented in CONNECTOR_GUIDE; confirm installed in connectors package |
| Meetup API | API | 1 | Requires review | Low–Medium | Medium | Medium (API key needed for capture; synthetic feasible) | Requires terms review | ToS and non-compete review; API key for smoke test; `docs/connectors/meetup/COMPLIANCE.md` |
| Glasgow Life / council feeds | RSS/iCal | 2 | Low (if public) | Low | Medium | Easy if feed URL is public | Requires terms review | Confirm feed URLs are publicly documented; check usage terms on glasgow.gov.uk |
| SWG3 HTML | HTML | 3 | Medium | Medium | Medium | Hard (live capture; layout may change) | Pre-flight required | robots.txt, ToS, JSON-LD check, static/JS test — all required before any code |
| Mono HTML/iCal | HTML/iCal | 3 | Medium | Medium | Medium | Medium (iCal path preferred if available) | Pre-flight required | Same as SWG3; iCal sub-path should be explored first |
| St Luke's HTML | HTML | 3 | Medium | Medium | Medium | Hard | Pre-flight required | Same as SWG3 |
| Flying Duck HTML/iCal | HTML/iCal | 3 | Medium | Medium | Low–Medium | Medium (iCal path preferred if available) | Pre-flight required | Same as SWG3; iCal sub-path should be explored first |
| Eventbrite via Apify | Apify | 2 | High | Medium | High | Unknown | **Gated** | `docs/connectors/eventbrite/COMPLIANCE.md` written and reviewed |
| DICE.fm via Apify | Apify | 2–3 | Medium–High | Medium | High | Unknown | **Deferred** | CC-NEW-2 pre-flight complete |
| Skiddle API | API | 1 | **Blocked** | Low | High | Easy once approved | **Blocked** | Written approval from `dev@skiddle.com`; ADR update; API-03 |
| Resident Advisor link-only | Link-only | — | Low | N/A | Low | N/A | **Link-only** | Decision to add as link-out source only; no content ingestion |
| Instagram | — | — | **Prohibited** | — | — | — | **Prohibited** | Do not build |

---

## 5. Recommended Next Connector Fixtures

### 1. Generic iCal connector

**Source type:** iCal (Tier 2)

**Why this is the right next step:**

iCal is the preferred source type after direct APIs (per ADR 0003's preference order:
API → RSS/iCal → JSON-LD → HTML → Apify). Venues publish `.ics` feeds specifically to
share event data — this is intentional, structured data export, not scraping. iCal UIDs
are defined to be globally unique and stable, giving every `RawEvent` a reliable
`externalId` without any hashing or fragile content-derived identifiers. The generic
connector can be instantiated with any feed URL, making it reusable for Mono, The Flying
Duck, and any other venue that publishes an iCal link. No pre-flight checklist (beyond
confirming the feed URL is publicly documented) is required — unlike HTML connectors.

The connector stubs at `packages/connectors/src/ical/` are already in place (`.gitkeep`
only). The pattern maps cleanly onto the Ticketmaster fixture proof: write a parser
against a synthetic fixture, prove the fixture E2E path, then enable only after source
confirmation.

**Fixture data needed:**

A minimal synthetic `.ics` file containing 2–3 `VEVENT` records with:
- `UID` (globally unique, stable)
- `DTSTART` with timezone (TZID parameter or UTC Z suffix)
- `DTEND` (optional but desirable)
- `SUMMARY` (event title)
- `URL` (required — link-first)
- `LOCATION` (venue name, optional)

Synthetic is preferred because a captured real feed would contain live event data that
goes stale. The fixture should include: a UTC-timestamped event, a timezone-local event
(e.g. `TZID=Europe/London`), and an all-day event (`DTSTART;VALUE=DATE:20260801`) to
prove date-only handling.

**Synthetic vs captured fixture:** Synthetic — an iCal fixture can be hand-authored in
10 lines of RFC 5545 without capturing live data. This makes the test hermetic and
future-proof.

**Fields to map into `RawEvent`:**

| iCal field | RawEvent field | Notes |
|---|---|---|
| `UID` | `externalId` | Stable by spec; use as-is |
| `URL` | `externalUrl` | Required; skip if absent |
| `SUMMARY` | `title` | Required |
| `DTSTART` | `startAt` | ISO 8601; handle TZID parameter |
| `DTEND` | `endAt` | ISO 8601; optional |
| `LOCATION` | `venueName` | Optional |
| Full VEVENT object | `raw` | Required |

`doorsAt`, `priceMinGuess`, `priceMaxGuess`, `isFreeGuess`, `ticketUrlGuess`,
`imageUrlGuess`, and `availabilityGuess` are not standard iCal fields and should be left
absent unless the specific venue feed encodes them in `X-` extension properties. Do not
invent values.

**Link-first restrictions:**

- `externalUrl` is required. Skip `VEVENT` records with no `URL` property and push a
  descriptive error.
- Do not store `DESCRIPTION` content unless the specific venue's ToS is reviewed and
  permits it. Leave `description` absent from `RawEvent` (there is no `description`
  field in the interface by design).
- Do not download or cache images. If a venue feed includes an image URL in `X-IMAGE`
  or similar, only store the URL string in `imageUrlGuess` — never download binaries.

**High-level test plan:**

1. **Parser red test** (`packages/connectors/src/ical/parse.test.ts` or
   `packages/connectors/src/ical/generic/parse.test.ts`)
   - Write tests against the synthetic fixture before implementing the parser.
   - Cover: UTC event, timezone-local event, all-day event, missing URL (skip + error),
     missing UID (hash fallback), title trimming, `endAt` absent when `DTEND` missing.
   - Assert link-first: no `description` field set.
   - Assert `externalId` is stable across two parses of the same fixture.

2. **Connector contract test** (`packages/connectors/src/ical/generic/connector.test.ts`)
   - Mock the HTTP fetch for the `.ics` feed URL.
   - Assert `run()` returns `IngestResult` with correct counts.
   - Assert `run()` does not throw on network error (returns error in `IngestResult.errors`).
   - Assert `slug` and `type` match the registered source.

3. **Fixture E2E test** (following the Prompt 04/05 pattern)
   - Place in `packages/core/src/normalise/ical-fixture-e2e.integration.test.ts`.
   - Use a test-specific source UUID in the `00000000-e2e0-*` namespace.
   - Prove: fixture-derived `RawEvent` → `upsertExternalEvents` → `external_events` row
     → `normaliseExternalEventsForSource` → canonical `events` row → `getPublishedEvents`
     via anon key.
   - Assert `description` is null in the canonical event (link-first compliance).

**Prerequisites:**

- Confirm the iCal parsing dependency to use (e.g. `node-ical` or `ical.js`). Ask
  before adding — no new dependencies without approval (CLAUDE.md).
- Confirm synthetic fixture format is valid RFC 5545 (validate with an online parser
  before committing).
- No live source feed URL needed for the parser or contract tests.

**Suggested next prompt filename:** `docs/prompts/11-ical-connector-fixture.md`

---

### 2. Generic RSS/Atom connector

**Source type:** RSS (Tier 2)

**Why this is the right next step:**

RSS is the other preferred Tier 2 source type and is structurally equivalent in risk
profile to iCal. `CONNECTOR_GUIDE.md` §6 already contains a complete worked example
for a Substack RSS feed (the Glasgow Art Map connector), including the `rss-parser`
dependency, GUID fallback, and the link-first handling for newsletter sources. That
example serves as the direct template for a generic connector.

The distinction between **venue RSS** (structured event listings with `startDate` or
`dc:date` fields) and **newsletter RSS** (Substack-style posts where `pubDate` is the
post date, not an event date) must be handled by the connector. The generic RSS
connector should expose a `feedType` config option to signal which behaviour applies.

**Fixture data needed:**

Two synthetic fixtures:

1. **Venue RSS fixture** — a minimal RSS 2.0 or Atom feed with 2–3 items, each
   including: `<guid>` (stable), `<link>` (HTTPS), `<title>`, `<pubDate>` or
   `<startDate>` as event start, optional `<description>` (short, for testing
   truncation), optional `<enclosure>` or media image URL.

2. **Newsletter RSS fixture** — a minimal RSS 2.0 feed where `<pubDate>` is the
   publication date of the newsletter post (not an event date). Tests must assert that
   `startAt` is **not** set from `pubDate` for newsletter sources, per
   `docs/source-policy.md` §2 (RSS).

Synthetic is preferred for the same reasons as iCal: hermetic, reproducible, no
live data staleness.

**Synthetic vs captured fixture:** Synthetic — RSS 2.0 is simple XML and can be
hand-authored for the fixture.

**Fields to map into `RawEvent`:**

| RSS field | RawEvent field | Notes |
|---|---|---|
| `guid` | `externalId` | Fall back to `sha256(link \| title)` if absent |
| `link` | `externalUrl` | Required; skip if absent |
| `title` | `title` | Required |
| `pubDate` / `startDate` / `dc:date` | `startAt` | ISO 8601; only for venue RSS, not newsletter RSS |
| `enclosure` / media URL | `imageUrlGuess` | URL only — store if present; never download |
| Full item object | `raw` | Required |

Do not store `description` or `content:encoded`. Leave `startAt` absent for newsletter
sources; the normalisation pipeline will route low-confidence items to moderation.

**Link-first restrictions:**

- `externalUrl` from `<link>` is required. Skip items with no link.
- Do not store `<description>` or `<content:encoded>`. These are content fields, not
  metadata. Even where ToS might permit it, link-first means the `externalUrl` is
  canonical.
- Newsletter `<pubDate>` must not be stored as `startAt`.

**High-level test plan:**

1. **Parser red test** (`packages/connectors/src/rss/parse.test.ts` or
   `packages/connectors/src/rss/generic/parse.test.ts`)
   - Cover: item with GUID, item without GUID (hash fallback), item without link (skip),
     venue source (pubDate → startAt), newsletter source (pubDate not → startAt), image
     URL from enclosure, description not set.
   - Assert `externalId` is stable across two parses of the same fixture.

2. **Connector contract test** (`packages/connectors/src/rss/generic/connector.test.ts`)
   - Mock the HTTP fetch for the feed URL.
   - Assert `run()` returns `IngestResult` with correct counts.
   - Assert `run()` does not throw on network error.
   - Assert `slug` and `type` match the source.

3. **Fixture E2E test** (following the Prompt 04/05 pattern)
   - Place in `packages/core/src/normalise/rss-fixture-e2e.integration.test.ts`.
   - Use a test-specific source UUID in the `00000000-e2e0-*` namespace.
   - Prove fixture-derived `RawEvent` → canonical `events` → anon query path.
   - Assert `description` is null (link-first compliance).

**Prerequisites:**

- Confirm `rss-parser` is installed in `packages/connectors` (`CONNECTOR_GUIDE.md` §6
  shows the install command; verify before adding again).
- No live feed URL needed for parser or contract tests.

**Suggested next prompt filename:** `docs/prompts/12-rss-connector-fixture.md`

---

### 3. Meetup API fixture (conditional)

**Source type:** API (Tier 1) — conditional on terms review

**Why this is a conditional third:**

Meetup is mentioned in `docs/reference/SPEC.md` as one of the planned API source types
alongside Ticketmaster and Skiddle, and covers community events — meetups, workshops,
skill-sharing sessions — that neither Ticketmaster nor venue HTML scrapers reach well.
It has a stub directory at `packages/connectors/src/api/meetup/`. However, no source
policy entry exists for Meetup in `docs/source-policy.md`, and no pre-flight or terms
review has been recorded.

This is **conditional**: the Meetup connector should not be started until a terms review
is complete and documented. If Meetup's API ToS is clear and permissive (API key
required, standard attribution, no non-compete clause), it becomes a clean next API
connector following the Ticketmaster pattern. If the terms are restrictive, it is
gated or blocked.

**Prerequisite before starting:**
- Read Meetup's API terms at `meetup.com/api/terms/`.
- Document findings in `packages/connectors/src/api/meetup/SPEC.md` (or an ADR if
  a cross-cutting policy decision is needed).
- Only then write tests and implementation.

**Fixture data needed (if unblocked):**

A synthetic JSON response from the Meetup API (GraphQL or REST, depending on current
API shape) with 2–3 event records. Capture a real sample during terms review to confirm
the actual field names.

**Suggested next prompt filename:** `docs/prompts/13-meetup-api-preflight.md`

---

## 6. Generic Fixture-First Connector Pattern

Every new connector must follow this sequence. Passing a frontend demo is not evidence
that ingestion works — only a complete fixture E2E test against Supabase proves the
full path.

### Step-by-step

1. **Source policy check.**
   Read `docs/source-policy.md`. If the source is listed as Blocked, Deferred, Gated,
   or Prohibited, stop. Do not write any code until the block is resolved. If the source
   is not listed at all, treat it as `Requires terms review` and complete step 2 first.

2. **Terms review and documentation.**
   Read the source's ToS or API terms. For HTML/Apify connectors, also check
   `robots.txt`. Document findings in a `SPEC.md` or `COMPLIANCE.md` in the connector
   directory. Record: permitted fields, prohibited fields, attribution requirements, rate
   limits. Update `docs/source-policy.md` with the new source entry.

3. **Fixture acquisition or creation.**
   Synthetic fixtures are preferred for parsers: they are hermetic, version-controlled,
   and do not require live credentials or network access in tests. For API connectors,
   capture a real response sample to confirm field names before writing synthetic
   fixtures. Store fixture files in `packages/connectors/src/{type}/{slug}/fixtures/`.

4. **Parser red test.**
   Write the parser test first. Import the fixture. Assert the exact `RawEvent` output
   for known fixture inputs. Assert `externalUrl` is HTTPS. Assert `externalId` is
   stable across two calls. Assert no `description` field is set (link-first). Assert
   records with no URL are skipped and produce an error. **Do not write the parser yet.**
   Confirm the test file compiles but the assertions fail.

5. **Small parser implementation.**
   Write the minimum production code needed to pass the parser tests. Avoid opportunistic
   refactors. The parser is a pure function (no I/O, no Supabase). Run the parser test.
   Report results.

6. **Connector contract test.**
   Write a test for the `Connector` interface: mock the upstream fetch, call `run()`,
   assert `IngestResult` shape, correct counts, no throw on error. Assert `slug` and
   `type` match the expected source registration values.

7. **`RawEvent` shape validation.**
   Assert that items produced by `run()` contain only the 17 known `RawEvent` keys. Use
   the same approach as the Ticketmaster connector test (check for unknown keys). This
   enforces link-first by catching any accidental `description` or `summary` field.

8. **External event upsert test.**
   Write an integration test that calls `upsertExternalEvents` with fixture-derived
   inputs against local Supabase. Assert the `external_events` row is written with
   `event_id = null` (pre-normalisation). This is step 2 in the fixture E2E pattern.

9. **Optional: full fixture E2E test.**
   Following the Ticketmaster `ticketmaster-fixture-e2e.integration.test.ts` pattern:
   insert a test source row and test venue row, call `normaliseExternalEventsForSource`,
   assert the canonical `events` row exists with correct `source_url`, `visibility`,
   and `description = null`, then assert the event appears via `getPublishedEvents` with
   the anon key. Use a test-specific UUID in the `00000000-e2e0-*` namespace to avoid
   conflicts with demo seed data.

10. **Source row and enablement.**
    Only after all tests pass: add a migration in `supabase/migrations/` that inserts a
    `sources` row with `enabled = false`. Set `enabled = true` only via a subsequent
    migration after the connector is confirmed working end-to-end.

11. **Live smoke test.**
    Only after source policy, API key/credentials, and source config are all confirmed:
    run a live smoke test from `scratch/` (gitignored). Check `parsedCount > 0`,
    `errors` is empty or expected, `externalId` is stable, `externalUrl` opens in a
    browser. Only then open a PR and consider enabling the source in staging.

### What does NOT prove ingestion

- Passing Vitest unit tests proves the parser is correct against the fixture.
- Passing the Astro frontend demo proves the frontend can render demo seed data.
- A green CI run proves typecheck and lint pass.
- **None of these prove that live ingestion works end-to-end.** Only steps 8–11 (upsert
  test, fixture E2E, live smoke test) prove the full path.

---

## 7. Blocked and Deferred Sources

### Skiddle

**Status:** Blocked.

**Blocker:** Skiddle's API terms include a non-compete clause and restrict commercial
use. Written approval from `dev@skiddle.com` is required before any connector code is
written. See API-03 for context and the draft approval email template.

**What would unblock it:** Written confirmation from Skiddle that (a) Clyde Culture's
non-profit community discovery use is approved, and (b) the non-compete clause does not
apply. This confirmation must be recorded in `docs/decisions/0004-skiddle-api-approval.md`
with status changed from `pending` to `accepted`.

**Suitable for future fixture work:** Yes — once written approval is received, the
Skiddle connector follows the same API connector pattern as Ticketmaster. The API terms
(rate limits, attribution, link constraints) should be documented in
`packages/connectors/src/api/skiddle/SPEC.md` (stub exists per API-03).

---

### Eventbrite via Apify

**Status:** Gated.

**Blocker:** Eventbrite's public location-based event search API was deprecated in 2019.
The Apify connector would scrape the Eventbrite web interface — this carries higher ToS
risk than a direct API call. `docs/connectors/eventbrite/COMPLIANCE.md` must be written
and reviewed before any implementation begins. This file does not yet exist.

**What would unblock it:** Write and review `docs/connectors/eventbrite/COMPLIANCE.md`,
documenting Eventbrite's ToS position on third-party automated access, what data fields
are permitted (title, times, venue, URL, price range), and what must be omitted (full
descriptions, binary images). The compliance review must explicitly address the
"scraping-not-API" nature of the Apify connector.

**Suitable for future fixture work:** Yes — the stub at
`packages/connectors/src/apify/eventbrite/` is in place. Once compliance is confirmed,
the Apify connector pattern (trigger actor → poll → fetch dataset → map to `RawEvent[]`)
is straightforward.

---

### DICE.fm

**Status:** Deferred.

**Blocker:** CC-NEW-2 pre-flight must be completed before any code is written. CC-NEW-2
requires: finding a suitable Apify actor on the Apify Store, verifying its output schema
maps to `RawEvent`, confirming ToS and `robots.txt` status, and producing
`packages/connectors/src/apify/dice/SPEC.md`. Until CC-NEW-2 is done, no connector
code, no test, no fixture.

**What would unblock it:** Completing CC-NEW-2 and having `packages/connectors/src/apify/dice/SPEC.md`
reviewed and accepted. The SPEC must confirm: actor ID and pinned version, field
mapping, location filtering approach, ToS status with source quote, `robots.txt` excerpt,
and the proposed `sources` row SQL.

**Suitable for future fixture work:** Yes — DICE.fm has strong Glasgow underground and
club coverage that no other current source provides. It is a high-value deferred source,
not a permanently blocked one.

---

### Instagram

**Status:** Prohibited.

**Blocker:** Instagram's ToS explicitly prohibits scraping. The page structure is
unstable and changes frequently. Even if a scraper worked today, it would break silently
and could not be maintained reliably.

**What would unblock it:** Nothing — this is a permanent policy decision, not a
temporary gate. Do not build.

**Suitable for future fixture work:** No.

---

### Resident Advisor (full content ingestion)

**Status:** Link-only. Full content ingestion prohibited.

**Blocker:** Resident Advisor has no public API. Their terms of service prohibit
reproduction of event descriptions and images. The platform is designed to be linked to,
not scraped.

**What would unblock full ingestion:** A formal data partnership agreement with Resident
Advisor granting permission to store event descriptions and images. This is unlikely
given their business model.

**Suitable as a link-out source:** Potentially — Resident Advisor could be added as a
curated link-out source where only the `externalUrl` is stored, with no title, date, or
venue data scraped. This would require defining the link-out source type in the platform
model. No connector code should be written until this model is defined.

---

### Cloudflare-protected HTML sources

**Status:** Blocked without operator agreement.

**Blocker:** Bypassing Cloudflare bot detection or similar anti-scraping measures is
prohibited unless the site operator has explicitly agreed in writing to permit automated
access. This applies even if an Apify actor or Crawlee `PlaywrightCrawler` could
technically bypass the protection. See `docs/source-policy.md` §3.

**What would unblock it:** Written operator agreement that automated access is permitted.
Alternatively: the venue may publish an RSS or iCal feed that does not require bypassing
any protection — this is always the preferred path.

**Suitable for future fixture work:** Only after written operator confirmation. Before
starting any HTML connector for a venue, check whether the events page is Cloudflare-
protected using a plain `curl` or `fetch()` request. If it returns a bot-detection
challenge page, do not build the connector without operator agreement.

---

## 8. Suggested Next Prompt Files

| Priority | Prompt filename | Description |
|---|---|---|
| 1 | `docs/prompts/11-ical-connector-fixture.md` | Generic iCal connector: dependency decision, synthetic fixture, parser red test, connector contract test, fixture E2E |
| 2 | `docs/prompts/12-rss-connector-fixture.md` | Generic RSS connector: synthetic venue and newsletter fixtures, parser red test, feedType config, connector contract test, fixture E2E |
| 3 | `docs/prompts/13-meetup-api-preflight.md` | Meetup API pre-flight: ToS review, SPEC.md stub, field mapping, fixture capture, gate decision — no implementation |
| 4 | `docs/prompts/14-venue-html-preflight.md` | Venue HTML pre-flight: robots.txt, ToS, JSON-LD check, static/JS test for SWG3 (or Mono/Flying Duck) — no implementation |
| — | issue #9 (archived [`CC-NEW-2.md`](tasks/archive/migrated/top-level/CC-NEW-2.md)) | DICE.fm Apify pre-flight (already written; needs execution) |
| — | archived [`API-03.md`](tasks/archive/superseded/top-level/API-03.md) | Skiddle written approval (preflight; no active issue until approval lands) |

---

## Appendix: Connector Stub Inventory

As of 2026-06-08, the connector package contains the following stubs and implementations.

**Implemented (index.ts present):**

```
packages/connectors/src/api/ticketmaster/   — full implementation with parse, fetch, tests, fixture
packages/connectors/src/index.ts            — package export index
packages/connectors/src/connector.ts        — Connector interface and RawEvent type
packages/connectors/src/validate.ts         — isValidHttpsUrl, validateIngestResult
packages/connectors/src/connector.test.ts   — connector interface tests
```

**Stub directories (.gitkeep only — no implementation):**

```
packages/connectors/src/api/skiddle/        — Blocked (API-03)
packages/connectors/src/api/meetup/         — Requires terms review
packages/connectors/src/rss/               — Ready to plan (generic RSS)
packages/connectors/src/ical/              — Ready to plan (generic iCal)
packages/connectors/src/html/flying-duck/  — Pre-flight required
packages/connectors/src/html/mono/         — Pre-flight required
packages/connectors/src/html/st-lukes/     — Pre-flight required
packages/connectors/src/html/swg3/         — Pre-flight required
packages/connectors/src/apify/eventbrite/  — Gated (COMPLIANCE.md)
packages/connectors/src/apify/dice/        — Deferred (CC-NEW-2)
```
