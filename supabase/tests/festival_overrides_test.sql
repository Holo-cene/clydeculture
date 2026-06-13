-- =============================================================================
-- supabase/tests/festival_overrides_test.sql
-- Issue #12 — Festival detection: detector + override table + window-mismatch alert
--
-- Asserts that:
--   1. festival_event_overrides table exists with the columns Rule 4 needs.
--   2. (source_id, external_id) is a unique constraint (one override per pair).
--   3. RLS is enabled on festival_event_overrides AND no public read policy
--      exists (operator-only table).
--   4. ingest_alerts.alert_type accepts 'festival_window_mismatch' (and still
--      accepts the existing types).
--   5. ingest_alerts.alert_type still rejects bogus alert types.
--
-- How to run (local Supabase with migrations applied):
--   supabase db test
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(12);


-- =============================================================================
-- SECTION 1: festival_event_overrides table shape
-- =============================================================================

SELECT has_table(
  'public', 'festival_event_overrides',
  'festival_event_overrides table exists'
);

SELECT columns_are(
  'public', 'festival_event_overrides',
  ARRAY[
    'id', 'source_id', 'external_id', 'festival_id',
    'note', 'created_by', 'created_at'
  ],
  'festival_event_overrides has the expected columns'
);

SELECT col_not_null(
  'public', 'festival_event_overrides', 'source_id',
  'source_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'festival_event_overrides', 'external_id',
  'external_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'festival_event_overrides', 'festival_id',
  'festival_id is NOT NULL'
);


-- =============================================================================
-- SECTION 2: uniqueness on (source_id, external_id)
-- =============================================================================

-- pgTAP's col_is_unique() requires the matching unique index name, which can
-- vary; assert directly against information_schema for the constraint.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_festival_override'
      AND conrelid = 'public.festival_event_overrides'::regclass
      AND contype  = 'u'
  ),
  'uq_festival_override unique constraint exists on (source_id, external_id)'
);


-- =============================================================================
-- SECTION 3: RLS — enabled, no public policy
-- =============================================================================

SELECT ok(
  (SELECT relrowsecurity
     FROM pg_class
    WHERE oid = 'public.festival_event_overrides'::regclass),
  'RLS is enabled on festival_event_overrides'
);

SELECT is(
  (SELECT count(*)::int
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'festival_event_overrides'),
  0,
  'festival_event_overrides has no policies (operator-only via service role)'
);


-- =============================================================================
-- SECTION 4: ingest_alerts.alert_type accepts the new type
-- =============================================================================

INSERT INTO public.sources (id, name, slug, source_type, enabled)
VALUES (
  '00000000-c012-0000-0000-000000000001'::uuid,
  'Issue 12 Test Source', 'issue-12-test-source', 'api', true
);

-- New alert type writes successfully.
SELECT lives_ok(
  $$
    INSERT INTO public.ingest_alerts (source_id, alert_type, message)
    VALUES (
      '00000000-c012-0000-0000-000000000001'::uuid,
      'festival_window_mismatch',
      'Festival match ''celtic-connections-2027'' for event src/ext failed window check: event 2026-10-15 outside 2026-01-14–2026-02-04'
    );
  $$,
  'ingest_alerts accepts alert_type = ''festival_window_mismatch'''
);

-- Pre-existing types still accepted (regression).
SELECT lives_ok(
  $$
    INSERT INTO public.ingest_alerts (source_id, alert_type, message)
    VALUES (
      '00000000-c012-0000-0000-000000000001'::uuid,
      'count_drop',
      'still allowed'
    );
  $$,
  'ingest_alerts still accepts alert_type = ''count_drop'''
);

SELECT lives_ok(
  $$
    INSERT INTO public.ingest_alerts (source_id, alert_type, message)
    VALUES (
      '00000000-c012-0000-0000-000000000001'::uuid,
      'cold_start_zero',
      'still allowed'
    );
  $$,
  'ingest_alerts still accepts alert_type = ''cold_start_zero'''
);

-- Bogus alert type is rejected.
SELECT throws_ok(
  $$
    INSERT INTO public.ingest_alerts (source_id, alert_type, message)
    VALUES (
      '00000000-c012-0000-0000-000000000001'::uuid,
      'not_a_real_type',
      'should fail'
    );
  $$,
  '23514',
  NULL,
  'ingest_alerts rejects unknown alert_type values'
);


SELECT * FROM finish();
ROLLBACK;
