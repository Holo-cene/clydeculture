# Ticketmaster Connector — Pre-flight Specification

E1 pre-flight completed 2026-06-07. This document answers the six research questions from
`docs/tasks/phase-0.5/E1-ticketmaster-preflight.md` and serves as the implementation contract
for the Wave 5 Ticketmaster connector.

---

## 1. Glasgow Geo-Filter

**Endpoint:**
```
GET https://app.ticketmaster.com/discovery/v2/events.json
```

**Glasgow query parameters:**

| Parameter | Value | Notes |
|---|---|---|
| `apikey` | `{TICKETMASTER_API_KEY}` | Supabase Vault — never in sources.config |
| `latlong` | `55.8642,-4.2518` | Glasgow city centre (George Square area) |
| `radius` | `10` | 10 km from city centre |
| `unit` | `km` | Kilometres — not miles |
| `countryCode` | `GB` | Prevents edge-case results from overlapping Northern Ireland/Ireland at radius edge |
| `startDateTime` | `{windowStart}T00:00:00Z` | Rolling 14-day window — see §3 |
| `endDateTime` | `{windowEnd}T23:59:59Z` | |
| `size` | `200` | API maximum page size |
| `page` | `0` | Zero-indexed |
| `sort` | `date,asc` | Deterministic ordering for pagination |
| `locale` | `*` | Accept all locales |

**Geo-filter choice — `latlong` not `geoPoint`:**

The Discovery API accepts both `geoPoint` (a geohash string) and `latlong` (a
`"lat,lng"` decimal string). `latlong` is used for Phase 1:

- `latlong` is a plain decimal string — no encoding step, no silent encoding errors
- `geoPoint` requires geohash encoding (Glasgow centre ≈ `gcwvk` at 5 chars ≈ 5 km
  precision box, but the box boundaries do not align with the 10 km radius)
- `countryCode=GB` is an independent second filter providing defence-in-depth

Both are supported by Discovery API v2. Switch to `geoPoint` only if `latlong` proves
unreliable in production (e.g. incorrect results at the boundary).

**Full example URL (API key placeholder):**
```
https://app.ticketmaster.com/discovery/v2/events.json
  ?apikey=REDACTED
  &latlong=55.8642,-4.2518
  &radius=10
  &unit=km
  &countryCode=GB
  &startDateTime=2026-07-01T00:00:00Z
  &endDateTime=2026-07-14T23:59:59Z
  &size=200
  &page=0
  &sort=date,asc
  &locale=*
```

---

## 2. Deep Paging Cap and Rolling Window Strategy

The Discovery API enforces a hard limit: `size × page < 1000`. Results beyond
position 1,000 are silently truncated — the connector will appear healthy while
missing events at the tail of a large result set.

**Phase 1 strategy — 14-day rolling windows:**

Query 60 days forward, split into five 14-day windows. Each window is independently
paged from `page=0`. The 1,000-result cap resets per window.

```
Window 0: today        → today + 13
Window 1: today + 14   → today + 27
Window 2: today + 28   → today + 41
Window 3: today + 42   → today + 55
Window 4: today + 56   → today + 69
```

**Truncation sentinel:** if the final page of any window returns exactly `size` (200)
results, log a non-fatal warning to `IngestResult.errors`:
```
Non-fatal: window {start}–{end} final page returned 200 results; results may be
truncated. Consider narrowing to 7-day sub-windows for this date range.
```

Do not use `size > 200` — the API maximum is 200.

---

## 3. Daily Quota Model

| Limit | Value |
|---|---|
| Daily quota | 5,000 calls |
| Per-second limit | 5 requests/second |

**Worst-case Phase 1 daily call count:**

| Scenario | Windows | Pages/window | Total calls/day |
|---|---|---|---|
| Off-peak (< 200 events/window) | 5 | 1 | 5 |
| Moderate (200–1,000 events/window) | 5 | 5 | 25 |
| Festival peak (Celtic Connections, TRNSMT) | 5 | 10 | 50 |

At worst-case peak, 50 calls/day = 1% of the 5,000 daily quota. Quota is not a
Phase 1 blocker.

**Rate limiting in the connector:** add a 250 ms `await sleep(250)` between page
requests. At 10 pages × 250 ms = 2.5 seconds per window, a full 5-window sweep
completes in under 15 seconds — well within the Trigger.dev task timeout.

---

## 4. RawEvent Field Mapping

The 17-field `RawEvent` contract is from `docs/tasks/phase-0.5/B4-raw-event-contract.md`
and `packages/connectors/src/connector.ts`.

