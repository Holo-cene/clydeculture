-- ============================================================================
-- Migration: 20260613000000_missing_query_indexes
-- Issue #19 — Schema: add missing query performance indexes
--
-- Three compound / partial indexes on `events` to support common Phase 1
-- query patterns that currently planner-scan and filter:
--
--   1. Venue page:    WHERE venue_id = $1 AND visibility = 'published'
--                     ORDER BY start_at
--   2. Festival page: WHERE festival_id = $1 AND visibility = 'published'
--                     ORDER BY start_at
--   3. Moderator queue: WHERE visibility = 'draft'
--                       AND confidence >= ? AND needs_review = false
--
-- Note on the fourth index from the original DB-06 brief
-- (idx_events_tags_display_trgm on events.tags_display):
--   CC-NEW-1 dropped the tags_display column. Tag filtering now goes through
--   the event_tags junction table, which already has idx_event_tags_tag.
--   No replacement index is added here.
-- ============================================================================

-- Venue page: published events at a venue, ordered by date.
-- Pattern: WHERE venue_id = $1 AND visibility = 'published' ORDER BY start_at
create index if not exists idx_events_venue_date
  on events (venue_id, start_at)
  where visibility = 'published';

-- Festival page: published events in a festival, ordered by date.
-- Pattern: WHERE festival_id = $1 AND visibility = 'published' ORDER BY start_at
create index if not exists idx_events_festival_date
  on events (festival_id, start_at)
  where visibility = 'published' and festival_id is not null;

-- Moderation queue: events ready to publish.
-- Pattern: WHERE visibility = 'draft' AND confidence >= ? AND needs_review = false
create index if not exists idx_events_ready_to_publish
  on events (confidence)
  where visibility = 'draft' and needs_review = false;
