-- =============================================================================
-- supabase/tests/rls_internal_tables_test.sql
-- A2 — RLS deny and policy boundary tests
--
-- Asserts that:
--   1. Eight internal operational/config tables are default-deny for the anon role.
--   2. The events confidence threshold (>= 60) is enforced at both boundaries.
--   3. The venue_aliases parent-status policy is enforced correctly.
--   4. The event_tags policy correctly inherits the confidence threshold
--      via PostgreSQL recursive RLS (see Section 4 notes).
--   5. event_submissions blocks anon SELECT, accepts only public-safe anon
--      submissions, and rejects moderation/review fields.
--
-- How to run (local Supabase with A1 migration applied):
--
--   supabase db test
--   -- or, if supabase is not in PATH:
--   npx supabase db test
--   -- or, directly with psql (pgTAP must already be installed):
--   psql "$DATABASE_URL" -f supabase/tests/rls_internal_tables_test.sql
--
-- Prerequisites:
--   supabase start   (local instance running)
--   supabase db reset   (both migrations applied — schema_v5_initial + cc_new_1)
--
-- Role pattern used throughout:
--   Connect as postgres (superuser) to insert fixtures and call pgTAP functions.
--   SET ROLE anon before each group of RLS-sensitive assertions.
--   RESET ROLE after each group.
--   Superusers bypass RLS — all anon-visibility checks MUST run after SET ROLE anon.
--   pgTAP functions (is, pass, finish) are SECURITY DEFINER and are callable by anon.
--   Subquery arguments (e.g. SELECT count(*) FROM sources) are evaluated in the
--   caller's role context, so RLS is applied correctly.
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- =============================================================================

BEGIN;
SELECT plan(25);


-- =============================================================================
-- FIXTURE SETUP
-- Inserts as postgres (superuser); all rolled back at end of transaction.
-- UUID namespace 00000000-a200-*  identifies A2 test rows.
-- =============================================================================

INSERT INTO public.sources (id, name, slug, source_type)
VALUES (
  '00000000-a200-0000-0000-000000000001'::uuid,
  'A2 Test Source', 'a2-test-source', 'api'
);

INSERT INTO public.venues (id, name, slug, status)
VALUES
  ('00000000-a200-0000-0000-000000000010'::uuid, 'A2 Active Venue',  'a2-active-venue',  'active'),
  ('00000000-a200-0000-0000-000000000011'::uuid, 'A2 Pending Venue', 'a2-pending-venue', 'pending'),
  ('00000000-a200-0000-0000-000000000012'::uuid, 'A2 Closed Venue',  'a2-closed-venue',  'closed');

INSERT INTO public.venue_aliases (venue_id, alias, normalised_alias)
VALUES
  ('00000000-a200-0000-0000-000000000010'::uuid, 'A2 Active Venue',  'a2 active venue'),
  ('00000000-a200-0000-0000-000000000011'::uuid, 'A2 Pending Venue', 'a2 pending venue'),
  ('00000000-a200-0000-0000-000000000012'::uuid, 'A2 Closed Venue',  'a2 closed venue');

-- Three events covering the confidence / visibility boundary matrix:
--   published + confidence 80  → should be visible  to anon
--   published + confidence 50  → should be hidden    from anon (below threshold)
--   draft     + confidence 90  → should be hidden    from anon (wrong visibility)
INSERT INTO public.events (id, title, normalised_title, slug, start_at, event_type_id, visibility, confidence, dedupe_key)
VALUES
  ('00000000-a200-0000-0000-000000000020'::uuid,
   'A2 High Confidence Published', 'a2 high confidence published',
   'a2-high-conf-pub', now() + interval '7 days', 1, 'published', 80, 'a2-dk-hc-pub'),

  ('00000000-a200-0000-0000-000000000021'::uuid,
   'A2 Low Confidence Published', 'a2 low confidence published',
   'a2-low-conf-pub', now() + interval '7 days', 1, 'published', 50, 'a2-dk-lc-pub'),

  ('00000000-a200-0000-0000-000000000022'::uuid,
   'A2 Draft High Confidence', 'a2 draft high confidence',
   'a2-draft-hc', now() + interval '7 days', 1, 'draft', 90, 'a2-dk-draft-hc');

