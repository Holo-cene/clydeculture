# DOC-01: Create per-source fixture files

**Priority:** P2  
**Area:** Docs  
**Status:** Open  
**Depends on:** —

## Why this matters

No example API responses, RSS payloads, iCal events, or HTML fragments exist in the
codebase. An agent building any connector must either fetch live data (requires
credentials not yet set up) or invent a plausible payload structure. Invented structures
diverge from real APIs in subtle ways — wrong field names, wrong nesting, missing required
fields — and the connector will fail against the real API on first run.

A `docs/fixtures/` directory gives every connector session a concrete starting point.
It also makes it possible to write unit tests against realistic data without live
credentials, directly supporting BE-18 (connector test infrastructure).

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md` (especially section 3,
the `RawEvent` interface, and section 6, the RSS worked example), `docs/reference/SPEC.md`
section 6 (source landscape), and `packages/connectors/src/connector.ts` before
proceeding.

Your task is to create a `docs/fixtures/` directory with representative payload examples
for each source type used in Phase 1. These must be realistic but illustrative — match
the documented field names and nesting of the real APIs as closely as possible, but do
not copy real event data. Construct plausible fictitious Glasgow events.

**Step 1 — Create `docs/fixtures/README.md`:**

Explain that this directory contains representative payload samples for each source type.
Each fixture shows what a connector receives from its upstream source and what `RawEvent`
it should produce. Use these fixtures when building connectors (to confirm field names
before credentials are available) and when writing unit tests (import as test data instead
of making live API calls).

**Step 2 — Create `docs/fixtures/api/ticketmaster-event.json`:**

A realistic single Ticketmaster Discovery API event response for a Glasgow live music
venue. Must include all fields a connector author needs to implement the mapping:

```json
{
  "_note": "Representative Ticketmaster Discovery API event response. Illustrative only.",
  "id": "vvG1zZ4M8rKb",
  "name": "Mogwai",
  "type": "event",
  "url": "https://www.ticketmaster.co.uk/event/vvG1zZ4M8rKb",
  "dates": {
    "start": {
      "localDate": "2026-10-03",
      "localTime": "20:00:00",
      "dateTime": "2026-10-03T19:00:00Z"
    },
    "doorsTimes": {
      "localDate": "2026-10-03",
      "localTime": "19:00:00",
      "dateTime": "2026-10-03T18:00:00Z"
    },
    "status": {
      "code": "onsale"
    },
    "timezone": "Europe/London"
  },
  "priceRanges": [
    {
      "type": "standard",
      "currency": "GBP",
      "min": 18.50,
      "max": 18.50
    }
  ],
  "images": [
    {
      "ratio": "16_9",
      "url": "https://s1.ticketm.net/dam/a/example.jpg",
      "width": 2048,
      "height": 1152,
      "fallback": false
    }
  ],
  "classifications": [
    {
      "primary": true,
      "segment": { "id": "KZFzniwnSyZfZ7v7nJ", "name": "Music" },
      "genre": { "id": "KnvZfZ7vAvt", "name": "Alternative" }
    }
  ],
  "_embedded": {
    "venues": [
      {
        "name": "Barrowland Ballroom",
        "city": { "name": "Glasgow" },
        "country": { "countryCode": "GB" },
        "address": { "line1": "244 Gallowgate" },
        "postalCode": "G4 0TT",
        "location": { "longitude": "-4.2384", "latitude": "55.8561" }
      }
    ],
    "attractions": [
      {
        "name": "Mogwai",
        "id": "K8vZ9171oAV"
      }
    ]
  }
}
```

After the JSON, add a sibling file `docs/fixtures/api/ticketmaster-event.expected.json`
showing the `RawEvent` this fixture should produce:

```json
{
  "_note": "Expected RawEvent output from the ticketmaster-event.json fixture.",
  "externalId": "vvG1zZ4M8rKb",
  "externalUrl": "https://www.ticketmaster.co.uk/event/vvG1zZ4M8rKb",
  "title": "Mogwai",
  "startAt": "2026-10-03T19:00:00Z",
  "doorsAt": "2026-10-03T18:00:00Z",
  "venueName": "Barrowland Balloom",
  "eventTypeGuess": "KZFzniwnSyZfZ7v7nJ",
  "priceMinGuess": 18.50,
  "priceMaxGuess": 18.50,
  "isFreeGuess": false,
  "ticketUrlGuess": "https://www.ticketmaster.co.uk/event/vvG1zZ4M8rKb",
  "ticketUrlLabelGuess": "Book from Ticketmaster",
  "imageUrlGuess": "https://s1.ticketm.net/dam/a/example.jpg",
  "availabilityGuess": "onsale"
}
```

**Step 3 — Create `docs/fixtures/api/skiddle-event.json`:**

A realistic Skiddle API event for a Glasgow club night. Include:
`id`, `eventname`, `link`, `date`, `starttime`, `openingtimes.doorsopen`,
`venue.name`, `venue.town`, `EventCode` (e.g. `"CLUB"`),
`min_entry_price` (as a string, e.g. `"5.00"`), `sold_out` (boolean), `cancelled` (boolean).

Add a sibling `.expected.json` showing the `RawEvent` mapping. Note in the expected file:
`availabilityGuess` should be `"sold_out"` when `sold_out=true`, `"cancelled"` when
`cancelled=true`, `"available"` otherwise. `isFreeGuess` is true when
`min_entry_price == "0.00"`.

**Step 4 — Create `docs/fixtures/rss/substack-item.xml`:**

A realistic Substack RSS `<item>` for the Glasgow Art Map newsletter. Include:
`<title>`, `<link>`, `<guid>`, `<pubDate>` (the newsletter publication date),
and a `<description>` mentioning several upcoming events in prose
(demonstrating that the publication date is NOT any event's start date).

At the top of the file, add an XML comment:
```xml
<!--
  IMPORTANT: pubDate is the newsletter publication date, not an event date.
  startAt MUST be undefined for Type B (newsletter) RSS sources.
  See docs/RSS_SOURCE_POLICY.md.
  externalId: item.guid (or sha256(link|title) if guid absent)
  externalUrl: item.link
  title: item.title
  startAt: undefined
