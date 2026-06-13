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

Festival membership is determined automatically during the normalisation step, after venue
resolution (Step 2) and before the canonical record is written to `events` (Step 8). See
[docs/NORMALISATION.md](NORMALISATION.md) for the full normalisation pipeline.
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

**4. Manual override table.** The `festival_event_overrides` table links specific
`(source_id, external_id)` pairs to a `festival_id`. This handles edge cases where
automated rules are insufficient: ambiguous titles, events that originate from a
general-purpose API like Ticketmaster but are genuinely part of a festival programme,
or corrections applied after the automated rules misfire. To add an override, insert
a row:

```sql
insert into festival_event_overrides (source_id, external_id, festival_id, note, created_by)
values (
  (select id from sources where slug = 'ticketmaster'),
  '12345678',
  (select id from festivals where slug = 'celtic-connections-2027'),
  'Part of CC programme; no festival signal in title',
  'jamie'
);
```

Manual overrides are applied first and bypass both the automated rules and the
date-window check below: the operator who created the row takes responsibility for
correctness. An override can attach a `festival_id` to an event no automated rule
would tag, or correct an event that an automated rule mis-tagged (by assigning a
different `festival_id`).

The remaining (automated) rules are evaluated in priority order. Domain match is
applied first; if it fires, the other rules are skipped.

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
with `festival_id` null and `is_festival_event` false. An `ingest_alerts` row is written
with `alert_type = 'festival_window_mismatch'` carrying the originating `source_id`, a
null `run_id` (window checks are not tied to a single ingest run), and a `message` of
the form:

```
Festival match 'celtic-connections-2027' for event <source_id>/<external_id> failed window check:
  event 2026-10-15 outside 2026-01-14–2026-02-04
```

The alert is resolved by either adding the event to `festival_event_overrides` (if the
event genuinely belongs to the festival) or confirming it is correctly untagged.

## Attaching `festival_id` and Setting `is_festival_event`

When all conditions are met — a detection rule fires and the date falls inside the window
— the normalisation pipeline writes `festival_id` (the UUID of the matching festival row)
to the canonical event record and sets `is_festival_event = true`. Both fields are set
atomically in the same upsert; `is_festival_event` is a generated or derived boolean
rather than independently managed state, so there is no risk of them diverging.

If no festival match is found, both fields remain null / false. No default is applied.

## Planned: festival → work/group → occurrence hierarchy (ADR 0005 B1)

> **Direction, not current state.** Today a festival is a flat grouping: events carry a
> `festival_id`. The cultural-graph model adds a parent-child **programme** hierarchy.

A festival is the top of a programme hierarchy, distinct from simple recurrence:

```
Festival / Programme           (Glasgow International, Celtic Connections)
  → Production / Work / Series  (an exhibition, a concert series, a touring show)
    → Occurrence                (a dated instance at a venue — an events row)
      → source links            (every way to read / book / RSVP)
```

This is **different from recurrence**: a monthly market is one work with recurring
occurrences; a festival is a programme containing many distinct works, each with its own
occurrences. The work/occurrence layer (ADR 0005 B1, `docs/prompts/21`) sits between the
festival and the occurrence so that, e.g., a Glasgow Film Festival screening is *an
occurrence of a film work, within the festival programme* — not a flat festival-tagged
row. `festival_id` continues to group; the work layer adds the missing middle. Build is
deferred until the work/occurrence model lands (see `docs/DATA_MODEL.md`).

## Festival Pages

Festival pages on the frontend are not manually authored. They are populated directly
from the `festivals` table (name, description, dates, banner image) combined with a
filtered query on `events` where `festival_id` matches and `visibility = 'published'`.
The Astro frontend (ADR 0001) reads Supabase directly — adding a new festival row and
tagging events to it is sufficient. No sync job or deployment step is required.

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