-- Tag used for event_tags boundary tests (one tag associated with two events).
INSERT INTO public.tags (slug, label) VALUES ('a2-test-tag', 'A2 Test Tag');

INSERT INTO public.event_tags (event_id, tag_id)
  SELECT '00000000-a200-0000-0000-000000000020'::uuid, id
  FROM public.tags WHERE slug = 'a2-test-tag';

INSERT INTO public.event_tags (event_id, tag_id)
  SELECT '00000000-a200-0000-0000-000000000021'::uuid, id
  FROM public.tags WHERE slug = 'a2-test-tag';

-- One row in each internal table so the deny test proves RLS, not empty table.
INSERT INTO public.external_events (id, source_id, external_id)
VALUES ('00000000-a200-0000-0000-000000000030'::uuid,
        '00000000-a200-0000-0000-000000000001'::uuid, 'a2-ext-001');

INSERT INTO public.ingest_runs (id, source_id)
VALUES ('00000000-a200-0000-0000-000000000040'::uuid,
        '00000000-a200-0000-0000-000000000001'::uuid);

INSERT INTO public.ingest_alerts (id, source_id, alert_type)
VALUES ('00000000-a200-0000-0000-000000000050'::uuid,
        '00000000-a200-0000-0000-000000000001'::uuid, 'count_drop');

INSERT INTO public.event_merge_candidates (id, event_a_id, event_b_id)
VALUES ('00000000-a200-0000-0000-000000000060'::uuid,
        '00000000-a200-0000-0000-000000000020'::uuid,
        '00000000-a200-0000-0000-000000000021'::uuid);

INSERT INTO public.venue_claims (id, venue_id, claimant_email)
VALUES ('00000000-a200-0000-0000-000000000070'::uuid,
        '00000000-a200-0000-0000-000000000010'::uuid, 'claimant@example.com');

INSERT INTO public.moderation_log (id, entity_type, entity_id, action)
VALUES ('00000000-a200-0000-0000-000000000080'::uuid,
        'event', '00000000-a200-0000-0000-000000000020'::uuid, 'approved');

INSERT INTO public.event_submissions (id, title, start_at)
VALUES ('00000000-a200-0000-0000-000000000090'::uuid,
        'A2 Test Submission', now() + interval '7 days');

CREATE OR REPLACE FUNCTION pg_temp.a2_rejects_insert(p_sql text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN true;
END;
$$;


-- =============================================================================
-- SECTION 1: Internal tables — public roles hold no grant (tests 1–8)
--
-- Tables: sources, external_events, ingest_runs, ingest_alerts,
--         event_merge_candidates, moderation_log, venue_claims,
--         source_type_category_map.
--
-- Least privilege: anon and authenticated have NO privilege on these internal
-- operational/config tables (20260613000003_explicit_role_grants revokes all);
-- ingestion runs as service_role, which bypasses RLS. RLS is also enabled with
-- no SELECT policy as a backstop.
--
-- We assert the absence of any SELECT grant via the catalog (as the test
-- postgres role) rather than `SET ROLE anon; SELECT count(*)`. The grant model
-- is the deterministic, image-independent contract: on Supabase images that do
-- not grant anon by default, a `SET ROLE anon; SELECT` raises "permission
-- denied" rather than returning 0, so a count-based check is not portable.
-- =============================================================================

SELECT ok(
  NOT has_table_privilege('anon', 'public.sources', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.sources', 'SELECT'),
  'anon/authenticated: no SELECT grant on sources (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.external_events', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.external_events', 'SELECT'),
  'anon/authenticated: no SELECT grant on external_events (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.ingest_runs', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.ingest_runs', 'SELECT'),
  'anon/authenticated: no SELECT grant on ingest_runs (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.ingest_alerts', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.ingest_alerts', 'SELECT'),
  'anon/authenticated: no SELECT grant on ingest_alerts (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.event_merge_candidates', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.event_merge_candidates', 'SELECT'),
  'anon/authenticated: no SELECT grant on event_merge_candidates (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.moderation_log', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.moderation_log', 'SELECT'),
  'anon/authenticated: no SELECT grant on moderation_log (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.venue_claims', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.venue_claims', 'SELECT'),
  'anon/authenticated: no SELECT grant on venue_claims (internal)'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.source_type_category_map', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.source_type_category_map', 'SELECT'),
  'anon/authenticated: no SELECT grant on source_type_category_map (internal)'
);


-- =============================================================================
-- SECTION 2: events — confidence threshold boundary (tests 8–10)
--
-- Policy (after A1 migration correction):
--   visibility = 'published' AND confidence >= 60
--
-- Three fixture events:
--   id ...020  published + confidence 80 → visible
--   id ...021  published + confidence 50 → hidden (confidence below threshold)
--   id ...022  draft     + confidence 90 → hidden (wrong visibility)
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.events
   WHERE id = '00000000-a200-0000-0000-000000000020'::uuid),
  1,
  'anon: published event with confidence >= 60 is visible'
);

