# Data Thistle Connector Specification

## 1. Purpose and Scope

Data Thistle is a **staging/internal structured source** for Clyde Culture. The
connector may fetch, parse, and stage minimal event metadata into Supabase
(`external_events`) for internal development: normalisation, category mapping,
deduplication, venue matching, and source-policy handling.

**Production public display remains licence-gated.** Data Thistle events must
not appear on the public frontend until the licence questions in §10/§11 are
resolved and `productionEnabled`/`allowPublicDisplay` are flipped in
`packages/shared/src/sourcePolicy.ts`. The policy module is the single
enforcement point; do not bypass it.

This document records the public API shape, the staging field contract, the
mapping strategy, licensing risks, and the criteria for production enablement.

### 1.1 Staging scope — allowed now

Minimal event metadata may be imported for staging/dev use:

- Data Thistle `event_id`, schedule `place_id`, and performance timestamp
  (composite external identity), plus performance-level identifiers if the API
  exposes them.
- Title.
- Start/end date-time (end only from structured duration).
- Venue name and event-attached place id (for venue matching only — no
  reusable venue enrichment).
- Broad category/subcategory/tag values, preserved as source text and mapped to
  Clyde Culture taxonomy as a guess.
- Structured GBP price/ticket summary (min/max/free).
- Booking link and source/website URL.
- Attribution fields where available (`attributionLabel` lives in source
  policy; exact wording still to be confirmed with Data Thistle).
- Event status (`live`/`deleted`) and sync timestamps in `raw`.

### 1.2 Still disallowed unless source policy is explicitly enabled

- Descriptions and long copy.
- Images, image URLs, image metadata, hotlinking, caching, or proxying.
- Rich venue/place descriptions and reusable place-data enrichment.
- Ticket description text.
- Public display of any Data Thistle-sourced record.

## 2. Repository/Source-Policy Context

Clyde Culture is link-first: it helps people discover events and routes them to
the original source. It is not a publisher and should not reproduce a source's
listing content where the source terms do not clearly allow that.

Relevant local constraints:

- Every future `RawEvent` must have a stable upstream `externalId`, an HTTPS
  `externalUrl`, a title, and the original raw payload for debugging.
- Source terms and attribution rules must be reviewed before production use.
- Tests for future parser work must be fixture-first and must not call the live
  API.
- Long descriptions, copied promotional copy, image URLs, image metadata, and
  rich venue/place content must be excluded unless licence terms explicitly
  permit storage and display.
- New source output constraints must be documented before enabling the source.
- Data Thistle categories/tags are mapped into Clyde Culture taxonomy as
  connector-level guesses (`packages/connectors/src/api/datathistle/categories.ts`);
  the canonical taxonomy enum itself is not changed by this source.

## 3. Relevant Data Thistle Documentation Reviewed

Public documentation reviewed:

