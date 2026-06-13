-- =============================================================================
-- supabase/tests/event_links_rls_test.sql
-- ADR 0005 A1 (issue #23) — event_links view + public RLS
--
-- Asserts that:
--   1. anon sees every permitted (source + ticket) link for a published event
--      whose confidence clears the 60 threshold.
--   2. anon sees zero links for events that are draft / hidden / archived,
--      or whose confidence is below 60.
--   3. anon sees zero links when the underlying external_events row is
--      soft-deleted (is_deleted = true).
--   4. The internal columns of external_events (raw, last_seen_at, etc.) stay
--      service-role only — the view exposes only the permitted projection,
--      and the underlying table remains default-deny for anon.
--   5. Service-role / postgres callers can read the view freely.
--
-- How to run (local Supabase with all migrations applied):
--
--   supabase db test
--   -- or directly with psql (pgTAP must already be installed):
--   psql "$DATABASE_URL" -f supabase/tests/event_links_rls_test.sql
--
-- All fixture data is inside a transaction that is ROLLBACK'd at the end.
-- UUID namespace 00000000-a100-* identifies A1 test rows.
-- =============================================================================

BEGIN;
SELECT plan(13);


-- =============================================================================
-- FIXTURE SETUP
-- =============================================================================

-- Two distinct sources so we can verify cross-source link aggregation
-- and source-labelled output.
INSERT INTO public.sources (id, name, slug, source_type)
VALUES
  ('00000000-a100-0000-0000-000000000001'::uuid,
   'A1 Test Source One',   'a1-test-source-one',   'api'),
  ('00000000-a100-0000-0000-000000000002'::uuid,
   'A1 Test Source Two',   'a1-test-source-two',   'rss');

INSERT INTO public.venues (id, name, slug, status)
VALUES ('00000000-a100-0000-0000-000000000010'::uuid,
        'A1 Active Venue', 'a1-active-venue', 'active');

-- Four parent events covering the visibility / confidence matrix:
--   ...020  published + confidence 80 → visible in view to anon
--   ...021  published + confidence 50 → hidden in view (below threshold)
--   ...022  draft     + confidence 90 → hidden in view (wrong visibility)
--   ...023  archived  + confidence 80 → hidden in view (wrong visibility)
INSERT INTO public.events (id, title, normalised_title, slug, start_at,
                           event_type_id, visibility, confidence, dedupe_key)
VALUES
  ('00000000-a100-0000-0000-000000000020'::uuid,
   'A1 High Confidence Published', 'a1 high confidence published',
   'a1-high-conf-pub', now() + interval '7 days', 1, 'published', 80,
   'a1-dk-hc-pub'),
  ('00000000-a100-0000-0000-000000000021'::uuid,
   'A1 Low Confidence Published',  'a1 low confidence published',
   'a1-low-conf-pub',  now() + interval '7 days', 1, 'published', 50,
   'a1-dk-lc-pub'),
  ('00000000-a100-0000-0000-000000000022'::uuid,
   'A1 Draft High Confidence',     'a1 draft high confidence',
   'a1-draft-hc',      now() + interval '7 days', 1, 'draft',     90,
   'a1-dk-draft-hc'),
  ('00000000-a100-0000-0000-000000000023'::uuid,
   'A1 Archived High Confidence',  'a1 archived high confidence',
   'a1-archived-hc',   now() + interval '7 days', 1, 'archived',  80,
   'a1-dk-arch-hc');

-- External events for the published/high-confidence event (...020):
--   - Source 1: both external_url and ticket_url_guess  → 2 links
--   - Source 2: only external_url                       → 1 link
--   Total visible to anon: 3 link rows.
INSERT INTO public.external_events (
  id, source_id, external_id, external_url,
  ticket_url_guess, ticket_url_label_guess,
  event_id, is_deleted
) VALUES
  ('00000000-a100-0000-0000-000000000030'::uuid,
   '00000000-a100-0000-0000-000000000001'::uuid,
   'a1-ext-001',
   'https://source-one.example/events/abc',
   'https://source-one.example/buy/abc',
   'Buy on Source One',
   '00000000-a100-0000-0000-000000000020'::uuid,
   false),
  ('00000000-a100-0000-0000-000000000031'::uuid,
   '00000000-a100-0000-0000-000000000002'::uuid,
   'a1-ext-002',
   'https://source-two.example/events/abc',
   NULL,
   NULL,
   '00000000-a100-0000-0000-000000000020'::uuid,
   false);

-- External events for hidden parents (each should contribute zero links):
--   - low-confidence (021)
--   - draft (022)
--   - archived (023)
INSERT INTO public.external_events (
  id, source_id, external_id, external_url, ticket_url_guess,
  event_id, is_deleted
) VALUES
  ('00000000-a100-0000-0000-000000000040'::uuid,
   '00000000-a100-0000-0000-000000000001'::uuid,
   'a1-ext-040',
   'https://source-one.example/events/low-conf',
   'https://source-one.example/buy/low-conf',
   '00000000-a100-0000-0000-000000000021'::uuid,
   false),
  ('00000000-a100-0000-0000-000000000041'::uuid,
   '00000000-a100-0000-0000-000000000001'::uuid,
   'a1-ext-041',
   'https://source-one.example/events/draft',
   'https://source-one.example/buy/draft',
   '00000000-a100-0000-0000-000000000022'::uuid,
   false),
  ('00000000-a100-0000-0000-000000000042'::uuid,
   '00000000-a100-0000-0000-000000000001'::uuid,
   'a1-ext-042',
   'https://source-one.example/events/archived',
   'https://source-one.example/buy/archived',
   '00000000-a100-0000-0000-000000000023'::uuid,
   false);

-- One soft-deleted external event for the published parent — should also be
-- excluded from the view even though the parent is otherwise visible.
INSERT INTO public.external_events (
  id, source_id, external_id, external_url, ticket_url_guess,
  event_id, is_deleted
) VALUES
  ('00000000-a100-0000-0000-000000000050'::uuid,
   '00000000-a100-0000-0000-000000000002'::uuid,
   'a1-ext-050',
   'https://source-two.example/events/abc-stale',
   'https://source-two.example/buy/abc-stale',
   '00000000-a100-0000-0000-000000000020'::uuid,
   true);


-- =============================================================================
-- SECTION 1: Published + high-confidence parent (tests 1–5)
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid),
  3,
  'anon: published+confident event exposes every permitted link (2 from source one, 1 from source two)'
);

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid
      AND kind = 'source'),
  2,
  'anon: source links surface once per external row that has external_url set'
);

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid
      AND kind = 'ticket'),
  1,
  'anon: ticket links only surface when ticket_url_guess is set on the external row'
);

