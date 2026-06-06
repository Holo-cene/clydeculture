# DOC-03: Fix stale Eventbrite references in ARCHITECTURE.md

**Priority:** P3  
**Area:** Docs  
**Status:** Open  
**Depends on:** —

## Why this matters

`docs/ARCHITECTURE.md` traces the full data flow using "the Eventbrite connector" as
its worked example. `docs/reference/SPEC.md` marks Eventbrite as "Critical — do not
build" (public event search was removed December 2019). An agent reading ARCHITECTURE.md
as its onboarding document will conclude Eventbrite is a live Phase 1 source and may
begin building the connector or wiring up the Eventbrite API key.

The data flow example is also the canonical description of how a single event moves from
ingest to publication — it should use a live, confirmed connector as its subject.

---

## Prompt

You are building Clyde Culture. Read `docs/ARCHITECTURE.md` (the "Data flow" section)
and `docs/reference/SPEC.md` (Tier 1 source landscape, especially the Eventbrite row)
before proceeding. Make documentation changes only — no TypeScript source files or
migration files.

**Step 1 — Update the data flow trace in `docs/ARCHITECTURE.md`:**

In the numbered data flow, step 1 currently uses Eventbrite as the example connector.
Replace Eventbrite with Ticketmaster:

Replace (stale text currently in ARCHITECTURE.md — `packages/ingestion` is superseded by `trigger/`):
> `packages/ingestion schedules a run for the Eventbrite connector. The connector
> fetches events via the Eventbrite API, extracts externalId (Eventbrite event ID),
> externalUrl, title, start_at, and venue_name, and stores the full API response
> as raw JSON.`

With:
> `A Trigger.dev task schedules a run for the Ticketmaster connector. The connector
> fetches events via the Ticketmaster Discovery API, extracts externalId (Ticketmaster
> event ID), externalUrl, title, start_at, doors_at, and venue_name from the
> `_embedded.venues` array, and stores the full API response as raw JSON.`

**Step 2 — Update the Mermaid component diagram in `docs/ARCHITECTURE.md`:**

In the `upstream` subgraph, the Tier 1 node label currently reads:
```
"Tier 1 — APIs\nTicketmaster · Skiddle · Eventbrite\nBandsintown · Meetup"
```

Replace with:
```
"Tier 1 — APIs\nTicketmaster · Skiddle\nBandsintown · Meetup"
```

Eventbrite is not listed because its public search API is deprecated and no connector
will be built for it. It is tracked separately in API-01 (strategy spike for replacing
the grassroots coverage it was intended to provide).

---

## Acceptance criteria

- [ ] `docs/ARCHITECTURE.md` data flow step 1 references the Ticketmaster connector, not Eventbrite
- [ ] The step 1 description includes `doors_at` extraction (matching the v5 schema and BE-10)
- [ ] The Mermaid diagram Tier 1 label does not include Eventbrite
- [ ] No other files are modified
- [ ] No migration files or TypeScript source files are touched