SELECT is(
  (SELECT count(*)::int FROM public.events
   WHERE id = '00000000-a200-0000-0000-000000000021'::uuid),
  0,
  'anon: published event with confidence < 60 is hidden'
);

SELECT is(
  (SELECT count(*)::int FROM public.events
   WHERE id = '00000000-a200-0000-0000-000000000022'::uuid),
  0,
  'anon: draft event is hidden regardless of confidence level'
);

RESET ROLE;


-- =============================================================================
-- SECTION 3: venue_aliases — parent venue status boundary (tests 11–13)
--
-- Policy (after A1 migration correction):
--   EXISTS (
--     SELECT 1 FROM venues
--     WHERE venues.id = venue_aliases.venue_id
--       AND venues.status IN ('active', 'temporary')
--   )
--
-- Three fixture aliases cover all non-public statuses:
--   a2-active-venue   (active)  → visible
--   a2-pending-venue  (pending) → hidden
--   a2-closed-venue   (closed)  → hidden
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.venue_aliases
   WHERE normalised_alias = 'a2 active venue'),
  1,
  'anon: venue_alias for active parent venue is visible'
);

SELECT is(
  (SELECT count(*)::int FROM public.venue_aliases
   WHERE normalised_alias = 'a2 pending venue'),
  0,
  'anon: venue_alias for pending parent venue is hidden'
);

SELECT is(
  (SELECT count(*)::int FROM public.venue_aliases
   WHERE normalised_alias = 'a2 closed venue'),
  0,
  'anon: venue_alias for closed parent venue is hidden'
);

RESET ROLE;


-- =============================================================================
-- SECTION 4: event_tags — confidence threshold boundary (tests 14–15)
--
-- Policy text (initial migration, unchanged by A1):
--   EXISTS (
--     SELECT 1 FROM events
--     WHERE events.id = event_tags.event_id
--       AND events.visibility = 'published'
--   )
--
-- The policy text does NOT explicitly check confidence >= 60.
-- However, PostgreSQL applies RLS recursively: the subquery inside the USING
-- clause runs under the current role (anon), so the events table's own RLS
-- policy (visibility = 'published' AND confidence >= 60) also filters the
-- subquery result.
--
-- Net result: anon sees event_tags only when the parent event is BOTH published
-- AND has confidence >= 60.  Both tests below PASS.
--
-- The protection is real but IMPLICIT — it depends on the events RLS policy
-- remaining in sync.  A follow-up migration should make the confidence check
-- explicit in the event_tags policy for defence-in-depth and clarity:
--
--   DROP POLICY "Public read event_tags" ON event_tags;
--   CREATE POLICY "Public read event_tags" ON event_tags FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM events
--       WHERE events.id = event_tags.event_id
--         AND events.visibility = 'published'
--         AND events.confidence >= 60
--     )
--   );
--
-- Until that migration lands, a change to the events RLS policy that removes
-- the confidence check would silently break the event_tags protection too.
-- Tracking: recommend creating a migration task (A3 or similar) for this fix.
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.event_tags
   WHERE event_id = '00000000-a200-0000-0000-000000000020'::uuid),
  1,
  'anon: event_tags visible for published event with confidence >= 60'
);