| RawEvent field | Ticketmaster JSON path | Nullable/notes |
|---|---|---|
| `externalId` | `event.id` | Required; stable numeric string |
| `externalUrl` | `event.url` | Required; HTTPS ticketmaster.co.uk/com |
| `title` | `event.name` | Required; strip whitespace, truncate at 500 chars |
| `startAt` | `event.dates.start.dateTime` → UTC | **Fallback required** — see below |
| `endAt` | `event.dates.end?.dateTime` | Often absent; do not infer |
| `doorsAt` | `event.dates.doorOpenTime` | Absent for many events; validate ISO 8601 |
| `venueName` | `event._embedded?.venues?.[0]?.name` | Absent if venue not embedded |
| `eventTypeGuess` | `event.classifications?.[0]?.segment?.id` lowercased | Use `primary: true` entry; fallback `[0]` |
| `tagsGuess` | `[event.classifications?.[0]?.genre?.name]` | Genre name as a soft tag hint; may be "Undefined" |
| `priceMinGuess` | `event.priceRanges?.[0]?.min` | GBP; absence ≠ free |
| `priceMaxGuess` | `event.priceRanges?.[0]?.max` | |
| `isFreeGuess` | `priceRanges?.[0]?.min === 0` | Only `true` if explicitly zero; absent → `undefined` |
| `ticketUrlGuess` | `event.url` | Same as `externalUrl`; TM is both source and seller |
| `ticketUrlLabelGuess` | `"Buy on Ticketmaster"` | Hardcoded — satisfies attribution requirement |
| `imageUrlGuess` | Best from `event.images` — see §5 | HTTPS CDN URL; may be undefined |
| `availabilityGuess` | `event.dates.status.code` | `onsale` / `offsale` / `cancelled` / `postponed` / `rescheduled` |
| `raw` | Full `event` object | Always set |

### Missing, nullable, and ambiguous fields

**`startAt` fallback chain (in priority order):**

1. `event.dates.start.dateTime` — already UTC; use directly if present and `timeTBA = false`
2. `event.dates.start.localDate` + `event.dates.start.localTime` — combine and convert
   from Europe/London to UTC using the IANA timezone
3. `event.dates.start.localDate` only (when `timeTBA = true`) — set `startAt` to midnight
   of that date in Europe/London → UTC; the normaliser will set `time_tba = true`
4. No date at all (`dateTBA = true`) — skip the record; push a descriptive error to
   `IngestResult.errors`; do not emit a `RawEvent`

**Other ambiguous fields:**

- `endAt` (`dates.end.dateTime`): Absent for most concert and theatre listings. Do not infer.
- `doorsAt` (`dates.doorOpenTime`): Present for many music events; absent for comedy, theatre,
  film. Schema comment in `SCHEMA_v5.sql` calls this out for Ticketmaster specifically.
- `priceRanges`: Absent when pricing is not disclosed via the API. Absence does NOT mean
  free — set `isFreeGuess = undefined`, not `false`.
- `classifications`: May have multiple entries. Use the entry with `primary: true`. If none
  flagged primary, use `[0]`. The segment ID (not the segment name) is what maps to
  `source_type_category_map`.
- `_embedded.venues`: Usually embedded; can be absent for online-only or venue-TBD events.
  If absent, `venueName = undefined`.

---

## 5. Image Handling (C7 HTTPS Rule)

`event.images` is an array of:
```json
{ "ratio": "16_9", "url": "https://...", "width": 1024, "height": 576, "fallback": false }
```

**Selection algorithm:**
1. Filter to `ratio === "16_9"` AND `width >= 640`
2. Sort by `width` descending; take first
3. If none: filter to any entry with `width >= 640`, sort by width desc, take first
4. Validate result with `isValidHttpsUrl()` from `packages/connectors/src/validate.ts`
5. If validation fails or array is empty: `imageUrlGuess = undefined`

Ticketmaster serves images via their CDN (`https://s1.ticketimg.com/`) as absolute HTTPS
URLs. All valid TM image entries should pass `isValidHttpsUrl()`. The check still runs
because scraped or unexpected API fields can contain relative paths or malformed values.

**Display permissions:** The Ticketmaster API Terms of Use permit displaying event images
alongside event information when a link to the Ticketmaster event page is provided. Phase
1 stores only the URL (no binary download), which is within permitted use. Do not cache
image binaries. CDN URLs are stable within an event's lifecycle but may change across
sweeps — re-check on each ingest run.

---

## 6. Classification IDs and Category Mapping

The connector stores `event.classifications[0].segment.id` lowercased as `eventTypeGuess`.
The normalisation pipeline (Step 3) looks this up in `source_type_category_map`.

