-- =============================================================================
-- supabase/tests/auto_create_venue_test.sql
-- Issue #17 — harden auto_create_venue() slug collision loop.
--
-- Asserts:
--   1. First call writes the plain base slug.
--   2. Sequential collisions yield -2, -3, -4 (deterministic counter) —
--      NOT a random numeric suffix and NOT compounding suffixes like
--      `venue-342-17-891`.
--   3. The contention scenario (a dense block of pre-existing collisions)
--      resolves to the next sequential counter, not a random suffix.
--   4. Counter overflow raises an explicit exception rather than spinning
--      indefinitely or producing pathological slugs.
--
-- How to run:
--   supabase db test
--   -- or with the local fallback:
--   npx supabase db test
--
-- Prerequisites:
--   supabase start          (local instance running)
--   supabase db reset       (all migrations applied)
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(9);


-- =============================================================================
-- FIXTURE SETUP — UUID namespace 00000000-0017-* identifies issue #17 rows.
-- =============================================================================

-- Sanity: function exists and is callable.
SELECT has_function(
  'public',
  'auto_create_venue',
  ARRAY['text', 'text'],
  'auto_create_venue(text, text) exists'
);


-- ---------------------------------------------------------------------------
-- 1. First call writes the plain base slug (no suffix).
-- ---------------------------------------------------------------------------
-- NB: auto_create_venue is VOLATILE and INSERTs. Calling it inside
-- `WHERE id = auto_create_venue(...)` re-evaluates it once per scanned row
-- (multiple inserts, no match). Capture the returned id once with \gset, then
-- read the slug back in a separate statement so the insert is visible.
SELECT auto_create_venue('Issue Seventeen Venue A') AS va_first \gset
SELECT is(
  (SELECT slug FROM public.venues WHERE id = :'va_first'),
  'issue-seventeen-venue-a',
  'first auto_create_venue call writes the plain base slug'
);


-- ---------------------------------------------------------------------------
-- 2. Second call with the same name produces a deterministic -2 suffix —
--    NOT a random 0-999 suffix.
-- ---------------------------------------------------------------------------
SELECT auto_create_venue('Issue Seventeen Venue A') AS va_second \gset
SELECT is(
  (SELECT slug FROM public.venues WHERE id = :'va_second'),
  'issue-seventeen-venue-a-2',
  'second collision yields -2 (deterministic counter, not random)'
);


-- ---------------------------------------------------------------------------
-- 3. Third call yields -3 (counter increments by 1, no compounding).
-- ---------------------------------------------------------------------------
SELECT auto_create_venue('Issue Seventeen Venue A') AS va_third \gset
SELECT is(
  (SELECT slug FROM public.venues WHERE id = :'va_third'),
  'issue-seventeen-venue-a-3',
  'third collision yields -3 (sequential counter, no compounding suffixes)'
);


-- ---------------------------------------------------------------------------
-- 4. Slugs never contain a compounded random tail (`-NNN-NNN`).
--    The legacy implementation appended `'-' || floor(random()*1000)` per
--    iteration; a regression would surface here.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int
   FROM public.venues
   WHERE slug LIKE 'issue-seventeen-venue-a%'
     AND slug ~ '-[0-9]+-[0-9]+$'),
  0,
  'no slug for Venue A contains a compounded numeric tail (random suffix regression)'
);


-- ---------------------------------------------------------------------------
-- 5. Contention scenario — pre-populate a dense block of collisions
--    (slug, slug-2, ..., slug-9) and confirm the next call jumps to -10.
-- ---------------------------------------------------------------------------
INSERT INTO public.venues (id, name, slug, status, auto_created, needs_review)
SELECT
  ('00000000-0017-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'Issue Seventeen Venue B' || CASE WHEN i = 1 THEN '' ELSE ' (' || i || ')' END,
  'issue-seventeen-venue-b' || CASE WHEN i = 1 THEN '' ELSE '-' || i END,
  'pending',
  true,
  true
FROM generate_series(1, 9) AS i;

SELECT auto_create_venue('Issue Seventeen Venue B') AS vb_contention \gset
SELECT is(
  (SELECT slug FROM public.venues WHERE id = :'vb_contention'),
  'issue-seventeen-venue-b-10',
  'dense contention block resolves to the next sequential counter (-10)'
);


-- ---------------------------------------------------------------------------
-- 6. Suffix-format assertion — every slug for the contention block matches
--    the canonical pattern `base(-[0-9]+)?` with NO secondary suffix.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int
   FROM public.venues
   WHERE slug LIKE 'issue-seventeen-venue-b%'
     AND slug !~ '^issue-seventeen-venue-b(-[0-9]+)?$'),
  0,
  'every Venue B slug matches the canonical base(-[0-9]+)? pattern'
);


-- ---------------------------------------------------------------------------
-- 7. Overflow — pre-fill the entire counter range (-2 through -100) so the
--    next call exhausts the loop and must raise rather than loop forever.
--    The exception message names the input that could not be resolved.
-- ---------------------------------------------------------------------------
INSERT INTO public.venues (id, name, slug, status, auto_created, needs_review)
SELECT
  ('00000000-0017-0001-0000-' || lpad(i::text, 12, '0'))::uuid,
  'Issue Seventeen Venue C' || CASE WHEN i = 1 THEN '' ELSE ' (' || i || ')' END,
  'issue-seventeen-venue-c' || CASE WHEN i = 1 THEN '' ELSE '-' || i END,
  'pending',
  true,
  true
FROM generate_series(1, 100) AS i;

SELECT throws_like(
  $$ SELECT auto_create_venue('Issue Seventeen Venue C') $$,
  '%could not generate unique slug%',
  'overflow raises a descriptive exception (bounded loop, no spin)'
);


-- ---------------------------------------------------------------------------
-- 8. Overflow path does NOT insert a venues row (transactional guarantee).
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.venues
   WHERE slug LIKE 'issue-seventeen-venue-c%'),
  100,
  'overflow leaves the venues table untouched (no partial insert)'
);


-- =============================================================================
-- FINISH
-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