- [API home / data dictionary](https://api.datathistle.com/)
- [OpenAPI spec](https://api.datathistle.com/openapi/openapi.yaml)
- [Code examples](https://api.datathistle.com/examples)
- [API terms](https://api.datathistle.com/terms)
- [General terms and conditions](https://www.datathistle.com/terms/)

Summary only:

- The API describes a hierarchy of events, schedules, places, and performances.
- Authentication is required for API calls, but this spike did not use a token.
- List endpoints are paginated and expose rate-limit headers.
- The API terms include cache/refresh, attribution, and Place Data restrictions
  that require written clarification before production use.
- The general terms reserve rights in Data Thistle content and require permitted
  reuse mechanisms to preserve attribution and links.

## 4. Relevant Endpoints

The public OpenAPI spec exposes these endpoints relevant to Clyde Culture:

| Endpoint | Method(s) | Relevance |
| --- | --- | --- |
| `/events` | `GET`, `POST` | Main discovery endpoint. Returns event records with nested schedules and performances. |
| `/event/{eventUuid}` | `GET`, `POST` | Single-event detail lookup. Useful for debugging or follow-up enrichment if terms allow. |
| `/places` | `GET`, `POST` | Venue/place discovery. High licence risk because Place Data has specific restrictions. |
| `/place/{placeUuid}` | `GET`, `POST` | Single-place detail lookup. Avoid production use until Place Data rules are confirmed. |
| `/search` | `GET`, `POST` | Search endpoint. Useful for manual exploration, less suitable as deterministic ingestion. |

Schedules and performances appear to be nested under event responses rather than
separate top-level public endpoints. I found no public top-level `/schedules`,
`/performances`, `/categories`, or `/tags` endpoint in the OpenAPI spec. Tags are
returned as arrays and can be used as filters on `/events`.

## 4.1 Authentication and Environment Configuration

The API requires `Authorization: Bearer <JWT>` on every request (401 when
missing or invalid). Connector configuration is env-driven; no credentials are
ever hardcoded or committed:

- `DATA_THISTLE_ACCESS_TOKEN` — JWT access token (required to run the
  connector).
- `DATA_THISTLE_REFRESH_TOKEN` — refresh token (optional).
- `DATA_THISTLE_API_BASE_URL` — defaults to `https://api.datathistle.com/v1`.
- `DATA_THISTLE_AUTH_BASE_URL` — base URL for token refresh. Expected value:
  `https://auth.datathistle.com/v1` (no default; refresh is disabled when
  unset).

Placeholders live in `.env.example`. Real values go in local `.env`, GitHub
Actions secrets, Trigger.dev/Supabase secret stores — never in committed files
or `sources.config`.

**Refresh contract (per the Data Thistle Auth API docs — the public OpenAPI
spec does not cover auth):**

```text
GET {DATA_THISTLE_AUTH_BASE_URL}/refresh
Authorization: Bearer <refresh token>

→ { "status": 200, "accessToken": "...", "refreshToken": "..." }
```

The client applies this at most once per request, on a 401. The response
issues **both** new tokens, and refresh tokens remain valid for roughly a
month, so token renewal is a recurring monthly operation. New tokens are held
in memory only for the rest of the run; the client surfaces a non-fatal
"refresh token rotated" note in `IngestResult.errors` (which lands in
`ingest_runs`), and the operator must copy the new tokens into the secret
store (local `.env`, GitHub Actions secret, or Trigger.dev/Supabase secret)
manually. The connector never writes secrets to disk and never logs token
values.

## 5. Glasgow Discovery Strategy

Supported query strategies from the OpenAPI spec:

- `town=Glasgow`: filters events by the `places.town` field.
- `lat`, `lon`, and `distance`: searches around a coordinate, with distance in
  miles. These must be supplied together.
- `min_date`: filters records with performances after an ISO-8601 datetime.
- `max_date`: filters records with performances before an ISO-8601 datetime.
- `since`: filters records modified since an ISO-8601 datetime.
- `status=live`: returns current records. `status=deleted` is also documented.
- `page` and `limit`: paginated list access. `limit` is documented with a maximum
  of 20.
- Pagination headers: `Link`, `X-Prev`, and `X-Next`.
- Rate-limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
  `X-RateLimit-Reset`.

Recommended initial production query shape, once licensing is cleared:

```text
/events
  ?town=Glasgow
  &min_date={windowStartIso}
  &max_date={windowEndIso}
  &status=live
  &order=ts
  &fields=event_id,name,status,schedules,tags,website,links,created_ts,modified_ts
  &page=1
  &limit=20
```

Follow `X-Next` or the standard `Link` header until exhausted. Do not use live
calls in automated tests.

**Verified against the live API (manual smoke run, 2026-06-11):**

- Responses are a bare JSON array of event objects.
- `X-Next` is an **absolute URL** for the next page (same params, `page+1`);
  `X-Prev` and a standard `Link` header (`rel="next"/"prev"`) are also sent.
  The staging connector's strategy — treat `X-Next` presence as "more pages
  exist" and increment its own `page` counter — is therefore equivalent and
  remains in place.
- `town=Glasgow`, `status=live`, `min_date`/`max_date`, `page`, and `limit`
  all behave as documented when combined; in the sampled window every returned
  performance timestamp fell inside the requested `min_date`/`max_date` range.
- `order=ts` and `fields=` projections are accepted (HTTP 200); both are
  currently unused by the staging connector.
- Performance timestamps are offset-qualified (`+00:00`), matching the
  parser's requirement.
- Rate limit observed: `X-RateLimit-Limit: 1000` per window.
- Upstream events DO carry `descriptions` and `images` keys (and ticket
  `description` strings); the parser emitted none of them — link-first
  stripping confirmed against real data.
- Most events have no HTTPS `website`, so `externalUrl` usually falls back to
  the typed booking link (~98% of sampled occurrences). The production
  user-facing-URL question in §14.2 stands.
- Additional upstream fields not consumed by the parser: event `sort_name`,
  `list_id`, `properties`; schedule `start_ts`, `end_ts`, `ticket_summary`,
  `performance_space`; place `address`, `lat`/`lng`/`lon`, `postal_code`
  (licence-sensitive — intentionally unused). Tag vocabulary includes values
  outside the current mapping (e.g. "days out", "history", "tribute",
  "conferences") which fall back safely to tag-only enrichment.

Use `town=Glasgow` first because it is explicit and avoids radius bleed. A later
manual comparison can check whether a Glasgow-centre radius search finds events
missed by town filtering, but a production connector should avoid combining town
and radius filters until their interaction is verified.

Incremental sync should use `since` with a bounded date window. Deleted/non-live
records may require a separate `status=deleted&since={lastSync}` pass, but this
needs confirmation because the OpenAPI documents event-level status more clearly
than performance-level cancellation.

## 6. Response-Shape Notes

### Safe to Map Now

These fields look like structured metadata and are candidates for a future
fixture-first parser, subject to final licence confirmation:

| Area | Documented shape | Future Clyde Culture use |
| --- | --- | --- |
| Event identifier | `event_id` UUID | Part of external identity and debug payload. |
| Event title | `name` | `RawEvent.title`. |
| Event status | `status` with `live` or `deleted` | `availabilityGuess` or source status hint. |
| Event timestamps | `created_ts`, `modified_ts` | Sync/debug fields in `raw`, not canonical event dates. |
| Tags/categories | `tags[]` | `eventTypeGuess`/`tagsGuess` after mapping review. |
| Event website | `website` | Possible source URL candidate only if user-facing and terms allow. |
| Event links | `links[]` | Link candidate, but shape is under-documented. |
| Schedule place id | `schedules[].place_id` | Part of external identity and venue matching. |
| Schedule place name | `schedules[].place.name` | `venueName`. |
| Schedule place town/postcode/address | `schedules[].place.*` | Licence-sensitive; use minimally until Place Data rules are confirmed. |
| Performance timestamp | `schedules[].performances[].ts` | `startAt`. |
| Performance time unknown text | `schedules[].performances[].time_unknown` | `timeTba` signal where present; do not publish the text without permission. |
| Performance duration | `schedules[].performances[].duration` | Possible `endAt` derivation only if numeric/structured and reviewed. |
| Performance links | `schedules[].performances[].links[]` with a link type | Booking link candidate when type indicates booking. |
| Ticket prices | `schedules[].performances[].tickets[].min_price`, `max_price`, `currency` | Price min/max/free candidates when currency is GBP and values are structured. |

### Licence-Dependent or Excluded for Now

These fields must not be stored or displayed by a production connector until
Data Thistle confirms the allowed use:

| Area | Documented shape | Conservative stance |
| --- | --- | --- |
| Descriptions | Event/place description arrays | Exclude. Do not store or display. |
| Images | Event/place image arrays | Exclude. Do not store image URLs or metadata. |
| Rich place details | `/places`, `/place/{placeUuid}`, embedded place address/location fields | Use only the minimum needed for event venue matching until Place Data terms are clear. |
| Ticket descriptions | Ticket description strings | Exclude because they can contain copy rather than structured price data. |
| Source/canonical URL | Event `website`, event/performance links, or possible Data Thistle public page | Unresolved. Future connector must identify the correct user-facing HTTPS URL for `externalUrl`. |

## 7. Event/Performance Model

Recommended Clyde Culture model:

- One Data Thistle performance should become one `RawEvent`.
- One Data Thistle event with multiple performances must produce multiple
  `RawEvent` items.
- Do not treat one Data Thistle event as one Clyde Culture event when it has many
  performances.

Rationale:

Data Thistle models an event as a top-level concept that can have one or more
schedules, and each schedule can have one or more performances. Clyde Culture's
canonical event model is occurrence-focused: venue, date/time, and title feed
deduplication and publishing. A many-performance Data Thistle event would be too
coarse as a single Clyde Culture event.

Edge cases:

- Recurring performances: emit one RawEvent per performance timestamp.
- Same event at multiple venues: emit one RawEvent per `event_id + place_id +
  performance timestamp`.
- Changed venue: the external identity changes because `place_id` changes. Keep
  the original `event_id` in `raw` so future sync logic can detect that the same
  upstream event moved.
- Changed performance time: the external identity changes because the timestamp
  changes. Future connector logic must rely on `since`, source status, and stale
  record handling to retire the previous occurrence.
- Cancelled/non-live performances: the OpenAPI clearly documents event-level
  `status`; performance-level cancellation is not clearly documented. Until
  clarified, only event-level `deleted` can be mapped confidently.
- Event-level update vs performance-level update: event-level metadata changes
  such as title/tags should update every emitted performance for that event;
  performance-level changes should affect only the relevant occurrence.

## 8. External Identity Recommendation

Recommended future external identity:

```text
event_id + place_id + performance timestamp
```

Example shape, without real IDs:

```text
datathistle:{event_id}:{place_id}:{performance_ts}
```

This is preferred over `event_id` alone because a Data Thistle event may contain
multiple schedules and performances. Using only `event_id` would collapse a run
of performances into one staged external event, causing data loss and incorrect
within-source deduplication.

If Data Thistle later exposes performance-level stable identifiers, prefer those
after confirming their stability. Until then, `event_id + place_id + timestamp`
is the best documented composite key.

## 9. Minimal Safe RawEvent Field Proposal

Initial safe field candidates for a future connector:

- `externalId`: composite Data Thistle identity from event, place, and
  performance timestamp.
- `externalUrl`: user-facing HTTPS source/canonical URL once confirmed.
- `title`: event name.
- `startAt`: performance timestamp converted/validated as ISO 8601.
- `endAt`: only where available or safely derived from structured duration.
- `venueName`: embedded schedule place name.
- `eventTypeGuess`: source category/tag only where mapping is clear.
- `tagsGuess`: source tags after filtering and mapping review.
- `priceMinGuess`, `priceMaxGuess`, `isFreeGuess`: structured GBP ticket values
  only; no ticket description text.
- `ticketUrlGuess`: booking link where a performance link is typed as booking.
- `ticketUrlLabelGuess`: wording to be decided after attribution confirmation.
- `availabilityGuess`: event status/live flag.
- `raw`: source-specific identifiers and minimal source payload needed for
  sync/debugging.

Explicitly excluded for now:

- Descriptions.
- Long copy.
- Image URLs.
- Image storage/display.
- Rich venue/place descriptions.
- Reused Place Data beyond minimal venue matching fields until licence terms are
  confirmed.

## 10. Licence Risk Register

| Area | Current understanding | Risk | Conservative Clyde Culture stance | Question for Data Thistle | Production decision needed |
| --- | --- | --- | --- | --- | --- |
| Descriptions | Event/place descriptions are documented and may be Data Thistle-authored or third-party supplied. | High copyright and database-rights risk. | Do not store or display descriptions. | Can descriptions be stored, excerpted, transformed, indexed, or displayed by Clyde Culture? | Written permission and exact limits. |
| Images | Event/place image arrays are documented. | High image rights and attribution risk. | Do not store image URLs, metadata, or display images. | Are image URLs and metadata licensed for third-party display? | Allowed fields and display rules. |
| Image hotlinking | Not clearly resolved in public docs. | Hotlinking may breach image or API terms. | Do not hotlink. | Is hotlinking from Data Thistle image URLs allowed? | Yes/no plus attribution requirements. |
| Image caching/proxying | API terms constrain caching; general terms reserve content rights. | Binary caching/proxying is likely unsafe. | Do not download, cache, proxy, resize, or transform images. | Is any image caching/proxying allowed? | Explicit written approval if ever needed. |
| Venue/place storage | API terms mention separate Place Data restrictions. | Persistent `venues` enrichment may compile Place Data. | Store only minimal event-attached venue name/id for matching until clarified. | May Clyde Culture store place IDs, names, addresses, postcodes, and coordinates? | Exact allowed place fields and retention limits. |
| Venue/place reuse | Place Data is described as for use with event listings. | Reusing venue records across sources may exceed permitted use. | Do not enrich reusable venue profiles from Data Thistle. | Can Data Thistle place data be reused for Clyde Culture venue records? | Clear reuse boundary. |
| Derived category mapping | Tags are documented as event categories. | Derived taxonomy may be considered a derived database. | Use tags only as mapping hints in tests until terms are clear. | Can Data Thistle tags be mapped into Clyde Culture taxonomy and stored? | Mapping/storage approval. |
| Caching duration | API terms constrain caching and require frequent refresh. | Clyde Culture's normal staged data may outlive the limit. | Do not persist live data until retention rules are confirmed. | What API data can be cached or retained, and for how long? | Retention policy compatible with Supabase. |
| 24-hour refresh/cache constraints | API terms require short cache duration and regular refresh. | Scheduled ingestion must meet refresh requirements and deletion handling. | No production connector until a compliant schedule is designed. | Does storing staged raw payloads count as caching under the 24-hour limit? | Architecture decision for raw payload retention. |
| Attribution wording | API terms require clear Data Thistle attribution. | Unclear wording could make frontend non-compliant. | Do not publish Data Thistle events yet. | What exact attribution text is required? | Frontend copy and field contract. |
| Logo placement | API terms mention logo use. | Logo display may be required; assets/placement unclear. | Do not publish until logo requirements are agreed. | Which logo asset, size, placement, and link target are required? | UI requirement and asset permission. |
| Link-back requirements | API terms require associated links and update/add-event routing. | Clyde Culture may need extra links beyond event source links. | Treat link-back behaviour as unresolved. | What links must appear beside each listing? | Required URL fields and UI placement. |
| Mixing with community and other sources | Public docs do not clearly address mixed-source products. | Data Thistle content may need distinct attribution or separation. | Keep Data Thistle source identity explicit; do not blend silently. | Can Data Thistle listings be displayed alongside community submissions and other source data? | Product/display approval. |
| Non-profit/community use and pricing | Public docs mention free/paid services and quotas, not Clyde Culture's use case. | Free/community use may not cover production aggregation. | Do not assume non-profit permission. | Is Clyde Culture's non-profit community use eligible for different terms/pricing? | Commercial/licence agreement. |

## 11. Attribution/Output Constraints

Documented facts from public terms, paraphrased:

- API access has quota and reasonable-use constraints.
- Programmatic repeated visits to URLs returned by the API are restricted.
- API content caching is limited and must be refreshed frequently.
- Place Data has special restrictions and is only described as usable in
  association with future event listings.
- Data Thistle attribution is required, including logo and associated link.
- Users must be directed through Data Thistle update/add-event routes.
- General terms reserve copyright/database rights in Data Thistle content and
  require permitted reuse to preserve attribution and links.

Unresolved assumptions:

- Exact listing-level attribution wording.
- Exact logo asset, placement, size, and link target.
- Whether Clyde Culture may use a compact text attribution instead of a logo.
- Whether `externalUrl` should be a Data Thistle public event page, event
  `website`, a booking link, or another URL.
- Whether the API's cache limits allow Supabase raw payload retention.
- Whether Data Thistle event/place tags can be stored as derived category data.
- Whether venue/place fields can be stored in reusable Clyde Culture venue
  records.

## 12. Taxonomy Mapping Recommendations

Data Thistle appears to expose broad `tags[]` rather than a fixed category enum.
Future mapping should be reviewed against real permitted tag values using
synthetic or approved fixture data.

Recommended first-pass mapping:

| Clyde Culture event type | Data Thistle tag hints to map |
| --- | --- |
| `live_music` | music, gigs, concerts, classical, jazz, folk, opera where music-led |
| `club_night` | clubbing, clubs, DJ, dance music, nightlife |
| `comedy` | comedy, stand-up |
| `theatre` | theatre, drama, musicals, opera where stage-led, performance |
| `arts_exhibition` | art, visual art, exhibitions, galleries, museums |
| `workshop` | workshops, classes, courses, learning |
| `talk_lecture` | talks, lectures, books, literature, spoken word, author events |
| `film` | film, cinema, screenings, event cinema |
| `family` | family, children, kids, schools-holiday programming |
| `sport` | sport, running, cycling, walks where sport-led |
| `community_meetup` | community, local groups, social events, heritage walks where community-led |
| `food_drink` | food, drink, markets, tasting, beer, wine |
| `other` | shopping, fairs, mixed-format events, unclear tags, anything unmapped |

Potential gaps:

- Festivals may need a festival grouping/subcategory rather than a top-level type.
- Dance, circus, cabaret, and performance art may need subcategories or better tag
  enrichment.
- Literature/books may fit `talk_lecture` initially but may deserve a subcategory.
- Heritage, tours, walks, and visitor attractions may not fit cleanly; many should
  remain tag-only enrichment.
- Markets, retail, and fairs may cross `community_meetup`, `food_drink`, and
  `other`.
- Opera and classical music may need source-specific rules to choose between
  `live_music` and `theatre`.

Do not change taxonomy code from this spike.

## 13. Fixture-First Feasibility Plan

The next spike should add synthetic/OpenAPI-shaped fixtures only. Do not use live
API calls in tests. Do not copy descriptions, image URLs, image metadata, or
marketing copy into fixtures.

Fixture cases:

- One event with one schedule and one performance.
- One event with one schedule and multiple performances.
- One event with missing structured price values.
- One event with missing venue fields.
- One deleted/non-live event if represented by the documented schema.
- One event with category/tag data.

Future parser tests should specify:

- Multiple performances produce multiple `RawEvent` items.
- Composite external IDs are stable.
- Required RawEvent fields are present.
- Descriptions and images are ignored.
- Missing price does not imply free.
- Missing venue fields do not crash parsing.
- Deleted/non-live status maps conservatively.

## 14. Acceptance Criteria

### 14.1 Staging connector criteria (required for internal ingestion)

- Allowed staging fields are documented (§1.1) and enforced by the parser.
- Fixture parser tests exist and no tests use live API calls.
- No descriptions, images, or rich place data are stored (§1.2).
- Each performance maps to one `RawEvent`.
- External identity is stable and composite (§8) for idempotent upserts.
- Category mapping is deterministic, reviewed, and preserves source tag text as
  mapping evidence.
- Every emitted `RawEvent` has a valid HTTPS `externalUrl`.
- Credentials come from env only; nothing secret is committed or logged.
- Rate-limit headers are respected and pagination is bounded.
- The `sources` row stays `enabled = false` until an operator enables staging
  ingestion deliberately, and `productionEnabled` stays `false` in source
  policy regardless.

### 14.2 Production display blockers (must be resolved before public use)

- Licence questions answered (descriptions, images, Place Data, caching).
- Exact attribution wording, logo asset/placement, and link-back requirements
  documented.
- Data Thistle confirms whether non-profit/community use affects terms/pricing.
- The production-safe user-facing `externalUrl` rule is confirmed.
- Supabase raw retention and deletion handling confirmed compatible with Data
  Thistle's cache/refresh requirements.
- `packages/shared/src/sourcePolicy.ts` flips `allowPublicDisplay` and
  `productionEnabled` to `true` in a reviewed change citing the written
  confirmation.

## 15. Parser Boundary Review

The fixture parser remains a non-connector feasibility artifact. It does not
fetch Data Thistle, read environment variables, expose an API client, write to
Supabase, register a connector, or alter ingestion orchestration.

## 16. Fixture Parser Findings

Added files:

- `packages/connectors/src/api/datathistle/parse.ts`
- `packages/connectors/src/api/datathistle/parse.test.ts`
- `packages/connectors/src/api/datathistle/fixtures/single-performance.json`
- `packages/connectors/src/api/datathistle/fixtures/multi-performance.json`
- `packages/connectors/src/api/datathistle/fixtures/missing-price.json`
- `packages/connectors/src/api/datathistle/fixtures/missing-venue-fields.json`
- `packages/connectors/src/api/datathistle/fixtures/non-live-status.json`
- `packages/connectors/src/api/datathistle/fixtures/categories-tags.json`

Fixture cases covered:

- One event with one schedule and one performance.
- One event with multiple performances.
- One event with multiple schedules/places.
- One event with missing structured price data.
- One event with missing optional venue fields.
- One deleted/non-live event.
- One event with category/tag data.

Fields successfully mapped in the feasibility parser:

- `title` from event `name`.
- `externalId` from the composite `datathistle:{event_id}:{place_id}:{performance_ts}`.
- `externalUrl` from an HTTPS event `website`, falling back to a clearly typed
  HTTPS performance booking link.
- `startAt` from performance `ts`, normalised to an offset-qualified UTC ISO
  string. Offset-less timestamps are skipped rather than normalised.
- `endAt` only where a structured numeric duration can be safely applied.
- `venueName` from embedded schedule place name.
- `eventTypeGuess` for a small local set of obvious tags.
- `tagsGuess` from fixture-safe source tags, preserving the source tag text.
- `priceMinGuess`, `priceMaxGuess`, and `isFreeGuess` from structured GBP ticket
  fields only.
- `ticketUrlGuess` from clearly typed HTTPS booking links.
- `availabilityGuess` from event status for emitted live records.
- Minimal `raw` context containing source, event id, place id, performance
  timestamp, status, and schedule/performance debugging context.

Fields intentionally omitted:

- Descriptions and long copy.
- Images, image URLs, and image metadata.
- Rich venue/place descriptions or reusable venue enrichment data.
- Ticket description text.
- Attribution/logo fields, because production attribution remains unresolved.

External URL behaviour:

- The parser emits an occurrence only when it can find a safe HTTPS `externalUrl`.
- Event `website` is preferred when present and HTTPS.
- A performance `booking` link may be used as a temporary fixture-spike fallback
  when no event website is present.
- If no safe HTTPS URL exists, the occurrence is skipped and a parser error is
  returned.
- The correct production `externalUrl` remains unresolved and is still a
  production blocker.

Status behaviour:

- `status = live` can emit `RawEvent` items when required fields are present.
- `status = deleted` or another non-live value is skipped conservatively with a
  parser error.
- Performance-level cancellation remains undocumented in the public shape and is
  still unresolved.

Category/tag mapping notes:

- The parser uses a small local helper only for fixture feasibility.
- Obvious tags such as `music`, `theatre`, `talks`, `workshops`, and `comedy`
  map to current Clyde Culture event type slugs.
- Unknown tags do not force a category; they remain as `tagsGuess` only.
- Mapping is case-insensitive, but emitted `tagsGuess` values preserve source
  tag text rather than over-normalising it.
- No global taxonomy code was changed.

Validation result:

- The Data Thistle parser tests assert emitted `RawEvent` items pass
  `validateIngestResult`.
- The targeted parser test run passed with 20 tests.

Remaining production blockers:

- Description permissions.
- Image display/hotlink/cache/proxy permissions.
- Place Data storage and reuse rules.
- Exact attribution wording, logo placement, and link-back requirements.
- Cache/refresh and raw payload retention compatibility.
- Pricing and non-profit/community-use terms.
- The production-safe source/canonical URL rule.

## 17. Verdict

Data Thistle is approved as a **staging/internal structured source**: the
connector may fetch, parse, and upsert minimal event metadata (§1.1) into
`external_events` for internal normalisation, mapping, dedupe, and venue
matching. Staging behaviour is gated by `allowStagingCollection` in
`packages/shared/src/sourcePolicy.ts`.

**Public display remains blocked** until Data Thistle confirms description,
image, place-data, attribution, caching, and pricing constraints (§14.2).
`productionEnabled = false` and `allowPublicDisplay = false` enforce this; the
publishing layer must never surface Data Thistle events while those flags are
false.
