-- ============================================================================
-- Migration: 20260611000000_datathistle_source_seed
-- Data Thistle staging source seed.
--
-- Context: packages/connectors/src/api/datathistle/SPEC.md (staging-only,
-- production display licence-gated) and packages/shared/src/sourcePolicy.ts
-- (allowStagingCollection = true, productionEnabled = false).
--
-- Applies after: 20260531000000_schema_v5_initial.sql
--                20260603000000_cc_new_1_schema_corrections.sql
--                20260606000000_source_category_map_seed.sql
--
-- IMPORTANT: source_category values are stored lowercase.
-- NORMALISATION.md Step 3 looks up:
--   WHERE source_category = lower(trim(external_events.event_type_guess))
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Insert the datathistle source row, disabled.
--
-- enabled = false: staging ingestion must be enabled deliberately by an
-- operator (follow-up migration) once credentials are configured. The source
-- policy module keeps production display gated regardless of this flag.
-- Credentials live in env / secret stores, never in config.
-- ============================================================================

insert into sources (name, slug, source_type, tier, config, status, enabled)
values (
  'Data Thistle',
  'datathistle',
  'api',
  1,
  '{}',
  'ok',
  false  -- disabled: enable via follow-up migration once staging is ready
)
on conflict (slug) do nothing;


-- ============================================================================
-- BLOCK 2: Seed source_type_category_map for datathistle.
--
-- The Data Thistle connector maps source tags to Clyde Culture taxonomy slugs
-- at parse time (packages/connectors/src/api/datathistle/categories.ts) and
-- emits the mapped slug as event_type_guess, preserving original source tags
-- in tags_guess as mapping evidence. These rows are therefore identity
-- mappings so normalisation resolves them with typeSource = 'map' instead of
-- falling back to 'other' + needs_review.
-- ============================================================================

insert into source_type_category_map (source_id, event_type_id, source_category)
select
  s.id,
  et.id,
  m.source_category
from (
  values
    ('live_music',       'live_music'),
    ('club_night',       'club_night'),
    ('comedy',           'comedy'),
    ('theatre',          'theatre'),
    ('arts_exhibition',  'arts_exhibition'),
    ('workshop',         'workshop'),
    ('talk_lecture',     'talk_lecture'),
    ('film',             'film'),
    ('family',           'family'),
    ('sport',            'sport'),
    ('community_meetup', 'community_meetup'),
    ('food_drink',       'food_drink'),
    ('other',            'other')
) as m(source_category, event_type_slug)
join sources     s  on s.slug  = 'datathistle'
join event_types et on et.slug = m.event_type_slug
on conflict (source_id, source_category) do nothing;


-- ============================================================================
-- BLOCK 3: Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_count   integer;
  v_enabled boolean;
begin

  -- Assert: the datathistle source row exists and is disabled
  select enabled into v_enabled
  from sources
  where slug = 'datathistle';

  if v_enabled is null then
    raise exception
      'datathistle seed assertion failed: sources row missing';
  end if;

  if v_enabled then
    raise exception
      'datathistle seed assertion failed: source must be seeded disabled';
  end if;

  -- Assert: all 13 identity category mappings exist
  select count(*) into v_count
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'datathistle';

  if v_count < 13 then
    raise exception
      'datathistle seed assertion failed: expected >= 13 category rows, got %',
      v_count;
  end if;

end $$;
