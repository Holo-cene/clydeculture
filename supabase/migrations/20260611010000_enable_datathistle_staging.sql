-- ============================================================================
-- Migration: 20260611010000_enable_datathistle_staging
-- Enable the Data Thistle source row for STAGING INGESTION ONLY.
--
-- Context: the connector, parser, category mapping, source-policy gates, and
-- Supabase import compatibility are implemented and tested, and a manual live
-- smoke run (2026-06-11) verified the API shape, pagination, query params,
-- parser compatibility, and link-first field stripping. See
-- packages/connectors/src/api/datathistle/SPEC.md §5/§14/§16.
--
-- Scope: flips sources.enabled = true for slug 'datathistle'. Nothing else.
--
-- Production/public display remains DISABLED. That gate lives in
-- packages/shared/src/sourcePolicy.ts (productionEnabled = false,
-- allowPublicDisplay = false, descriptions/images/place-data disallowed) and
-- in the publishing layer's visibility/confidence rules. This migration does
-- not touch policies, normalisation gates, or event visibility.
--
-- Applies after: 20260611000000_datathistle_source_seed.sql
-- ============================================================================

update sources
set enabled = true,
    updated_at = now()
where slug = 'datathistle';


-- ============================================================================
-- Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_enabled      boolean;
  v_source_type  text;
  v_map_count    integer;
  v_published    integer;
begin

  -- Assert: the datathistle source row exists, is enabled, and is still 'api'
  select enabled, source_type into v_enabled, v_source_type
  from sources
  where slug = 'datathistle';

  if v_enabled is null then
    raise exception
      'datathistle enable assertion failed: sources row missing';
  end if;

  if not v_enabled then
    raise exception
      'datathistle enable assertion failed: source row is not enabled';
  end if;

  if v_source_type is distinct from 'api' then
    raise exception
      'datathistle enable assertion failed: source_type is %, expected api',
      v_source_type;
  end if;

  -- Assert: the 13 identity category mappings still match current taxonomy
  -- slugs exactly (source_category = event_types.slug for every row)
  select count(*) into v_map_count
  from source_type_category_map scm
  join sources s     on s.id  = scm.source_id
  join event_types et on et.id = scm.event_type_id
  where s.slug = 'datathistle'
    and scm.source_category = et.slug
    and et.slug in (
      'live_music', 'club_night', 'comedy', 'theatre', 'arts_exhibition',
      'workshop', 'talk_lecture', 'film', 'family', 'sport',
      'community_meetup', 'food_drink', 'other'
    );

  if v_map_count <> 13 then
    raise exception
      'datathistle enable assertion failed: expected 13 identity category rows matching taxonomy slugs, got %',
      v_map_count;
  end if;

  -- Assert: this migration enables no public display — no published canonical
  -- events have datathistle as their primary source. (The application-level
  -- gate is sourcePolicy.ts productionEnabled/allowPublicDisplay = false,
  -- which this migration does not and cannot change.)
  select count(*) into v_published
  from events e
  join sources s on s.id = e.primary_source_id
  where s.slug = 'datathistle'
    and e.visibility = 'published';

  if v_published > 0 then
    raise exception
      'datathistle enable assertion failed: % published events already reference datathistle',
      v_published;
  end if;

end $$;