SELECT is(
  (SELECT label FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid
      AND kind = 'ticket'
    LIMIT 1),
  'Buy on Source One',
  'anon: ticket link label uses ticket_url_label_guess when present'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.event_links
     WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid
       AND kind = 'source'
       AND source_slug = 'a1-test-source-two'
       AND url = 'https://source-two.example/events/abc'
  ),
  'anon: link rows are labelled with the originating source slug'
);

RESET ROLE;


-- =============================================================================
-- SECTION 2: Hidden parents (tests 6–8)
-- =============================================================================

SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000021'::uuid),
  0,
  'anon: published-but-low-confidence parent contributes zero links'
);

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000022'::uuid),
  0,
  'anon: draft parent contributes zero links regardless of confidence'
);

SELECT is(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000023'::uuid),
  0,
  'anon: archived parent contributes zero links'
);

RESET ROLE;


-- =============================================================================
-- SECTION 3: Soft-deleted external rows are excluded (test 9)
-- =============================================================================

SET ROLE anon;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.event_links
     WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid
       AND url IN (
         'https://source-two.example/events/abc-stale',
         'https://source-two.example/buy/abc-stale'
       )
  ),
  'anon: soft-deleted external_events (is_deleted = true) are excluded from the view'
);

RESET ROLE;


-- =============================================================================
-- SECTION 4: Internal columns stay service-role only (tests 10–11)
-- =============================================================================

SET ROLE anon;

-- external_events itself remains default-deny — verifying defence-in-depth
-- so that even if a future migration changes the view, the underlying table
-- still shields its internal columns.
SELECT is(
  (SELECT count(*)::int FROM public.external_events
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid),
  0,
  'anon: external_events remains default-deny even when the parent event is public'
);

-- The view's columns are exactly the permitted projection: no raw, no
-- last_seen_at, no first_seen_at, no availability_guess.
SELECT bag_eq(
  $$ SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_links' $$,
  $$ VALUES
       ('event_id'),
       ('kind'),
       ('url'),
       ('source_id'),
       ('source_name'),
       ('source_slug'),
       ('label'),
       ('sort_order')
  $$,
  'event_links view exposes only the permitted projection columns'
);

RESET ROLE;


-- =============================================================================
-- SECTION 5: Service-role visibility (tests 12–13)
-- =============================================================================

-- postgres (superuser) — sanity check that the view is readable for ops use.
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid),
  '>=',
  3,
  'postgres: service-role-equivalent role sees at least the anon-visible links'
);

SET ROLE service_role;

SELECT cmp_ok(
  (SELECT count(*)::int FROM public.event_links
    WHERE event_id = '00000000-a100-0000-0000-000000000020'::uuid),
  '>=',
  3,
  'service_role: can read event_links (Trigger.dev workers + Studio)'
);

RESET ROLE;


-- =============================================================================
-- FINISH
-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
