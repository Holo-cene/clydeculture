-- ============================================================================
-- Migration: A3 — Make event_tags RLS confidence gate explicit
-- Purpose:   Defence-in-depth for anon SELECT on event_tags.
--            Do not rely only on recursive RLS through parent events.
-- ============================================================================

DROP POLICY IF EXISTS "Public read event_tags" ON event_tags;

CREATE POLICY "Public read event_tags" ON event_tags FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_tags.event_id
      AND events.visibility = 'published'
      AND events.confidence >= 60
  )
);
