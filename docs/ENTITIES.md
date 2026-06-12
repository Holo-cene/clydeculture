# Cultural Entities (Organisers, Collectives, Artists)

**Status: target design (ADR 0005 Tranche B2 — design-now, build-later).** This
document describes the planned people-and-organisation layer of the cultural graph. It
is **not** implemented; no table named below exists yet (verify against
`supabase/migrations/` before treating anything here as current state).

For Glasgow's cultural ecosystem, people follow *who* puts on events as much as *where*:
venues, promoters, club-night brands, collectives, artists, theatre companies, galleries,
community groups, festivals. Without an entity layer, "everything this promoter is doing"
and "every gig featuring X" are impossible, and the site stays a flat listings feed
rather than cultural infrastructure.

---

## Scope and link-first constraint

Entities are stored for **grouping and routing**, not as content. Following link-first
(see `docs/source-policy.md`): store a **name and a canonical link** (website /
social handle), never scraped biographies, press copy, or images beyond what
`docs/MEDIA_POLICY.md` permits.

**Priority (ADR 0005):** organisers / promoters / collectives (**B2a**) come **before**
artists / performers / lineups (**B2b**) — for DIY Glasgow, who-runs-it drives discovery
more than line-ups, and organiser data is cheaper to capture reliably.

---

## Proposed shape

### `cultural_entities`

| Column | Notes |
|---|---|
| `id` | uuid |
| `name` | display name |
| `slug` | stable, unique; drives `/organisers/…`, `/collectives/…`, `/artists/…` |
| `entity_type` | `artist` / `performer` / `organiser` / `promoter` / `collective` / `company` / `festival` / `venue_group` |
| `website_url` | canonical link (link-first) |
| `instagram_url` | optional social link |
| `source_confidence` | how sure we are the entity is correctly identified (see ADR 0006 trust) |
| `status` | active / merged / pending |

### `entity_aliases`

The parallel of `venue_aliases` — names drift ("432 Presents" / "432presents" /
"432 Presents Glasgow") and must reconcile to one entity, or the people-layer fragments
the moment it is populated.

| Column | Notes |
|---|---|
| `entity_id` | references `cultural_entities` |
| `alias` / `normalised_alias` | unique normalised alias for matching |
| `source_id` | where the alias was seen |

### `event_entities` (join)

| Column | Notes |
|---|---|
| `event_id` | references `events` (the occurrence) |
| `entity_id` | references `cultural_entities` |
| `role` | `organiser` / `promoter` / `performer` / `speaker` / `host` / `curator` |
| `billing_order` | smallint — headliner vs support, lead vs supporting |
| `confidence` | per-relationship confidence |

Where the work/occurrence model (ADR 0005 B1) lands, an entity relationship may attach at
the **work** level (the touring artist) or the **occurrence** level (the local support).

---

## Entity pages (target)

Stable, slug-addressed pages that make the site feel like cultural infrastructure:

```
/organisers/432-presents
/collectives/glasgow-zine-library
/artists/<artist-slug>
/festivals/celtic-connections
/venues/the-hug-and-pint          (venues already exist)
/series/monthly-zine-fair         (work/occurrence — B1)
```

Each lists upcoming and past events for that entity, link-first to each source.

---

## Identity, aliasing, and confidence

- **Aliasing first.** Resolve incoming organiser/artist names through `entity_aliases`
  before creating a new entity (mirror `resolve_venue`).
- **Auto-create cautiously.** An unmatched name may auto-create a `pending` entity
  flagged for review — but entity auto-creation is noisier than venue auto-creation;
  prefer linking to existing entities.
- **Confidence & trust.** Entity links carry confidence; low-confidence links surface for
  review rather than publishing a wrong attribution (ADR 0006 trust).
- **Editorial override.** Canonical entity, correct name, and duplicate decisions are
  lockable per [ADR 0007](decisions/0007-editorial-override-and-field-locking.md).

---

## Relationships and phasing

| Item | Phase |
|---|---|
| `cultural_entities` + `entity_aliases` + `event_entities` for organisers/collectives | DESIGN-NOW, BUILD-LATER (B2a) |
| Artists / performers / lineups + Bandsintown enrichment | BUILD-LATER (B2b) |
| Entity pages in `apps/web` | follows the entity build |
| Follow-an-organiser / alerts | DEFER (`docs/SEARCH.md`) |

Design preflight: `docs/prompts/24`. Umbrella decision: [ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md).
