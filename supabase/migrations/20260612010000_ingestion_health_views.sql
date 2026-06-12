-- ============================================================================
-- Migration: 20260612010000_ingestion_health_views
--
-- Thread #1 / slice 4 (issue #6) — ingestion health visible for weekly review.
--
-- Creates two internal review views:
--   - v_recent_ingest_runs   joins ingest_runs with sources for the weekly
--                            review (counts + status + timestamps + source).
--   - v_open_ingest_alerts   surfaces unresolved ingest_alerts joined with
--                            sources.
--
-- Both views are defined with `security_invoker = on` so they inherit the
-- underlying tables' RLS. `ingest_runs`, `ingest_alerts`, and `sources` are
-- all default-deny for anon (no public-read policy), so the views are
-- automatically internal — the public anon-key Astro app reads zero rows.
-- See supabase/tests/ingestion_health_views_test.sql and
-- supabase/tests/rls_internal_tables_test.sql for the boundary tests.
--
-- Service-role / postgres / Supabase Studio callers see the joined rows
-- without writing the join each time.
--
-- Applies after: 20260612000000_enable_ticketmaster_live.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 1: Recent runs view
-- ----------------------------------------------------------------------------

create or replace view public.v_recent_ingest_runs
  with (security_invoker = on)
  as
select
  r.id,
  r.source_id,
  s.slug                       as source_slug,
  s.name                       as source_name,
  r.status,
  r.started_at,
  r.finished_at,
  r.fetched_count,
  r.parsed_count,
  r.upserted_external_count,
  r.created_events_count,
  r.updated_events_count,
  r.errors_count,
  r.error_message
from public.ingest_runs r
join public.sources s on s.id = r.source_id;


-- ----------------------------------------------------------------------------
-- BLOCK 2: Open alerts view
-- ----------------------------------------------------------------------------

create or replace view public.v_open_ingest_alerts
  with (security_invoker = on)
  as
select
  a.id,
  a.source_id,
  s.slug                       as source_slug,
  s.name                       as source_name,
  a.run_id,
  a.alert_type,
  a.message,
  a.created_at
from public.ingest_alerts a
join public.sources s on s.id = a.source_id
where a.resolved = false;


-- ----------------------------------------------------------------------------
-- BLOCK 3: Privilege belt-and-braces
--
-- security_invoker + the underlying tables' default-deny RLS already make
-- these views empty for anon. Revoking explicit SELECT from anon and
-- authenticated is defensive: if a future policy ever grants public read to
-- ingest_runs / ingest_alerts (it shouldn't), these views must still stay
-- internal-only.
-- ----------------------------------------------------------------------------

revoke all on public.v_recent_ingest_runs from anon, authenticated;
revoke all on public.v_open_ingest_alerts from anon, authenticated;

grant select on public.v_recent_ingest_runs to service_role;
grant select on public.v_open_ingest_alerts to service_role;


-- ============================================================================
-- Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_recent_invoker boolean;
  v_alerts_invoker boolean;
begin
  -- Assert: both views exist and were created with security_invoker = on.
  select coalesce((reloptions::text)::text like '%security_invoker=true%', false)
    into v_recent_invoker
  from pg_class
  where relkind = 'v'
    and relname = 'v_recent_ingest_runs'
    and relnamespace = 'public'::regnamespace;

  if v_recent_invoker is null or v_recent_invoker = false then
    raise exception
      'ingestion health view assertion failed: v_recent_ingest_runs must be created WITH (security_invoker = on)';
  end if;

  select coalesce((reloptions::text)::text like '%security_invoker=true%', false)
    into v_alerts_invoker
  from pg_class
  where relkind = 'v'
    and relname = 'v_open_ingest_alerts'
    and relnamespace = 'public'::regnamespace;

  if v_alerts_invoker is null or v_alerts_invoker = false then
    raise exception
      'ingestion health view assertion failed: v_open_ingest_alerts must be created WITH (security_invoker = on)';
  end if;

  -- Assert: anon must not hold SELECT on either view.
  if has_table_privilege('anon', 'public.v_recent_ingest_runs', 'SELECT') then
    raise exception
      'ingestion health view assertion failed: anon must not hold SELECT on v_recent_ingest_runs';
  end if;

  if has_table_privilege('anon', 'public.v_open_ingest_alerts', 'SELECT') then
    raise exception
      'ingestion health view assertion failed: anon must not hold SELECT on v_open_ingest_alerts';
  end if;
end $$;
