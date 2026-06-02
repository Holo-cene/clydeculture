# Festival Detection and Tagging

Festivals are first-class entities in Clyde Culture. Rather than treating a Celtic
Connections gig as just another live music listing, the platform recognises festival
membership explicitly: each festival has its own row in the `festivals` table, and every
event that belongs to it carries a `festival_id` foreign key and an `is_festival_event`
boolean. This allows the frontend to render festival banners on individual event listings,
aggregate events onto dedicated festival pages, and filter the calendar by festival — all
driven by the same structured data, with no separate editorial process.

## The `festivals` Table

The `festivals` table is a reference table, not a content publisher. Each row records the
festival's name, slug, website, a short description, an optional `banner_image_url`, and
crucially a `start_date` and `end_date`. The date window is the foundation of reliable
tagging: it is the guard against false positives, not an optional refinement.

Fields used downstream:

- `start_date` / `end_date` — the inclusive date range of the festival edition
- `slug` — matched against source URLs during detection
- `banner_image_url` — surfaced on event cards and the festival page

A new edition of a recurring festival (Celtic Connections 2027, for example) is a new
row, not an update to the existing one. This preserves historical event associations.

## Detection Rules

Festival membership is determined automatically during the normalisation step, after a
canonical event record has been created but before it is marked ready for publishing.
The detector runs each candidate festival in turn. An event is tagged when any of the
following conditions is true:

**1. Source domain match.** If the connector's configured domain matches a known festival
domain (e.g. `celticconnections.com`, `glasgowcomedyfestival.com`), every event ingested
from that connector is a festival event. This is the highest-confidence signal and
requires no further heuristics.

**2. Title contains the festival name.** A case-insensitive substring check against the
event's normalised title. "Glasgow Comedy Festival: An Evening with…" matches; a generic
title does not. Normalisation strips punctuation and excess whitespace before comparison
to reduce missed matches.

**3. Source URL contains a known festival slug.** The `external_url` from the
`external_events` record is checked for the festival's slug (e.g. `/glasgow-film-festival/`,
`/tectonics/`). This catches events scraped from a venue's own site when the venue is
hosting a specific programme for the festival.

**4. Manual mapping table.** A curated table links specific `(source_id, external_id)`
pairs to a `festival_id`. This handles edge cases: events where the title is ambiguous,
events that originate from a general-purpose API like Ticketmaster but are genuinely part
of a festival programme, or corrections applied after the automated rules misfire.

The rules are evaluated in priority order. Domain match is applied first; if it fires,
the other rules are skipped. Manual mappings are applied last and override any automated
result.

## Date-Window Validation

Before a festival tag is committed, the system validates that the event's `start_at`
falls within the festival's `[start_date, end_date]` window (inclusive). This step is
mandatory for the title and URL slug rules, which would otherwise fire on year-round use
of a festival's name or marketing copy.

For example, Glasgow Film Festival runs for roughly two weeks in February. A Ticketmaster
event titled "Glasgow Film Festival Shorts Programme" with a date in October would match
the title rule but fail the window check and remain untagged. Similarly, a venue page
that retains festival-branded URLs from a previous year would not produce false tags for
future events scraped from the same URL patterns.

Domain-match events are also subject to window validation. If a festival connector is
left enabled outside its active season — which should not happen in normal operation but
can occur if a connector is not disabled promptly — events ingested outside the window
are held without a `festival_id` and flagged for review rather than tagged automatically.

Events that fail the window check are not discarded. They are stored as ordinary events,
with `festival_id` null and `is_festival_event` false. An alert is logged so the
condition can be investigated manually.

## Attaching `festival_id` and Setting `is_festival_event`

When all conditions are met — a detection rule fires and the date falls inside the window
— the normalisation pipeline writes `festival_id` (the UUID of the matching festival row)
to the canonical event record and sets `is_festival_event = true`. Both fields are set
atomically in the same upsert; `is_festival_event` is a generated or derived boolean
rather than independently managed state, so there is no risk of them diverging.

If no festival match is found, both fields remain null / false. No default is applied.

## Festival Pages

Festival pages on the frontend are not manually authored. They are populated directly
from the `festivals` table (name, description, dates, banner image) combined with a
filtered query on `events` where `festival_id` matches and `visibility = 'published'`.
Adding a new festival row and tagging events to it is sufficient to trigger the data.
⚠ **ADR 0001**: on the coded-frontend path, no additional deployment is needed; on the
Webflow path, a sync job run is required to push the new festival record to the Webflow CMS.

The "active now" state — whether a festival banner is shown in site-wide navigation —
is derived from the `start_date` and `end_date` fields at query time.

## Named Festivals

The following festivals are recognised as first-class entities in the initial platform:

- **Celtic Connections** — January; folk, roots, and world music; one of Europe's largest
  winter music festivals, centred on the Glasgow Royal Concert Hall and surrounding venues.
- **Glasgow Comedy Festival** — March; stand-up, sketch, and spoken word; city-wide venue
  programme.
- **Glasgow Film Festival** — February; international cinema; centred on the GFT and
  partner venues.
- **Glasgow International** — April (biennial); contemporary visual art; gallery and
  non-gallery spaces across the city.
- **Tectonics** — May; contemporary and experimental music; programmed by the BBC Scottish
  Symphony Orchestra.

Additional festivals are added by inserting a row into the `festivals` table and
configuring the relevant detection signals (domain, slug, or manual mapping). No code
change is required for a festival that can be detected by domain or URL slug alone.
