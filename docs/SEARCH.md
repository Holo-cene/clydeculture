# Search and Discovery (Target Design)

**Status: forward design (ADR 0005 Tranche C — defer; faceted/entity-led search is
built after the cultural-graph foundations).** This document describes where search is
heading so earlier schema decisions (tags, entities, places, source freshness) don't
foreclose it. It is **not** implemented. Current search is title-led: `pg_trgm` fuzzy
matching on `normalised_title` plus a separate venue pre-query (see
`packages/shared/src/db/publicQueries.ts`). Verify current behaviour against that file.

The goal is "easily searchable platform for all events in Glasgow". That means search
must become **faceted, entity-led, and temporal** — not just upcoming-by-title.

---

## Search must become entity-led

Users search across the whole cultural graph, not just event titles:

- title, venue, **organiser**, **artist/collective**, tag, type
- neighbourhood, date, price, accessibility, age, source

So search should index and match against venues, organisers/collectives
(`docs/ENTITIES.md`), tags, types, and places (`docs/DATA_MODEL.md`) — not titles alone.

---

## Discovery dimensions

Categories and tags alone are not enough for "easily searchable". Plan for soft
discovery dimensions (likely a structured/namespaced tag layer):

| Dimension | Examples |
|---|---|
| Mood | chilled, loud, experimental, social, family-friendly |
| Format | workshop, gig, screening, drop-in, market, performance |
| Cost | free, low-cost, premium, donation, PWYC |
| Scene | DIY, contemporary art, folk, club, comedy, community |
| Accessibility | step-free, seated, relaxed, BSL |
| Time | daytime, evening, late-night |
| Participation | watch, listen, make, learn, dance, volunteer |

---

## Temporal browsing modes

Search is not just "upcoming". Plan for time-shaped queries:

- tonight, tomorrow, this weekend, next weekend
- free this week, family-friendly this weekend
- exhibitions ending soon, gigs under £10
- markets near me, late-night events, daytime events
- recurring weekly activities
- "what's on in Southside this Saturday"

These depend on the temporal and place model behaving correctly: all-day, multi-day,
recurring, opening-hours-based, and performance-based events behave differently (see
`docs/DATA_MODEL.md` time/recurrence and ADR 0005 B1 work/occurrence). A long-running
exhibition must not appear as a fresh event every day; a club night crossing midnight
must resolve to the right "tonight".

---

## Example queries the model must serve

- "free this weekend" — price + date facets
- "markets near me" — type + neighbourhood (place) facets
- "exhibitions ending soon" — type + run-window (work/occurrence)
- "gigs under £10 in the West End" — type + price + neighbourhood
- "everything 432 Presents is doing" — organiser entity (`docs/ENTITIES.md`)

---

## Saved searches and alerts — DEFER

Following a venue/organiser, "email me free workshops in Southside", "new exhibitions
this month", weekly DIY digests — these are **deferred** (auth + email infrastructure)
but shape how tags, entities, places, and source freshness are stored now, so the data
is alert-ready later.

---

## Phasing

| Item | Phase |
|---|---|
| Discovery dimensions (namespaced tags) | design now; populate as tags land |
| Faceted, entity-led, temporal search | DEFER (Tranche C) |
| Saved searches / alerts / follow | DEFER |

Umbrella decision: [ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md).
