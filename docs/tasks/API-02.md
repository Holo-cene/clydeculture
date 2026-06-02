# API-02: SPIKE — Verify Ticketmaster Glasgow geo filter and implement deep-paging guard

**Priority:** P1  
**Area:** Connectors  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

Two constraints in the Ticketmaster Discovery API are not addressed in the SPEC or
connector stubs and will cause silent data loss if not handled at build time:

1. **Geo filter format.** The SPEC notes "(lat/long + radius vs market/DMA)" as an open
   question for Glasgow filtering. DMA IDs are a US/North America concept and do not
   apply to Glasgow. The correct parameters are `geoPoint` (a geohash string) and
   `radius`/`unit`. The geohash encoding format must be confirmed before the connector
   is built — decimal lat/lng strings are not accepted.

2. **Deep paging cap.** The Discovery API enforces `size × page < 1000` — you cannot
   retrieve beyond the 1000th result. For Glasgow during festival season (Celtic
   Connections, TRNSMT), a single unbounded query could silently truncate results at
   1000 without any error, and the connector would appear healthy in break detection.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md`, `docs/INGESTION.md`,
and `CLAUDE.md` before proceeding.

You are writing the specification for the Ticketmaster connector and implementing
safeguards against two known API constraints. This task is documentation and a single
connector spec file — do not build the full connector yet.

**Step 1 — Verify Glasgow geo filter via the Ticketmaster API Explorer:**

Use the Ticketmaster API Explorer at `https://developer.ticketmaster.com/api-explorer/v2/`
to test a Glasgow event search. Specifically:
- Confirm the parameter name for geographic filtering (`geoPoint`, `latlong`, or similar)
- Confirm the expected format (geohash string vs `lat,lng` decimal string)
- Confirm whether `countryCode=GB` is also required alongside the geo parameter
- Confirm `radius` unit parameter (`miles` vs `km`)
- Record the working query parameters in the connector spec

Glasgow coordinates: latitude `55.8642`, longitude `-4.2518`.

**Step 2 — Write the Ticketmaster connector spec:**

Create `packages/connectors/src/api/ticketmaster/SPEC.md` (in the connector directory)
documenting:

1. The verified geo filter parameters and format
2. The 1000-result paging cap and the mitigation strategy:
   - Query in 14-day rolling windows rather than unbounded date ranges
   - Log a warning in `IngestResult.errors` (non-fatal) when the final page returns
     a full page of results, indicating a possible truncation
   - Do not use `size > 50` per page
3. The rate limits: 5000 calls/day, 5 req/sec
4. Attribution requirements from the Ticketmaster ToS
5. What to store vs. not store (title, start_at, venue_name, externalUrl, image_url
   as a URL pointer only — no description text, no image binaries)

**Step 3 — Update `docs/reference/SPEC.md`:**

In the Ticketmaster row of the Tier 1 table, update the Notes column to replace
"(lat/long + radius vs market/DMA)" (if present) with the confirmed geo filter approach.

---

## Acceptance criteria

- [ ] `packages/connectors/src/api/ticketmaster/SPEC.md` exists
- [ ] The spec documents the verified Glasgow geo filter parameters and format
- [ ] The spec documents the paging mitigation: 14-day rolling windows, page-size cap
- [ ] The spec documents rate limits and attribution requirements
- [ ] The spec documents what may and may not be stored from the API response
- [ ] `docs/reference/SPEC.md` Ticketmaster Notes column reflects the confirmed geo approach
