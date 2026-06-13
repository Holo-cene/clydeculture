-- =============================================================================
-- supabase/tests/missing_indexes_test.sql
-- Issue #19 — query performance indexes
--
-- Asserts that three compound/partial indexes exist on `events` to support
-- common Phase 1 query patterns:
--
--   1. Venue page:    WHERE venue_id = $1 AND visibility = 'published'
--                     ORDER BY start_at        → idx_events_venue_date
--   2. Festival page: WHERE festival_id = $1 AND visibility = 'published'
--                     ORDER BY start_at        → idx_events_festival_date
--   3. Moderator queue: WHERE visibility = 'draft' AND confidence >= ?
--                     AND needs_review = false → idx_events_ready_to_publish
--
-- The fourth index from the original DB-06 brief
-- (idx_events_tags_display_trgm on events.tags_display) is intentionally
-- omitted: CC-NEW-1 dropped tags_display from `events`. Tag filtering now
-- goes through `event_tags` (already covered by idx_event_tags_tag).
--
-- How to run (local Supabase with migrations applied):
--   supabase db test
--   -- or, with psql directly:
--   psql "$DATABASE_URL" -f supabase/tests/missing_indexes_test.sql
-- =============================================================================

BEGIN;
SELECT plan(9);


-- Helpers: read an index's column list and partial-predicate expression by
-- name. Defined in pg_temp so they don't leak past the session; rolled back
-- with the test transaction anyway.

CREATE OR REPLACE FUNCTION pg_temp.index_columns(idx_name text)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT array_agg(a.attname::text ORDER BY k.ord)
    FROM pg_class c
    JOIN pg_index ix    ON ix.indexrelid = c.oid
    JOIN pg_class t     ON t.oid = ix.indrelid
    CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
   WHERE c.relname = idx_name;
$$;

CREATE OR REPLACE FUNCTION pg_temp.index_predicate(idx_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_get_expr(ix.indpred, ix.indrelid)
    FROM pg_class c
    JOIN pg_index ix ON ix.indexrelid = c.oid
   WHERE c.relname = idx_name;
$$;


-- =============================================================================
-- SECTION 1: Indexes exist (by name)
-- =============================================================================

SELECT has_index('public', 'events', 'idx_events_venue_date',
  'idx_events_venue_date exists on events');

SELECT has_index('public', 'events', 'idx_events_festival_date',
  'idx_events_festival_date exists on events');

SELECT has_index('public', 'events', 'idx_events_ready_to_publish',
  'idx_events_ready_to_publish exists on events');


-- =============================================================================
-- SECTION 2: Index columns match the documented query patterns
-- =============================================================================

SELECT is(
  pg_temp.index_columns('idx_events_venue_date'),
  ARRAY['venue_id','start_at']::text[],
  'idx_events_venue_date is on (venue_id, start_at) in that order'
);

SELECT is(
  pg_temp.index_columns('idx_events_festival_date'),
  ARRAY['festival_id','start_at']::text[],
  'idx_events_festival_date is on (festival_id, start_at) in that order'
);

SELECT is(
  pg_temp.index_columns('idx_events_ready_to_publish'),
  ARRAY['confidence']::text[],
  'idx_events_ready_to_publish is on (confidence)'
);


-- =============================================================================
-- SECTION 3: Partial-index predicates carry the visibility / status filters
--
-- The predicate is stored as a normalised text expression in pg_index.indpred;
-- we read it back via pg_get_expr and assert it contains the required terms.
-- Substring matches keep the test resilient to planner-level normalisation
-- (e.g. quoting, alias prefixing) but still pin the semantic intent.
-- =============================================================================

SELECT like(
  pg_temp.index_predicate('idx_events_venue_date'),
  '%visibility%published%',
  'idx_events_venue_date is partial on visibility = ''published'''
);

SELECT like(
  pg_temp.index_predicate('idx_events_festival_date'),
  '%visibility%published%festival_id IS NOT NULL%',
  'idx_events_festival_date predicate includes both visibility = ''published'' and festival_id IS NOT NULL'
);

SELECT like(
  pg_temp.index_predicate('idx_events_ready_to_publish'),
  '%visibility%draft%needs_review%',
  'idx_events_ready_to_publish predicate filters visibility = ''draft'' AND needs_review = false'
);


-- =============================================================================
-- FINISH
-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
