# Publishing

Publishing is the step that makes a canonical event visible to the public. With the
Astro coded frontend (ADR 0001), publishing is not a sync job — it is a field
transition. When an event's `visibility` changes to `'published'`, it is immediately
queryable by the frontend via Supabase and the anon key. There is no intermediate
CMS, no content hash, no push step.

---

## The publishing boundary

An event may only be visible on the frontend if two conditions are both true:

1. `visibility = 'published'` — the moderation lifecycle has approved the event for
   public display.
2. `confidence >= threshold` — the confidence score (0–100) meets the configured
   minimum. Events below threshold stay at `visibility = 'draft'`.

Both conditions are enforced at the database layer by the RLS policy on `events`:

```sql
-- Public read: visibility = 'published', confidence >= 60
create policy "Public read events"
  on events for select
  to anon
  using (visibility = 'published' and confidence >= 60);
```

The threshold value `60` is hardcoded as a literal integer in the RLS policy.
Changing it requires a migration that alters the policy — this is intentional for
Phase 1, where threshold changes are deliberate policy decisions that should be
change-controlled. BE-19 tracks the future work to externalise this into a
`platform_config` table with per-source overrides via `sources.confidence_threshold`.
No other record states (`draft`, `hidden`, `archived`) are visible through the anon key.

### Trust × completeness gate (ADR 0006)

> **Engine + columns implemented; RLS swap pending.** The split-signal scoring lives
> in `packages/core` as `calculateTrust()`, `calculateCompleteness()`, and
> `isEligibleForPublic()` ([ADR 0006](decisions/0006-confidence-trust-and-completeness.md)).
> `events` now carries `trust`, `trust_inputs`, `completeness`, and
> `completeness_inputs` columns (migration `20260613000000_adr_0006_trust_completeness_columns`,
> existing rows backfilled), and `dbNormalise.ts` writes both signals on every
> normalised event. The publishing-boundary RLS policy still uses the single
> `confidence >= 60` literal above — the swap to `trust >= 40 AND completeness >= 100`
> is a follow-on so the policy changes for `events` and `event_tags` can land
> atomically.

The split gate replaces the single threshold with **two signals**:

- **Trust** — "is this event real?" Driven by source tier and cross-source
  corroboration. Default bar `T = 40` (Tier 1–3 pass on tier alone; Tier 4 must be
  corroborated).
- **Completeness** — "is it complete enough to display?" Driven by the Minimum Viable
  Public Event fields below. Default bar `C = 100` (all four MVP fields required).

Public eligibility: `trust >= T AND completeness >= C`. A real grassroots/community
event is **not** suppressed merely for lacking a ticket URL, an image, a known/resolved
venue, or commercial source richness. This protects hard rule #7.

**Minimum viable public event.** The smallest set of fields needed to be useful and
honest to a reader: a title (≥3 chars), a start date/time (or an explicit `time_tba`
state), a link (`source_url`), and a location signal (a resolved or auto-created
venue, `is_online = true`, or an explicit "location TBA"). An event clearing the trust
bar and the minimum-viable bar is eligible for display; where a real event is below the
completeness bar, prefer a clear "details to be confirmed" treatment over hiding it.
See `docs/NORMALISATION.md` Step 4.

---

## How an event reaches 'published'

### Auto-publish path (Tier 1 API sources, Phase 1)

High-confidence events from Tier 1 API connectors (Ticketmaster) where:
- `confidence >= 60`
- `needs_review = false`
- `visibility = 'draft'`

are set to `visibility = 'published'` automatically at the end of the normalisation
step. This is configured per-source via `sources.config.auto_publish = true`. Tier 2
and Tier 3 sources remain at `'draft'` until output quality is validated; the
conservative default can be relaxed per-source.

### Manual approval path (all other sources)

The moderator reviews events at `visibility = 'draft'` in the moderation queue (any
event with `needs_review = true` or `confidence < 60`) and either:
- Sets `visibility = 'published'` — event is immediately live.
- Sets `visibility = 'hidden'` — event is suppressed.

At Phase 1, moderation is done via Supabase Studio. A lightweight admin UI is a
Phase 2 item.

---

## Visibility lifecycle

```
new event (from normalisation)
        │
        ▼
   visibility = 'draft'
        │
   confidence >= 60 AND needs_review = false AND auto_publish = true?
        │ yes                       │ no
        ▼                           ▼
   'published'              human review queue
   (immediately live)              │
                           operator approves │ operator hides
                                   ▼                ▼
                             'published'         'hidden'
                                   │
                   7 days after COALESCE(end_at, start_at)
                                   ▼
                              'archived'
                        (archive_past_events())
```

`cancelled` events keep `visibility = 'published'` — users who booked need to see
the cancellation badge. Use `availability = 'cancelled'` for the badge state.
`visibility = 'hidden'` is for duplicates and spam, not cancellations.

---

## RLS policies

The anon key is used by the Astro frontend and may appear in browser-side requests
for dynamic sections. RLS is the only enforcement layer — there is no API proxy.
These policies must be correct before any route in `apps/web` is deployed.

