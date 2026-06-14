-- =============================================================================
-- supabase/tests/mvp_seed_test.sql
-- Tracer Bullet — Thread #1 baseline checks.
--
-- These assertions depend on the migration set and supabase/seed.sql being
-- applied by `supabase db reset`. They prove that:
--
--   * The Ticketmaster source is live (enabled + auto_publish=true) so the
--     sweep can write real Glasgow events to canonical `events`.
--   * The demo source remains disabled and its seeded rows are NOT the public
--     source of truth — none are publicly visible via the anon boundary
--     (visibility='published' AND confidence>=60).
--   * The demo rows still exist (archived) so internal tools can inspect them.
--
-- The Ticketmaster pipeline end-to-end behaviour (fixture → external_events →
-- canonical events → public-read) is exercised by the integration test at
-- packages/ingestion/src/normalise/ticketmaster-fixture-e2e.integration.test.ts.
-- =============================================================================

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- 1. Ticketmaster source is enabled (live ingestion on)
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT enabled
    FROM public.sources
    WHERE slug = 'ticketmaster'
  ),
  true,
  'Ticketmaster source row is enabled for live ingestion'
);

-- ---------------------------------------------------------------------------
-- 2. Ticketmaster source has auto_publish=true so the normaliser can flip
--    confidence-passing events to visibility='published'
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT (config->>'auto_publish')::boolean
    FROM public.sources
    WHERE slug = 'ticketmaster'
  ),
  true,
  'Ticketmaster source config.auto_publish is true (Tier-1 auto-publish path)'
);

-- ---------------------------------------------------------------------------
-- 3. Demo source row is disabled — no sweep ever runs against it
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT enabled
    FROM public.sources
    WHERE id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  false,
  'Demo source row remains disabled — sweep never runs against it'
);

-- ---------------------------------------------------------------------------
-- 4. Demo rows still seeded for internal inspection (not deleted)
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT count(*) >= 10
    FROM public.events
    WHERE primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  'Demo seed still inserts at least 10 events for internal inspection'
);

-- ---------------------------------------------------------------------------
-- 5. Demo rows are NOT public — they fail the anon boundary
--    (the demo seed is no longer the source of truth for the deployed site)
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)
    FROM public.events
    WHERE primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
      AND visibility = 'published'
      AND confidence >= 60
  ),
  0::bigint,
  'Demo seed events are not visible via the public anon boundary'
);

-- ---------------------------------------------------------------------------
-- 6. Demo rows are archived (not deleted), preserving audit trail
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT bool_and(visibility = 'archived')
    FROM public.events
    WHERE primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  'All demo seed events are archived (preserved internally, hidden publicly)'
);

SELECT * FROM finish();
ROLLBACK;
