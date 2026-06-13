-- ============================================================================
-- Migration: 20260613000000_a1_event_links_view
--
-- ADR 0005 A1 (issue #23) — Expose every permitted source/ticket link for a
-- canonical event to the anon key. The truest expression of link-first.
--
-- Today only one (source_url, ticket_url) pair is exposed on the canonical
-- event row. Per-source links live in `external_events`, which is default-deny
-- for anon. This migration adds a curated, RLS-guarded read-only projection.
--
-- Shape chosen (per prompt 17 — design audit, retained as DESIGN-DOC):
--
--   A view, not a table. `event_links` is a derived projection over
--   `external_events` joined to `sources` and `events`. No second write path,
--   so no risk of drift; the view follows whatever the normaliser writes
--   into `external_events`.
--
--   The view is created with `security_invoker = off` (default). It runs as
--   the view owner (postgres), so the default-deny RLS on `external_events`
--   does NOT apply when the anon key reads the view. The view's own WHERE
--   clause provides the equivalent of an RLS policy:
--
--       events.visibility = 'published'
--       AND events.confidence >= 60
--       AND external_events.is_deleted = false
--
--   That matches the same boundary the public `events` policy enforces
--   (visibility + confidence), so we never expose links for a draft, hidden,
--   archived, or low-confidence parent.
--
--   The view exposes only the permitted projection — event_id, url, label,
--   kind ('source' | 'ticket'), source identity, sort_order. Raw payloads,
--   freshness timestamps, and other internal columns of `external_events`
--   stay service-role only.
--
-- Applies after: 20260612010000_ingestion_health_views.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 1: The event_links projection view
--
-- One row per distinct (event_id, kind, url) tuple. Each external_events row
-- contributes:
--   - up to one `source` link  (external_url           — how to read about it)
--   - up to one `ticket` link  (ticket_url_guess      — how to book/RSVP)
--
-- sort_order: source links before ticket links by default, then by source
-- name for stable cross-source ordering.
-- ----------------------------------------------------------------------------

create or replace view public.event_links
  with (security_invoker = off)
  as
with per_external as (
  select
    ee.event_id,
    'source'::text  as kind,
    ee.external_url as url,
    s.id            as source_id,
    s.name          as source_name,
    s.slug          as source_slug,
    1               as sort_order
  from public.external_events ee
  join public.sources s on s.id = ee.source_id
  join public.events  e on e.id = ee.event_id
  where e.visibility   = 'published'
    and e.confidence  >= 60
    and ee.is_deleted  = false
    and ee.external_url is not null
    and ee.external_url <> ''

  union all

  select
    ee.event_id,
    'ticket'::text         as kind,
    ee.ticket_url_guess    as url,
    s.id                   as source_id,
    s.name                 as source_name,
    s.slug                 as source_slug,
    2                      as sort_order
  from public.external_events ee
  join public.sources s on s.id = ee.source_id
  join public.events  e on e.id = ee.event_id
  where e.visibility   = 'published'
    and e.confidence  >= 60
    and ee.is_deleted  = false
    and ee.ticket_url_guess is not null
    and ee.ticket_url_guess <> ''
)
select distinct
  pe.event_id,
  pe.kind,
  pe.url,
  pe.source_id,
  pe.source_name,
  pe.source_slug,
  case
    when pe.kind = 'ticket' then
      coalesce(
        (select ee2.ticket_url_label_guess
           from public.external_events ee2
          where ee2.event_id = pe.event_id
            and ee2.source_id = pe.source_id
            and ee2.ticket_url_guess = pe.url
          limit 1),
        'Book on ' || pe.source_name
      )
    else 'Listed on ' || pe.source_name
  end as label,
  pe.sort_order
from per_external pe;


-- ----------------------------------------------------------------------------
-- BLOCK 2: Grants
--
-- The view is the anon-readable surface. Revoke from PUBLIC for clarity, then
-- grant SELECT to anon + authenticated (Astro frontend) and service_role
-- (Trigger.dev workers + Studio).
-- ----------------------------------------------------------------------------

revoke all on public.event_links from public;
grant select on public.event_links to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- BLOCK 3: Verification assertions
--
-- Sanity check that the view exists and is NOT security_invoker (it must run
-- as owner to bypass the default-deny RLS on external_events).
-- ----------------------------------------------------------------------------

do $$
declare
  v_invoker_text text;
begin
  select coalesce(array_to_string(reloptions, ','), '')
    into v_invoker_text
    from pg_class
   where relkind = 'v'
     and relname = 'event_links'
     and relnamespace = (select oid from pg_namespace where nspname = 'public');

  if v_invoker_text is null then
    raise exception 'event_links view was not created';
  end if;

  -- Postgres serialises security_invoker = off either as an explicit
  -- 'security_invoker=false' option or by omitting the option entirely
  -- (false is the default). Either is acceptable; security_invoker=true
  -- would be wrong because anon would then hit external_events RLS.
  if v_invoker_text like '%security_invoker=true%' then
    raise exception
      'event_links view has security_invoker=true; this exposes nothing to anon '
      '(external_events is default-deny). Re-create with security_invoker=off.';
  end if;
end;
$$;
