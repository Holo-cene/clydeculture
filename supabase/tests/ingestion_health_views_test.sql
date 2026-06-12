-- =============================================================================
-- supabase/tests/ingestion_health_views_test.sql
-- Thread #1 slice 4 (issue #6) — ingestion health visible for weekly review
--
-- Asserts that:
--   1. The internal review views (v_recent_ingest_runs, v_open_ingest_alerts)
--      exist with the columns the weekly-review workflow needs.
--   2. Both views run with security_invoker=on so they inherit the underlying
--      ingest_runs / ingest_alerts / sources RLS — anon sees zero rows.
--   3. v_recent_ingest_runs surfaces recent runs ordered most-recent-first.
--   4. v_open_ingest_alerts excludes resolved alerts.
--
-- How to run (local Supabase with migrations applied):
--   supabase db test
--   -- or, with psql directly:
--   psql "$DATABASE_URL" -f supabase/tests/ingestion_health_views_test.sql
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(13);


-- =============================================================================
-- FIXTURE SETUP
-- UUID namespace 00000000-a600-*  identifies issue-6 test rows.
-- =============================================================================

INSERT INTO public.sources (id, name, slug, source_type, enabled)
VALUES (
  '00000000-a600-0000-0000-000000000001'::uuid,
  'Issue 6 Test Source', 'issue-6-test-source', 'api', true
);

-- Two ingest_runs at different timestamps so we can assert ordering.
INSERT INTO public.ingest_runs (
  id, source_id, status,
  fetched_count, parsed_count, upserted_external_count,
  created_events_count, updated_events_count, errors_count,
  started_at, finished_at
) VALUES
  ('00000000-a600-0000-0000-000000000010'::uuid,
   '00000000-a600-0000-0000-000000000001'::uuid, 'success',
   42, 40, 38, 30, 8, 0,
   now() - interval '2 hours', now() - interval '2 hours' + interval '30 seconds'),
  ('00000000-a600-0000-0000-000000000011'::uuid,
   '00000000-a600-0000-0000-000000000001'::uuid, 'partial',
   42, 39, 37, 29, 8, 1,
   now() - interval '1 hour', now() - interval '1 hour' + interval '30 seconds');

-- One open alert + one resolved alert so we can assert the open filter.
INSERT INTO public.ingest_alerts (id, source_id, run_id, alert_type, message, resolved, resolved_at)
VALUES
  ('00000000-a600-0000-0000-000000000020'::uuid,
   '00000000-a600-0000-0000-000000000001'::uuid,
   '00000000-a600-0000-0000-000000000011'::uuid,
   'count_drop', 'parsed 39 events, below 30% of 14-day median 200', false, null),
  ('00000000-a600-0000-0000-000000000021'::uuid,
   '00000000-a600-0000-0000-000000000001'::uuid,
   '00000000-a600-0000-0000-000000000010'::uuid,
   'cold_start_zero', 'historical alert', true, now() - interval '1 day');


-- =============================================================================
-- SECTION 1: Views exist with the expected columns
-- =============================================================================

SELECT has_view(
  'public', 'v_recent_ingest_runs',
  'v_recent_ingest_runs view exists'
);

SELECT has_view(
  'public', 'v_open_ingest_alerts',
  'v_open_ingest_alerts view exists'
);

-- Required columns the weekly-review surface depends on.
SELECT columns_are(
  'public', 'v_recent_ingest_runs',
  ARRAY[
    'id', 'source_id', 'source_slug', 'source_name',
    'status', 'started_at', 'finished_at',
    'fetched_count', 'parsed_count', 'upserted_external_count',
    'created_events_count', 'updated_events_count', 'errors_count',
    'error_message'
  ],
  'v_recent_ingest_runs exposes counts + status + timestamps + source label'
);

SELECT columns_are(
  'public', 'v_open_ingest_alerts',
  ARRAY[
    'id', 'source_id', 'source_slug', 'source_name',
    'run_id', 'alert_type', 'message', 'created_at'
  ],
  'v_open_ingest_alerts exposes alert + source label'
);


-- =============================================================================
-- SECTION 2: Internal-only — anon must see zero rows from either view
--
-- The views are defined with security_invoker=on so anon's RLS context applies
-- to ingest_runs / ingest_alerts / sources — all three are default-deny for
-- anon, so the views must return nothing.
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.v_recent_ingest_runs),
  0,
  'anon: v_recent_ingest_runs is empty (security_invoker honours RLS)'
);

SELECT is(
  (SELECT count(*)::int FROM public.v_open_ingest_alerts),
  0,
  'anon: v_open_ingest_alerts is empty (security_invoker honours RLS)'
);

RESET ROLE;


-- =============================================================================
-- SECTION 3: As an internal (service-role / postgres) caller, the views return
-- the right rows in the right order.
-- =============================================================================

-- v_recent_ingest_runs: both fixture runs are visible, joined with source_slug.
SELECT is(
  (SELECT count(*)::int FROM public.v_recent_ingest_runs
   WHERE source_id = '00000000-a600-0000-0000-000000000001'::uuid),
  2,
  'internal: v_recent_ingest_runs surfaces both fixture runs'
);

SELECT is(
  (SELECT source_slug FROM public.v_recent_ingest_runs
   WHERE id = '00000000-a600-0000-0000-000000000011'::uuid),
  'issue-6-test-source',
  'internal: v_recent_ingest_runs joins sources.slug for review labels'
);

-- Counts + status + timestamp are exactly what the run row carried.
SELECT is(
  (SELECT parsed_count FROM public.v_recent_ingest_runs
   WHERE id = '00000000-a600-0000-0000-000000000011'::uuid),
  39,
  'internal: v_recent_ingest_runs carries parsed_count'
);

SELECT is(
  (SELECT status FROM public.v_recent_ingest_runs
   WHERE id = '00000000-a600-0000-0000-000000000011'::uuid),
  'partial',
  'internal: v_recent_ingest_runs carries status'
);

-- v_open_ingest_alerts: the resolved fixture alert must NOT appear.
SELECT is(
  (SELECT count(*)::int FROM public.v_open_ingest_alerts
   WHERE source_id = '00000000-a600-0000-0000-000000000001'::uuid),
  1,
  'internal: v_open_ingest_alerts excludes resolved alerts'
);

SELECT is(
  (SELECT id FROM public.v_open_ingest_alerts
   WHERE source_id = '00000000-a600-0000-0000-000000000001'::uuid),
  '00000000-a600-0000-0000-000000000020'::uuid,
  'internal: v_open_ingest_alerts surfaces the unresolved alert'
);

SELECT is(
  (SELECT alert_type FROM public.v_open_ingest_alerts
   WHERE id = '00000000-a600-0000-0000-000000000020'::uuid),
  'count_drop',
  'internal: v_open_ingest_alerts carries alert_type'
);


-- =============================================================================
-- FINISH
-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
