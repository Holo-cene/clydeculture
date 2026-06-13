-- ============================================================================
-- Migration: 20260613000000_glad_cafe_source_seed
-- The Glad Cafe RSS source seed (issue #29, first Phase 1 RSS connector).
--
-- Context: packages/connectors/src/rss/glad-cafe/ and docs/CONNECTOR_GUIDE.md
-- §6 (RSS Type A vs Type B classification). The Glad Cafe is classified as
-- Type A — one <item> per event, <pubDate> is the event start.
--
-- The feed URL is supplied at runtime via the GLAD_CAFE_RSS_URL env var; this
-- row exists only to gate the connector via sources.enabled. No URL is stored
-- in config — credentials and endpoints stay out of the sources table per
-- CLAUDE.md hard rules.
--
-- Applies after: 20260612010000_ingestion_health_views.sql
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Insert the glad-cafe source row, disabled.
--
-- enabled = false: the connector does not run until an operator verifies the
-- feed URL and flips this flag via a follow-up migration. config.rssType is
-- 'event_feed' (the Type A default) so downstream code can distinguish from
-- newsletter sources without re-reading the docs.
-- ============================================================================

insert into sources (name, slug, source_type, tier, config, status, enabled)
values (
  'The Glad Cafe',
  'glad-cafe',
  'rss',
  2,
  '{"rssType": "event_feed"}',
  'ok',
  false  -- disabled: enable via follow-up migration once feed URL is verified
)
on conflict (slug) do nothing;


-- ============================================================================
-- BLOCK 2: Verification assertions (run at migration time)
-- ============================================================================

do $$
declare
  v_enabled  boolean;
  v_type     text;
  v_rss_type text;
begin
  select enabled, source_type, config->>'rssType'
    into v_enabled, v_type, v_rss_type
  from sources
  where slug = 'glad-cafe';

  if v_enabled is null then
    raise exception
      'glad-cafe seed assertion failed: sources row missing';
  end if;

  if v_enabled then
    raise exception
      'glad-cafe seed assertion failed: source must be seeded disabled';
  end if;

  if v_type <> 'rss' then
    raise exception
      'glad-cafe seed assertion failed: expected source_type = rss, got %',
      v_type;
  end if;

  if v_rss_type <> 'event_feed' then
    raise exception
      'glad-cafe seed assertion failed: expected config.rssType = event_feed, got %',
      v_rss_type;
  end if;
end $$;
