-- ============================================================================
-- Migration: 20260606000000_source_category_map_seed
-- B5 — Seed source_type_category_map with Ticketmaster classification IDs.
--
-- Sources: documented in docs/tasks/BE-03.md.
-- Applies after: 20260531000000_schema_v5_initial.sql
--                20260603000000_cc_new_1_schema_corrections.sql
--
-- IMPORTANT: source_category values are stored lowercase.
-- NORMALISATION.md Step 3 looks up:
--   WHERE source_category = lower(trim(external_events.event_type_guess))
-- The stored value must be lowercase for the comparison to match.
--
-- Theatre gap: BE-03 documents no Ticketmaster classification ID for
-- theatre. No theatre row is included. Do not add one without a
-- documented API ID. The C3 tests and BE-03 must be updated when
-- the ID is confirmed.
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Ensure ticketmaster source exists
--
-- source_type_category_map.source_id is a FK — rows cannot be inserted without
-- a corresponding sources row. This block inserts a minimal ticketmaster source
-- stub so the FK constraints in BLOCK 2 resolve.
--
-- enabled = false: this row is a FK anchor only. It must remain disabled until:
--   1. The Ticketmaster connector is implemented (E1).
--   2. The connector has passed pre-flight verification.
-- A later connector/source-seeding task should flip enabled = true and populate
-- the full config. Do not enable this row manually before E1 is complete —
-- G1's scheduler queries sources WHERE enabled = true and would attempt to run
-- a connector that does not yet exist.
-- ============================================================================

insert into sources (name, slug, source_type, tier, config, status, enabled)
values (
  'Ticketmaster',
  'ticketmaster',
  'api',
  1,
  '{}',
  'ok',
  false  -- disabled: FK anchor only until E1 connector is built
)
on conflict (slug) do nothing;


-- ============================================================================
-- BLOCK 2: Seed source_type_category_map — Ticketmaster classification IDs
--
-- Classification IDs are Ticketmaster Discovery API segment/genre identifiers,
-- documented in docs/tasks/BE-03.md. Stored lowercase — see file header.
--
-- Original API IDs (for cross-reference with Ticketmaster documentation):
--   KZFzniwnSyZfZ7v7nJ  →  live_music        (Music segment)
--   KnvZfZ7vAvF         →  club_night         (Undefined/Club genre)
--   KZFzniwnSyZfZ7v7nE  →  comedy             (Comedy segment)
--   KZFzniwnSyZfZ7v7nn  →  film               (Film segment)
--   KZFzniwnSyZfZ7v7na  →  arts_exhibition    (Arts & Theatre segment)
-- ============================================================================

insert into source_type_category_map (source_id, event_type_id, source_category)
select
  s.id,
  et.id,
  m.source_category
from (
  values
    ('kzfzniwnszyfz7v7nj', 'live_music'),
    ('knvzfz7vavf',         'club_night'),
    ('kzfzniwnszyfz7v7ne', 'comedy'),
    ('kzfzniwnszyfz7v7nn', 'film'),
    ('kzfzniwnszyfz7v7na', 'arts_exhibition')
) as m(source_category, event_type_slug)
join sources     s  on s.slug  = 'ticketmaster'
join event_types et on et.slug = m.event_type_slug
on conflict (source_id, source_category) do nothing;


-- ============================================================================
-- BLOCK 3: Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_count   integer;
  v_invalid integer;
begin

  -- Assert: at least 5 ticketmaster rows exist
  select count(*) into v_count
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'ticketmaster';

  if v_count < 5 then
    raise exception
      'B5 seed assertion failed: expected >= 5 ticketmaster rows, got %',
      v_count;
  end if;

  -- Assert: all seed rows reference a valid event_types row
  select count(*) into v_invalid
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'ticketmaster'
    and not exists (
      select 1 from event_types et where et.id = scm.event_type_id
    );

  if v_invalid > 0 then
    raise exception
      'B5 seed assertion failed: % ticketmaster row(s) have no matching event_types row',
      v_invalid;
  end if;

  -- Assert: no seed row maps to an old broad slug that was removed in B1
  -- (music, arts, talk, festival were not valid slugs in v5 but guard anyway)
  select count(*) into v_invalid
  from source_type_category_map scm
  join sources     s  on s.id  = scm.source_id
  join event_types et on et.id = scm.event_type_id
  where s.slug  = 'ticketmaster'
    and et.slug in ('music', 'arts', 'talk', 'festival');

  if v_invalid > 0 then
    raise exception
      'B5 seed assertion failed: % row(s) map to deprecated broad slugs',
      v_invalid;
  end if;

  raise notice 'B5 seed: % ticketmaster rows validated OK', v_count;
end $$;
