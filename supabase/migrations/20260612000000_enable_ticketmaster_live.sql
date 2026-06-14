-- ============================================================================
-- Migration: 20260612000000_enable_ticketmaster_live
--
-- Tracer Bullet — Thread #1 / slice 1 (issue #3).
--
-- Activates the live Ticketmaster sweep on production and retires the demo
-- seed as the source of truth for the public site:
--
--   1. sources row for slug='ticketmaster' is enabled and configured with
--      auto_publish=true + Europe/London timezone so the trigger.dev sweep
--      can ingest real Glasgow events and the normalisation layer will
--      auto-publish those that clear the confidence gate.
--   2. Any existing demo-seed events that were left at visibility='published'
--      in a deployed database are demoted to 'archived' so the public
--      anon-key read boundary (visibility='published' AND confidence>=60) no
--      longer surfaces them. The demo source row stays disabled.
--
-- The application-level publish gate is unchanged: the normalisation layer
-- in packages/ingestion only marks an event published when:
--   - confidence.score >= 60, and
--   - needs_review is false, and
--   - source.config->>'auto_publish' = 'true'.
-- See packages/ingestion/src/normalise/dbNormalise.ts.
--
-- The Astro app at apps/web reads the production Supabase project via the
-- anon key only (apps/web/src/lib/supabase.ts), so RLS + the confidence
-- threshold gate everything served to the browser. No service-role key is
-- ever shipped to clients.
--
-- Applies after: 20260611010000_enable_datathistle_staging.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCK 1: Enable the Ticketmaster source for live ingestion
-- ----------------------------------------------------------------------------
--
-- The B5 seed migration (20260606000000_source_category_map_seed.sql) inserted
-- the ticketmaster row as a FK anchor with enabled=false and config='{}'. The
-- connector (packages/connectors/src/api/ticketmaster) and the parser are now
-- implemented, fixture- and contract-tested, and the Trigger.dev sweep task
-- (trigger/tasks/sweep.ts) wires the connector to the normalisation pipeline.
-- This block flips enabled=true and seeds the config the normaliser checks.
-- ----------------------------------------------------------------------------
update sources
set enabled = true,
    config = jsonb_build_object(
      'auto_publish', true,
      'timezone', 'Europe/London'
    ),
    updated_at = now()
where slug = 'ticketmaster';


-- ----------------------------------------------------------------------------
-- BLOCK 2: Retire the demo seed as the public source of truth
-- ----------------------------------------------------------------------------
--
-- supabase/seed.sql also writes events at visibility='published' for the demo
-- source ('Clyde Culture Demo Data', 00000000-0600-…). seed.sql is local-only,
-- but if a deployed database has demo events left over from an earlier MVP
-- slice we demote them here. Visibility 'archived' keeps the row for audit
-- while excluding it from the public boundary (visibility='published').
--
-- The demo source row stays disabled so the sweep never runs against it.
-- ----------------------------------------------------------------------------
update events
set visibility = 'archived',
    updated_at = now()
where primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  and visibility = 'published';

update sources
set enabled = false,
    updated_at = now()
where id = '00000000-0600-4000-8000-000000000001'::uuid
  and enabled = true;


-- ============================================================================
-- Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_enabled       boolean;
  v_source_type   text;
  v_auto_publish  boolean;
  v_timezone      text;
  v_demo_published integer;
  v_demo_enabled  boolean;
begin

  -- Assert: ticketmaster source is enabled, still 'api', and auto_publish=true
  select s.enabled,
         s.source_type,
         (s.config->>'auto_publish')::boolean,
         s.config->>'timezone'
    into v_enabled, v_source_type, v_auto_publish, v_timezone
  from sources s
  where s.slug = 'ticketmaster';

  if v_enabled is null then
    raise exception
      'ticketmaster enable assertion failed: sources row missing';
  end if;

  if not v_enabled then
    raise exception
      'ticketmaster enable assertion failed: source row is not enabled';
  end if;

  if v_source_type is distinct from 'api' then
    raise exception
      'ticketmaster enable assertion failed: source_type is %, expected api',
      v_source_type;
  end if;

  if v_auto_publish is distinct from true then
    raise exception
      'ticketmaster enable assertion failed: config.auto_publish must be true (got %)',
      v_auto_publish;
  end if;

  if v_timezone is distinct from 'Europe/London' then
    raise exception
      'ticketmaster enable assertion failed: config.timezone must be Europe/London (got %)',
      v_timezone;
  end if;

  -- Assert: no demo-seed events are still publicly visible
  select count(*) into v_demo_published
  from events
  where primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
    and visibility = 'published';

  if v_demo_published > 0 then
    raise exception
      'demo retirement assertion failed: % demo events still have visibility=published',
      v_demo_published;
  end if;

  -- Assert: the demo source row stays disabled
  select enabled into v_demo_enabled
  from sources
  where id = '00000000-0600-4000-8000-000000000001'::uuid;

  if v_demo_enabled is true then
    raise exception
      'demo retirement assertion failed: demo source row must remain enabled=false';
  end if;

end $$;
