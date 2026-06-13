-- =============================================================================
-- supabase/tests/venue_normalisation_parity_test.sql
-- Issue #10 — pin TS ↔ SQL venue normalisation parity.
--
-- `normaliseVenueName()` in packages/core/src/normalise/normalise.ts and
-- `resolve_venue()` in
-- supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql must
-- produce identical canonical forms for the same input. If the two sides
-- drift, the TS connector path and the SQL trigger path map the same venue
-- name to different matchable strings — silently breaking dedup.
--
-- Strategy:
--   1. Insert venues whose stored `name` is exactly the canonical form that
--      `normaliseVenueName()` produces in TypeScript.
--   2. For each variation (with casing, apostrophes, parentheses, multi-space,
--      leading/trailing whitespace), call `resolve_venue(variation)` and assert
--      it returns the matching venue UUID.
--
-- Because `resolve_venue()` normalises *both* the input and `venues.name` with
-- the same expression, a match against a venue stored under the canonical TS
-- form proves the SQL normalisation collapses the variation to the same string
-- TS does. This pins parity end-to-end without exposing the internal expression.
--
-- The input/expected table mirrors `VENUE_PARITY_CASES` in
-- packages/core/src/normalise/normalise.test.ts. If you change one, change
-- the other.
--
-- How to run (local Supabase with all migrations applied):
--
--   supabase db test
--   -- or, if supabase is not in PATH:
--   npx supabase db test
--   -- or, directly with psql (pgTAP must already be installed):
--   psql "$DATABASE_URL" -f supabase/tests/venue_normalisation_parity_test.sql
--
-- Prerequisites:
--   supabase start    (local instance running)
--   supabase db reset (schema_v5_initial + cc_new_1 corrections applied)
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(7);

-- ---------------------------------------------------------------------------
-- FIXTURE SETUP — UUID namespace 00000000-0010-* identifies issue #10 fixtures.
-- venues.name is the canonical form produced by TS normaliseVenueName().
-- slugs are arbitrary but unique within the test set.
-- ---------------------------------------------------------------------------

INSERT INTO public.venues (id, name, slug, status, city)
VALUES
  ('00000000-0010-0000-0000-000000000001'::uuid,
   'the old hairdressers',
   'issue-10-old-hairdressers',
   'active',
   'Glasgow'),
  ('00000000-0010-0000-0000-000000000002'::uuid,
   'swg3 glasgow',
   'issue-10-swg3-glasgow',
   'active',
   'Glasgow'),
  ('00000000-0010-0000-0000-000000000003'::uuid,
   'st lukes',
   'issue-10-st-lukes',
   'active',
   'Glasgow'),
  ('00000000-0010-0000-0000-000000000004'::uuid,
   'the flying ducks bar',
   'issue-10-flying-ducks-bar',
   'active',
   'Glasgow'),
  ('00000000-0010-0000-0000-000000000005'::uuid,
   'the barrowlands',
   'issue-10-barrowlands',
   'active',
   'Glasgow'),
  ('00000000-0010-0000-0000-000000000006'::uuid,
   'mono bar',
   'issue-10-mono-bar',
   'active',
   'Glasgow');


-- ---------------------------------------------------------------------------
-- 1. Apostrophe — the canonical example called out in issue #10
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue(E'The Old Hairdresser\'s'),
  '00000000-0010-0000-0000-000000000001'::uuid,
  'resolve_venue strips apostrophe: "The Old Hairdresser''s" → "the old hairdressers"'
);

-- ---------------------------------------------------------------------------
-- 2. Parentheses + casing
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue('SWG3 (Glasgow)'),
  '00000000-0010-0000-0000-000000000002'::uuid,
  'resolve_venue strips parens and lowercases: "SWG3 (Glasgow)" → "swg3 glasgow"'
);

-- ---------------------------------------------------------------------------
-- 3. Apostrophe in shorter name
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue(E'St Luke\'s'),
  '00000000-0010-0000-0000-000000000003'::uuid,
  'resolve_venue strips apostrophe: "St Luke''s" → "st lukes"'
);

-- ---------------------------------------------------------------------------
-- 4. Apostrophe inside a multi-word name
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue(E'The Flying Duck\'s Bar'),
  '00000000-0010-0000-0000-000000000004'::uuid,
  'resolve_venue strips internal apostrophe: "The Flying Duck''s Bar" → "the flying ducks bar"'
);

-- ---------------------------------------------------------------------------
-- 5. Leading + trailing whitespace
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue('  The Barrowlands  '),
  '00000000-0010-0000-0000-000000000005'::uuid,
  'resolve_venue trims leading/trailing whitespace: "  The Barrowlands  " → "the barrowlands"'
);

-- ---------------------------------------------------------------------------
-- 6. Collapsed internal multi-space
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue('Mono   Bar'),
  '00000000-0010-0000-0000-000000000006'::uuid,
  'resolve_venue collapses internal whitespace: "Mono   Bar" → "mono bar"'
);

-- ---------------------------------------------------------------------------
-- 7. Empty / whitespace-only input returns NULL (no false match)
-- ---------------------------------------------------------------------------
SELECT is(
  resolve_venue('   '),
  NULL::uuid,
  'resolve_venue returns NULL for whitespace-only input'
);

SELECT * FROM finish();
ROLLBACK;
