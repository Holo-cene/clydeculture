# Project overview

Clyde Culture is a low-maintenance cultural events index for Glasgow. It aggregates
"what's on" from multiple upstream sources — APIs, feeds, and scrapers — normalises
that data into a single canonical database, and links back out to the original source
for public discovery.

**What it is not.** Clyde Culture is not a publisher. It does not reproduce event
descriptions, images, or content in full. It stores a short summary at most, and always
links to the original source — a ticket page, a venue website, a promoter page. This
is the link-first principle and it is non-negotiable. The platform is a discovery and
routing layer. No language in the product ranks events; a free zine fair sits at the
same editorial weight as a ticketed opera.

It is run as a non-profit community collective. Membership revenue supports the platform
and funds local events.

Full specification: [docs/reference/SPEC.md](reference/SPEC.md). Authoritative schema:
[docs/reference/SCHEMA_v5.sql](reference/SCHEMA_v5.sql). Brand and voice:
[docs/BRAND_VOICE.md](BRAND_VOICE.md).

---

## Core principles

**Automation-first ingestion.** The platform ingests from four source types: REST APIs
(Ticketmaster, Skiddle, Eventbrite, Meetup), RSS/iCal feeds (venue calendars, Substack
newsletters), structured HTML scrapers (SWG3, Mono, St Luke's), and cultural directories
used as an enrichment layer. API and feed sources form the stable backbone; scrapers
supplement coverage but are treated as breakable.

**Low maintenance by design.** Stable external IDs are stored for incremental sync.
Every connector logs run metrics to `ingest_runs`. Break detection automatically flags
a connector when its parsed count drops more than 70% below its 14-day median, raises an
`ingest_alerts` row, and sends a notification — no manual checking required. Connectors are
modular and isolated: a broken scraper never affects API ingestion.

**Normalised data model.** Every event resolves to a canonical record: title, slug,
start/end time, timezone, event type (fixed taxonomy), tags, optional summary, optional
image, source link, and flags for festival membership and moderation state. Raw payloads
are stored in `external_events` separately from the canonical `events` table, enabling
re-parsing and diff detection without touching published records.

**Supabase is the source of truth.** The frontend is a presentation layer only. Nothing
of consequence lives in the frontend — approved, high-confidence events
(`visibility = 'published'`, confidence above threshold) are pushed to it; everything
else stays internal.

**Festival-aware.** Major festivals — Celtic Connections, Glasgow Comedy Festival,
Glasgow Film Festival, Glasgow International, Tectonics, and others — are first-class
entities. Events are tagged with a `festival_id` automatically during normalisation, and
each festival has a dedicated page driven by that data.

**Evergreen venue layer.** Alongside time-based events, the platform maintains a
permanent venue directory: profiles, a map view, and a claimable system so the community
can keep venue data accurate without central editorial overhead.

---

## Platform focus areas

- Live music and club culture
- Underground arts and exhibitions
- Community meetups
- Independent cultural spaces
- Festivals
- Evergreen venue discovery

---

## Source landscape

Sources are organised into four tiers by integration stability and maintenance burden.
Full per-source detail — including risk notes and specific connector guidance — is in
[docs/reference/SPEC.md § 6](reference/SPEC.md).

**Tier 1 — API backbone (~60% of coverage, near-zero maintenance).** Ticketmaster,
Skiddle, Eventbrite, Bandsintown, Meetup. Scheduled daily ingestion via official REST
APIs, stable external IDs, incremental upsert. These sources require almost no
intervention after initial setup.

**Tier 2 — RSS / iCal feeds (~20% of coverage, near-zero maintenance).** Substack
newsletters, venue iCal feeds. Feed formats are extremely stable.

**Tier 3 — Structured HTML scrapers (~15% of coverage, occasional maintenance).**
SWG3, St Luke's, Mono, The Flying Duck, The Old Hairdressers, The Pipe Factory, Gigs
in Scotland. (Mono and The Flying Duck additionally use iCal links for `start_at`
validation.) CSS selector extraction with break detection. Scrapers will fail
occasionally as sites change; the modular connector design means each fix is scoped to
one file.

**Tier 4 — Cultural directories and festivals (enrichment only).** Visit Glasgow,
The Skinny, CCA Glasgow, GoMA, Tramway, RSNO, and festival sites. Used for festival
detection, event tagging, and editorial enrichment — not raw event ingestion.

**Sources to avoid or treat as link-only.** Instagram (terms of service prevent
scraping; structure is unstable). WhatsOnGlasgow (scraping risk; duplicates API
sources). Resident Advisor (no API; link-out only — do not store descriptions or
images).

---

## MVP scope

### Phase 1

**Ingestion backbone**

- Ticketmaster API
- Skiddle API
- Eventbrite API

**Venue connectors**

- SWG3 — structured HTML
- Mono — HTML with iCal validation
- The Flying Duck — HTML with iCal validation
- St Luke's — structured HTML

**Core features**

- Event listing by date and category
- Festival flag system with dedicated festival pages
- Venue pages and venue map
- Public event submission form with moderation queue

### Phase 2

- Meetup API
- Glasgow Art Map RSS
- Expanded venue coverage (The Pipe Factory, The Old Hairdressers, and others)
- Venue claim system
- Editorial picks
- Newsletter automation
- Tonight / This Weekend dynamic pages

---

## Success criteria

- Comprehensive live music coverage for Glasgow
- Strong representation of underground arts events
- Reliable festival tagging with dedicated festival pages
- Clear, consistent event categorisation across all source types
- High-quality, accurate venue directory
- Community trust evidenced by venue claims and public submissions
- Low ongoing maintenance overhead (target: 1–3 hours/month post-launch)

## Maintenance targets

| Source tier            | Coverage share | Expected maintenance                              |
|------------------------|----------------|---------------------------------------------------|
| Tier 1 (APIs)          | ~60%           | Near zero — stable IDs, incremental sync          |
| Tier 2 (RSS / iCal)    | ~20%           | Near zero — very stable feed formats              |
| Tier 3 (HTML scrapers) | ~15%           | Occasional — a few connector fixes per year       |
| Community submissions  | ~5%            | Moderation queue — scales with community growth   |

The 1–3 hours/month target is achievable if connectors are built modularly and break
detection is wired up correctly. API and feed sources cover ~80% of events and require
almost no ongoing attention. When a scraper breaks, the alert fires quickly and the fix
is isolated to one connector file.
