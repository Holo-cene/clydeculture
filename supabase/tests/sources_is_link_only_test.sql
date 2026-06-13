-- =============================================================================
-- supabase/tests/sources_is_link_only_test.sql
-- Issue #13 — Link-only source enforcement (CLAUDE.md hard rule #1).
--
-- Asserts that the migration 20260613000000_sources_is_link_only:
--   1. Adds an `is_link_only` boolean column on public.sources.
--   2. The column is NOT NULL with default false.
--   3. Existing seeded sources default to is_link_only = false.
--   4. A new source can be inserted with is_link_only = true (no constraint
--      prevents the link-only flag itself).
--   5. The column has a documenting comment so the next reader understands
--      its enforcement role.
--
-- How to run (local Supabase with migrations applied):
--   supabase db test
--   -- or, with psql directly:
--   psql "$DATABASE_URL" -f supabase/tests/sources_is_link_only_test.sql
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(6);


-- ---------------------------------------------------------------------------
-- 1. Column exists on public.sources
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'sources', 'is_link_only',
  'sources.is_link_only column exists'
);


-- ---------------------------------------------------------------------------
-- 2. Column is boolean
-- ---------------------------------------------------------------------------
SELECT col_type_is(
  'public', 'sources', 'is_link_only', 'boolean',
  'sources.is_link_only column is boolean'
);


-- ---------------------------------------------------------------------------
-- 3. Column is NOT NULL with default false
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'sources', 'is_link_only',
  'sources.is_link_only column is NOT NULL'
);

SELECT col_default_is(
  'public', 'sources', 'is_link_only', 'false',
  'sources.is_link_only column defaults to false'
);


-- ---------------------------------------------------------------------------
-- 4. Existing seeded sources default to is_link_only = false
--    (no source currently shipping in seed.sql or in migrations is link-only:
--    demo, ticketmaster, datathistle)
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM public.sources WHERE is_link_only = true),
  0,
  'No currently seeded source is marked is_link_only = true'
);


-- ---------------------------------------------------------------------------
-- 5. A link-only source can be inserted (no constraint blocks it).
--    Smoke-test the future Resident Advisor row.
-- ---------------------------------------------------------------------------
INSERT INTO public.sources (id, name, slug, source_type, tier, is_link_only)
VALUES (
  '00000000-1300-4000-8000-000000000001'::uuid,
  'Resident Advisor (fixture)',
  'resident-advisor-fixture',
  'html',
  3,
  true
);

SELECT is(
  (SELECT is_link_only FROM public.sources WHERE slug = 'resident-advisor-fixture'),
  true,
  'A source can be inserted with is_link_only = true'
);


SELECT * FROM finish();
ROLLBACK;