SELECT is(
  (SELECT count(*)::int FROM public.event_tags
   WHERE event_id = '00000000-a200-0000-0000-000000000021'::uuid),
  0,
  'anon: event_tags hidden for published event with confidence < 60 (inherited via recursive RLS)'
);

RESET ROLE;


-- =============================================================================
-- SECTION 4 CATALOG CHECK: event_tags policy definition (test 18)
--
-- A catalog assertion (runs as postgres superuser; no SET ROLE needed) that
-- confirms the event_tags SELECT policy USING expression explicitly references
-- both 'confidence' and '60'.
--
-- This test is RED against the current schema — the policy only checks
-- visibility = 'published' — and GREEN after the A3 migration is applied.
--
-- Two separate LIKE checks are used rather than one exact string to tolerate
-- any differences in how PostgreSQL renders the expression (casts, spacing,
-- parentheses) in the pg_policies.qual column.
-- =============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'event_tags'
      AND cmd        = 'SELECT'
      AND qual LIKE '%confidence%'
      AND qual LIKE '%60%'
  ),
  'event_tags SELECT policy explicitly references confidence threshold (defence-in-depth, not relying on recursive RLS)'
);


-- =============================================================================
-- SECTION 5: event_submissions — SELECT deny and INSERT gate (tests 18–25)
--
-- No SELECT policy exists → default-deny for anon.
-- INSERT policy must allow minimal public submissions while preventing anon
-- callers from setting moderation/review linkage fields.
-- =============================================================================

SET ROLE anon;

INSERT INTO public.event_submissions (id, title, start_at)
VALUES (
  '00000000-a200-0000-0000-000000000091'::uuid,
  'A2 Public Submission',
  now() + interval '8 days'
);

RESET ROLE;

SELECT is(
  (SELECT status FROM public.event_submissions
   WHERE id = '00000000-a200-0000-0000-000000000091'::uuid),
  'pending',
  'anon: minimal valid event_submissions insert succeeds and remains pending'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.event_submissions', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.event_submissions', 'SELECT'),
  'anon/authenticated: event_submissions is SELECT-deny (no SELECT grant)'
);

SET ROLE anon;

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title, start_at, status)
    VALUES (
      '00000000-a200-0000-0000-000000000092'::uuid,
      'A2 Forbidden Status',
      now() + interval '8 days',
      'approved'
    )
  $sql$),
  'anon: event_submissions insert cannot set status'
);

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title, start_at, reviewed_at)
    VALUES (
      '00000000-a200-0000-0000-000000000093'::uuid,
      'A2 Forbidden Reviewed At',
      now() + interval '8 days',
      now()
    )
  $sql$),
  'anon: event_submissions insert cannot set reviewed_at'
);

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title, start_at, reviewed_by)
    VALUES (
      '00000000-a200-0000-0000-000000000094'::uuid,
      'A2 Forbidden Reviewed By',
      now() + interval '8 days',
      '00000000-a200-0000-0000-000000000099'::uuid
    )
  $sql$),
  'anon: event_submissions insert cannot set reviewed_by'
);

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title, start_at, event_id)
    VALUES (
      '00000000-a200-0000-0000-000000000095'::uuid,
      'A2 Forbidden Event Link',
      now() + interval '8 days',
      '00000000-a200-0000-0000-000000000020'::uuid
    )
  $sql$),
  'anon: event_submissions insert cannot set event_id'
);

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title, start_at)
    VALUES (
      '00000000-a200-0000-0000-000000000096'::uuid,
      '   ',
      now() + interval '8 days'
    )
  $sql$),
  'anon: event_submissions insert rejects blank title'
);

SELECT ok(
  pg_temp.a2_rejects_insert($sql$
    INSERT INTO public.event_submissions (id, title)
    VALUES (
      '00000000-a200-0000-0000-000000000097'::uuid,
      'A2 Missing Start'
    )
  $sql$),
  'anon: event_submissions insert rejects missing start_at'
);

RESET ROLE;


-- =============================================================================
-- FINISH
-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
