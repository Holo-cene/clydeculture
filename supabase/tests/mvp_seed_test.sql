-- =============================================================================
-- supabase/tests/mvp_seed_test.sql
-- MVP proof-of-concept seed checks.
--
-- These assertions depend on supabase/seed.sql being applied by
-- `supabase db reset`, and prove the demo directory has enough public data to
-- evaluate the vertical slice.
-- =============================================================================

BEGIN;
SELECT plan(5);

SELECT ok(
  (
    SELECT count(*) >= 10
    FROM public.events
    WHERE visibility = 'published'
      AND confidence >= 60
      AND primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  'MVP seed provides at least 10 published demo-visible events'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.events
    WHERE primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  (
    SELECT count(distinct dedupe_key)
    FROM public.events
    WHERE primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  'MVP seed does not duplicate canonical events by dedupe_key'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.external_events
    WHERE source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  (
    SELECT count(distinct external_id)
    FROM public.external_events
    WHERE source_id = '00000000-0600-4000-8000-000000000001'::uuid
  ),
  'MVP seed does not duplicate external events by source external_id'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.events e
    JOIN public.venues v on v.id = e.venue_id
    JOIN public.event_types et on et.id = e.event_type_id
    WHERE e.primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
      AND e.visibility = 'published'
      AND e.confidence >= 60
      AND nullif(trim(e.title), '') is not null
      AND e.start_at is not null
      AND nullif(trim(v.name), '') is not null
      AND nullif(trim(et.slug), '') is not null
      AND nullif(trim(e.ticket_url_label), '') is not null
      AND e.source_url ~ '^https://'
  ),
  10::bigint,
  'MVP seed events include title, start, venue, type, source name, and source URL'
);

SELECT ok(
  (
    SELECT count(distinct et.slug) >= 8
    FROM public.events e
    JOIN public.event_types et on et.id = e.event_type_id
    WHERE e.primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
      AND e.visibility = 'published'
  ),
  'MVP seed covers a convincing spread of existing event type slugs'
);

SELECT * FROM finish();
ROLLBACK;
