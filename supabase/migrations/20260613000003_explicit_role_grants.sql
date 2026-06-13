-- =============================================================================
-- Make anon / authenticated table privileges explicit and image-independent.
--
-- The public-read path (the Astro site reading published events via the anon
-- key) and the internal-table deny both relied on Supabase's *default* role
-- grants. Those defaults differ between Supabase CLI / Postgres image versions:
-- on newer images anon is NOT granted SELECT by default. That silently means:
--   - the public site would get "permission denied" reading public.events, and
--   - the RLS deny tests hit a grant-level error instead of RLS row-filtering.
--
-- This migration pins the privilege model explicitly so behaviour is identical
-- on every image. RLS policies (already defined) still decide which ROWS are
-- visible; these grants decide which roles may touch the table at all.
-- service_role bypasses RLS and is unaffected by these statements.
-- =============================================================================

-- Public-read tables: anon + authenticated may SELECT; RLS restricts the rows
-- (events: visibility = 'published' AND confidence >= 60; venues: status in
-- ('active','temporary'); event_tags/venue_aliases: parent-gated; etc.).
grant select on table
  public.events,
  public.venues,
  public.venue_aliases,
  public.event_types,
  public.tags,
  public.event_tags,
  public.festivals,
  public.event_series
to anon, authenticated;

-- event_submissions: anon may INSERT (column-scoped grant + policy from
-- 20260608000000_event_submissions_public_gate) but must never read submissions.
-- Revoke SELECT only; the INSERT grant is left intact.
revoke select on table public.event_submissions from anon, authenticated;

-- Internal operational / config tables: least privilege — the public roles get
-- no access at all. Ingestion runs as service_role (which bypasses RLS). RLS
-- remains enabled on these tables as a backstop, but the absence of any grant is
-- now the primary gate, deterministically across image versions.
revoke all on table
  public.sources,
  public.external_events,
  public.ingest_runs,
  public.ingest_alerts,
  public.event_merge_candidates,
  public.moderation_log,
  public.venue_claims,
  public.source_type_category_map
from anon, authenticated;