| Table | Policy | Condition |
|---|---|---|
| `events` | Public read | `visibility = 'published' AND confidence >= 60` |
| `event_tags` | Public read | Parent event is published AND confidence >= 60 (explicit since A3 migration `20260606001000`) |
| `venues` | Public read | `status IN ('active', 'temporary')` |
| `event_types` | Public read | All rows |
| `tags` | Public read | All rows |
| `festivals` | Public read | All rows |
| `event_series` | Public read | All rows |
| `venue_aliases` | Public read | Parent venue `status IN ('active', 'temporary')` |
| `event_submissions` | Public insert | Title/start time required; blank titles rejected; moderation fields cannot be set; no read |
| All other tables | No public access | Service role only |

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is used by Trigger.dev tasks
only. It must never appear in `apps/web` code or be exposed in any client-side
context.

---

## Removal and archival

**Past events.** The `archive_past_events()` function sets `visibility = 'archived'`
on published events more than 7 days past `COALESCE(end_at, start_at)`. This runs
on a schedule. Archived events are not returned by the public RLS policy.

**Deleted upstream events.** When a connector stops seeing an upstream record, `external_events.last_seen_at` stops updating. After the tier-specific threshold of consecutive successful missed runs (Tier 1/2: 3, Tier 3: 5), `external_events.is_deleted = true` is set. Full threshold rules and the definition of a "missed successful run" are in `docs/INGESTION.md` — "Event removal detection".

**Multi-source visibility rule.** A canonical event's `visibility` MUST be set to `'hidden'` only when ALL linked `external_events` rows are either `is_deleted = true` or have `availability_guess = 'cancelled'`. If one source cancels an event but another source still lists it as active, the event MUST NOT be hidden — the active source's record takes precedence. The `archive_past_events()` function may then archive the hidden event.

**Tier 1 cancellation override.** If a Tier 1 source (structured API: Ticketmaster, Skiddle) explicitly sends `availability_guess = 'cancelled'`, the canonical event MAY be hidden immediately, regardless of what lower-tier sources show. Tier 1 API cancellations are considered authoritative. Set `availability = 'cancelled'` on the canonical event and `visibility = 'hidden'`. Waiting for Tier 2/3 sources to confirm is not required.

**Ghost duplicate prevention.** `visibility = 'hidden'` is for confirmed removals, cancellations, and duplicates. MUST NOT leave a published row at the old date after a reschedule — see `docs/DEDUPLICATION.md` — "Reschedule" and `docs/NORMALISATION.md` Step 8 for the reschedule path.

---

## Public provenance and "all links" (planned — ADR 0005 A1)

> **Direction, not current state.** Today the public event exposes a single `source_url`
> / `ticket_url`. The cultural-graph model surfaces **every** way to reach an event.

- **All links.** A curated `event_links` projection (or RLS-guarded view) exposes each
  permitted source/ticket/booking/RSVP link for a *published* event, labelled by source
  ("listed on Skiddle", "Buy on Ticketmaster", "Book at GFT"). Built from the per-source
  `external_events` rows but exposing only permitted, published-parent links — internal
  source columns stay service-role only. This is the truest expression of link-first:
  *"here is the clean cultural index — choose where to read, book, RSVP, or support."*
- **Provenance & freshness.** Show "listed on …" and, where useful, freshness ("last
  checked …") drawn from `external_events.last_seen_at` — without exposing raw source
  rows. See `docs/INGESTION.md`.
- **Media.** Only media with display permission is rendered (`docs/MEDIA_POLICY.md`);
  otherwise a placeholder. Never a non-permitted image.

## Field-locked display (planned — ADR 0007)

Editorially **locked** fields (`docs/decisions/0007-editorial-override-and-field-locking.md`)
display the human-set value and are not overwritten by re-normalisation. The public
surface shows the locked value; a "source diverged from a locked field" condition is a
moderation signal, not a public change.

## Status labels (user-facing)

`visibility` controls whether an event shows; `availability` drives the badge:

| availability | Label | Visible? |
|---|---|---|
| `cancelled` | "Cancelled" | Yes (users who booked must see it) |
| `postponed` | "Postponed" (date may be TBA) | Yes |
| `rescheduled` | "Rescheduled" (new date shown) | Yes |
| `sold_out` | "Sold Out" | Yes |
| `low_stock` | "Last Few Tickets" | Yes |
| `not_on_sale` / null | (no badge) | Yes |

`availability_note` overrides standard badge text where context is needed
("Rescheduled to March 20"). Postponed/rescheduled with a retained old→new date history
is a deferred enhancement (`docs/DATA_MODEL.md` Tranche C).

## Canonical URL / slug stability

The public URL of an event is its `slug` (`normalised-title-YYYY-MM-DD`). Slugs are
**stable** once published — downstream links and shares depend on them. When duplicates
merge, the surviving canonical event keeps its slug and the merged record should
**redirect** to the survivor rather than 404 (this needs the survivor pointer noted in
the data-model audit, A1-007; see `docs/DEDUPLICATION.md`). Avoid dead-end listings:
an archived or merged event resolves to its successor or a graceful archived view.

## Tables removed (Webflow path, not used)

The following tables exist in the v5 schema but are retired under the coded
frontend path and should be dropped in the schema migration:

- `publish_mappings` — tracked Webflow CMS item IDs and content hashes
- `publish_jobs` — audit log of sync runs
- `publish_job_items` — per-item disposition within a sync run

The `packages/publishing` package is also removed. Shared Supabase query helpers
(typed wrappers for `getPublishedEvents`, `getVenue`, `getFestival`) live in
`packages/shared`.
