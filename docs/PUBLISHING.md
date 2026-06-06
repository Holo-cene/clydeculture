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
| `event_submissions` | Public insert | No read |
| All other tables | No public access | Service role only |

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is used by Trigger.dev tasks
only. It must never appear in `apps/web` code or be exposed in any client-side
context.

---

## Removal and archival

**Past events.** The `archive_past_events()` function sets `visibility = 'archived'`
on published events more than 7 days past `COALESCE(end_at, start_at)`. This runs
on a schedule. Archived events are not returned by the public RLS policy.

**Deleted upstream events.** When a connector stops seeing an upstream record,
`external_events.last_seen_at` stops updating. After N missed runs, `is_deleted`
is set to `true` on the `external_events` row. The normaliser propagates this to
the canonical event: if all `external_events` rows pointing to an `events` row are
`is_deleted = true`, the event's `visibility` is set to `'hidden'`. The next
`archive_past_events()` run may then archive it.

---

## Tables removed (Webflow path, not used)

The following tables exist in the v5 schema but are retired under the coded
frontend path and should be dropped in the schema migration:

- `publish_mappings` — tracked Webflow CMS item IDs and content hashes
- `publish_jobs` — audit log of sync runs
- `publish_job_items` — per-item disposition within a sync run

The `packages/publishing` package is also removed. Shared Supabase query helpers
(typed wrappers for `getPublishedEvents`, `getVenue`, `getFestival`) live in
`packages/shared`.
