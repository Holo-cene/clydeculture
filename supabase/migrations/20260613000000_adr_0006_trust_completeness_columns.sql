-- ============================================================================
-- Migration: 20260613000000_adr_0006_trust_completeness_columns
--
-- ADR 0006 (issue #25) — split the single `confidence` score into two signals:
--   trust        — "is this event real?"
--   completeness — "is it complete enough to display?" (Minimum Viable Public Event)
--
-- This migration exposes the new columns and backfills them from existing
-- `confidence_inputs` so subsequent normalisation runs and a follow-on RLS
-- migration can use them. It does NOT change the publishing RLS gate yet —
-- `events`/`event_tags` still gate on `confidence >= 60` (block 6 in migration
-- 20260603000000_cc_new_1_schema_corrections.sql and migration
-- 20260606001000_a3_event_tags_explicit_confidence.sql). The RLS swap is a
-- separate change tracked as a follow-on so it can be reviewed atomically.
--
-- Mapping rules per ADR 0006 / packages/core/src/normalise/normalise.ts:
--   trust         tier_base by tier (T1=70, T2=55, T3=40, T4=25), +20 if corroborated,
--                 capped at 100, set to 0 if title is too short. The legacy
--                 `confidence_inputs` records `tier` and `corroborated`, so the
--                 backfill is deterministic for any existing row.
--   completeness  25 each for title (>=3 chars), start signal, link, and a
--                 location signal. The legacy inputs record `has_start_at` and
--                 `has_url`; existing rows all have a non-null `start_at` and
--                 `venue_id` (those are NOT NULL on the `events` table), so the
--                 location signal is always satisfied for already-stored rows.
--                 The link signal mirrors `has_url`. `title_quality` ≥ 3 words
--                 implies length ≥ 3 chars, but we fall back to a length check
--                 on the stored title for any single-word title row.
--
-- Applies after: 20260612010000_ingestion_health_views.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 1: Add the new columns (nullable; populated by backfill below and by
--          the normalisation pipeline going forward)
-- ----------------------------------------------------------------------------

alter table events
  add column if not exists trust              smallint check (trust between 0 and 100),
  add column if not exists trust_inputs       jsonb    not null default '{}'::jsonb,
  add column if not exists completeness       smallint check (completeness between 0 and 100),
  add column if not exists completeness_inputs jsonb   not null default '{}'::jsonb;


-- ----------------------------------------------------------------------------
-- BLOCK 2: Backfill trust + trust_inputs from existing confidence_inputs
-- ----------------------------------------------------------------------------

with computed as (
  select
    id,
    (confidence_inputs ->> 'tier')::smallint        as tier,
    coalesce((confidence_inputs ->> 'corroborated')::boolean, false) as corroborated,
    length(coalesce(title, '')) < 3                  as title_too_short
  from events
  where trust is null
)
update events
set
  trust = case
    when computed.title_too_short then 0
    else least(
      case computed.tier
        when 1 then 70
        when 2 then 55
        when 3 then 40
        when 4 then 25
        else 25
      end + case when computed.corroborated then 20 else 0 end,
      100
    )
  end,
  trust_inputs = jsonb_build_object(
    'tier',            computed.tier,
    'tier_base',       case computed.tier
                         when 1 then 70
                         when 2 then 55
                         when 3 then 40
                         when 4 then 25
                         else 25
                       end,
    'corroborated',    computed.corroborated,
    'title_too_short', computed.title_too_short,
    'total',           case
                         when computed.title_too_short then 0
                         else least(
                           case computed.tier
                             when 1 then 70
                             when 2 then 55
                             when 3 then 40
                             when 4 then 25
                             else 25
                           end + case when computed.corroborated then 20 else 0 end,
                           100
                         )
                       end
  )
from computed
where events.id = computed.id;


-- ----------------------------------------------------------------------------
-- BLOCK 3: Backfill completeness + completeness_inputs from existing rows
--
-- Stored events all have NOT NULL title, start_at, and venue_id, so the title,
-- start, and location signals are satisfied for every existing row. The link
-- signal mirrors `confidence_inputs.has_url` (true when either source_url or
-- ticket_url is non-empty).
-- ----------------------------------------------------------------------------

with computed as (
  select
    id,
    length(coalesce(title, '')) >= 3                                 as has_title,
    (start_at is not null) or coalesce(time_tba, false)              as has_start_signal,
    coalesce((confidence_inputs ->> 'has_url')::boolean, false)
      or coalesce(source_url, '') <> ''
      or coalesce(ticket_url, '') <> ''                              as has_link,
    venue_id is not null                                             as has_location_signal,
    coalesce(ticket_url, '') <> ''                                    as has_ticket_url,
    coalesce(image_url, '')  <> ''                                    as has_image,
    coalesce((confidence_inputs ->> 'type_classified')::boolean, false) as type_classified,
    coalesce((confidence_inputs ->> 'venue_resolved')::boolean, false)  as venue_resolved
  from events
  where completeness is null
)
update events
set
  completeness = (
    (case when computed.has_title           then 25 else 0 end) +
    (case when computed.has_start_signal    then 25 else 0 end) +
    (case when computed.has_link            then 25 else 0 end) +
    (case when computed.has_location_signal then 25 else 0 end)
  ),
  completeness_inputs = jsonb_build_object(
    'has_title',           computed.has_title,
    'has_start_signal',    computed.has_start_signal,
    'has_link',            computed.has_link,
    'has_location_signal', computed.has_location_signal,
    'has_ticket_url',      computed.has_ticket_url,
    'has_image',           computed.has_image,
    'type_classified',     computed.type_classified,
    'venue_resolved',      computed.venue_resolved,
    'total',
      (case when computed.has_title           then 25 else 0 end) +
      (case when computed.has_start_signal    then 25 else 0 end) +
      (case when computed.has_link            then 25 else 0 end) +
      (case when computed.has_location_signal then 25 else 0 end)
  )
from computed
where events.id = computed.id;


-- ----------------------------------------------------------------------------
-- BLOCK 4: Documentation comments — make the column intent discoverable in
--          Studio and via `\d+ events`.
-- ----------------------------------------------------------------------------

comment on column events.trust is
  'ADR 0006: "is this event real?" 0-100. Source tier + corroboration. RLS swap pending.';

comment on column events.trust_inputs is
  'ADR 0006: breakdown of trust score (tier, tier_base, corroborated, title_too_short).';

comment on column events.completeness is
  'ADR 0006: "is it complete enough to display?" 0-100. Minimum Viable Public Event = 100.';

comment on column events.completeness_inputs is
  'ADR 0006: breakdown of completeness score (has_title, has_start_signal, has_link, has_location_signal + bonus richness inputs).';