**Seeded mappings from B5 migration `20260606000000_source_category_map_seed.sql`:**

| Segment ID (lowercase as stored) | Segment name | `event_types.slug` |
|---|---|---|
| `kzfzniwnszyfz7v7nj` | Music | `live_music` |
| `knvzfz7vavf` | Undefined / Club | `club_night` |
| `kzfzniwnszyfz7v7ne` | Comedy | `comedy` |
| `kzfzniwnszyfz7v7nn` | Film | `film` |
| `kzfzniwnszyfz7v7na` | Arts & Theatre | `arts_exhibition` |

**Known gap — Theatre:** No confirmed Ticketmaster segment ID exists for theatre.
Theatre productions listed on Ticketmaster will appear under `arts_exhibition` (Arts &
Theatre segment) for Phase 1. Acceptable; refine post-launch when real data reveals the
genre breakdown.

**Verification needed — Comedy ID:** The comedy segment ID `kzfzniwnszyfz7v7ne` is
documented in BE-03 as "Comedy segment." This cannot be confirmed without a live API
response. **Validate this ID against a real API response before the first production
sweep.** If it maps to a different segment (e.g., Sports), the B5 seed migration and
this SPEC must be updated.

**Unmapped segments:** Sport, Family, Miscellaneous, and any future segments will fall
through to keyword matching (Step 3 fallback) or `other`. These are unlikely to dominate
Glasgow event results for Clyde Culture's cultural scope.

---

## 7. Source URL for Link-First Publishing

`externalUrl = event.url` — the ticketmaster.co.uk event page.

Ticketmaster is simultaneously the canonical source page and the ticket purchase endpoint.
Both `externalUrl` and `ticketUrlGuess` point to the same URL. The distinction is in
how the frontend renders them:

- `source_url` (from `externalUrl`) drives the link-first "View event" link
- `ticket_url` (from `ticketUrlGuess`) drives the "Buy tickets" CTA
- `ticket_url_label = "Buy on Ticketmaster"` — satisfies attribution and is clear to users

---

## 8. Attribution Requirements

From the Ticketmaster API Terms of Use (https://developer.ticketmaster.com/support/terms-of-use/):

> Applications must include a "Buy" button or equivalent linking to the Ticketmaster URL
> for all ticketed events listed. The Ticketmaster name and trademark must be displayed
> in association with any event listings sourced from the API.

Phase 1 compliance:

| Requirement | How satisfied |
|---|---|
| Link to Ticketmaster event page | `externalUrl = event.url` (always set) |
| Trademark display | `ticket_url_label = "Buy on Ticketmaster"` |
| No copying of descriptions | Link-first: no `summary` or `description` stored |
| No image binary storage | Store URL only; CDN serves at render time |

No additional badge, logo, or watermark is required beyond the labelled link back for Phase 1.
Review this if Clyde Culture gains significant traffic or Ticketmaster raises any concerns.

---

## 9. Remaining Risks and Blockers Before Fixture Parsing Red Test

| Risk | Severity | Resolution |
|---|---|---|
| No real API key — fixture is synthetic | Medium | Fixture is accurate to known API structure; unblocks test writing. Validate live before first production sweep. |
| Comedy segment ID (`kzfzniwnszyfz7v7ne`) unconfirmed | Low | Flag in test; verify with API Explorer or live key before first sweep |
| `timeTBA` fallback path — connector must handle gracefully | Medium | Contract defined above; implementation must cover the 4-step `startAt` fallback chain |
| `priceRanges` absent — must NOT infer free | Low | Documented; enforced in test fixture |
| `_embedded.venues` absent — must not throw | Low | Defensive optional chaining required |
| `countryCode=GB` + `latlong` combination | Low | Standard supported combination; verify response shape in API Explorer |
| CDN image URL TTL | Low | Acceptable for Phase 1; re-check on each sweep rather than caching |

**Nothing above blocks writing the fixture parsing red test.** The synthetic fixture covers
all the field paths the connector will parse; the test does not need a live API key.

---

## 10. Sources Row (for reference)

The B5 migration created a disabled stub sources row:

```sql
INSERT INTO sources (name, slug, source_type, tier, config, status, enabled)
VALUES ('Ticketmaster', 'ticketmaster', 'api', 1, '{}', 'ok', false);
```

`enabled = false` until E1 pre-flight is complete and the connector is implemented. The
connector implementation task (Wave 5) must:
1. Set `enabled = true` via a migration or seed update
2. Populate `config` with non-secret connector settings (e.g., `{"timezone": "Europe/London", "lookahead_days": 60}`)
3. Store the API key in Supabase Vault, not in `config`