-->
```

**Step 5 — Create `docs/fixtures/ical/venue-event.ics`:**

A realistic iCal VEVENT from a Glasgow venue. Include:
`BEGIN:VCALENDAR`, `PRODID`, `VERSION:2.0`, `BEGIN:VEVENT`,
`UID` (globally unique identifier), `SUMMARY`, `DTSTART;TZID=Europe/London`,
`DTEND;TZID=Europe/London`, `URL`, `LOCATION`, `END:VEVENT`, `END:VCALENDAR`.

At the top of the file, add a comment block:
```
; Mapping:
; UID         → externalId
; SUMMARY     → title
; DTSTART     → startAt (parse to ISO 8601 UTC, respect TZID)
; DTEND       → endAt
; URL         → externalUrl (required — skip event if absent)
; LOCATION    → venueName
;
; NOTE: DTSTART without TZID is a "floating" time in local wall-clock.
; Treat floating times as Europe/London unless the context makes UTC obvious.
; See API-04 for RRULE (recurring event) handling.
```

**Step 6 — Create `docs/fixtures/html/swg3-event-block.html`:**

A realistic HTML fragment representing a single event listing as rendered on the SWG3
events page. Create a self-contained snippet (not a full page) showing a typical
event card with:
- A container `div` with a class like `event-card`
- An `<a>` element wrapping the card (or containing the title) with `href` pointing to
  the event detail page
- A title element (e.g. `<h3 class="event-title">`)
- A date element (e.g. `<time class="event-date" datetime="2026-10-10">`)
- A short support line (e.g. `<p class="event-support">`)

After the HTML, add a comment block:
```html
<!--
  CSS selector mapping for SWG3 HTML connector:
    event cards:  .event-card
    title:        .event-card .event-title  (text content)
    externalUrl:  .event-card a[href]        (href attribute)
    startAt:      .event-card time[datetime] (datetime attribute, parse as Europe/London)
    support:      .event-card .event-support (text content → tagsGuess or omit)

  externalId: sha256(venueName | startDate | title.toLowerCase().trim())
  Run robots.txt check before building: https://swg3.tv/robots.txt
  Confirm static render (no JS required): curl -s https://swg3.tv/events | grep 'event-title'
-->
```

---

## Acceptance criteria

- [ ] `docs/fixtures/README.md` explains purpose and format
- [ ] `docs/fixtures/api/ticketmaster-event.json` exists with all required fields including `priceRanges`, `dates.doorsTimes`, `classifications`, `_embedded.venues`, `dates.status`
- [ ] `docs/fixtures/api/ticketmaster-event.expected.json` shows the mapped `RawEvent`
- [ ] `docs/fixtures/api/skiddle-event.json` exists with `EventCode`, `min_entry_price`, `sold_out`, `cancelled`
- [ ] `docs/fixtures/api/skiddle-event.expected.json` shows the mapped `RawEvent` including availability logic
- [ ] `docs/fixtures/rss/substack-item.xml` exists with the `pubDate ≠ event date` warning comment
- [ ] `docs/fixtures/ical/venue-event.ics` exists with `TZID=Europe/London` and the mapping comment
- [ ] `docs/fixtures/html/swg3-event-block.html` exists with CSS selector annotations
- [ ] No live API calls are made; all data is illustrative and fictitious
