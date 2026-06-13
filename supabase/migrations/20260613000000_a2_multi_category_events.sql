-- ============================================================================
-- Migration: ADR 0005 A2 — Multi-category events
-- Purpose:   An event can sit in many event_types. A market + workshop + live
--            music community day, or a film + Q&A talk, must be classed across
--            disciplines. A single primary_event_type_id is kept on events for
--            the canonical badge/slug; all category membership (primary + any
--            secondary) lives in the event_event_types join table.
--
-- Effects:
--   1. Renames events.event_type_id → events.primary_event_type_id
--      (renames the supporting index to match).
--   2. Creates the event_event_types join table + supporting index.
--   3. Backfills the join with each event's primary type so the membership
--      filter ("show me workshops") is consistent across new and pre-A2 rows.
--   4. Enables RLS on the join table: anon may read membership rows only when
--      the parent event itself is publicly visible (visibility = 'published'
--      AND confidence >= 60) — same boundary as the events table.
--
-- Out of scope:
--   - New event types (taxonomy is separate).
--   - Tag-vs-category distinction (separate concern).
--   - Per-row primary flag in the join — primary is on events, not the join,
--     to keep the canonical badge/slug source-of-truth obvious.
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Rename events.event_type_id → events.primary_event_type_id
-- ============================================================================

alter table events rename column event_type_id to primary_event_type_id;

-- The supporting index name should follow.
alter index idx_events_type rename to idx_events_primary_type;


-- ============================================================================
-- BLOCK 2: Create the event_event_types join table
-- ============================================================================

create table event_event_types (
  event_id      uuid        not null references events(id) on delete cascade,
  event_type_id smallint    not null references event_types(id),
  created_at    timestamptz not null default now(),
  primary key (event_id, event_type_id)
);

-- Filter direction: "show me all events of type X".
-- The (event_id, event_type_id) primary key already serves the reverse lookup.
create index idx_event_event_types_type on event_event_types (event_type_id);


-- ============================================================================
-- BLOCK 3: Backfill — every event's primary type belongs in the join
--
-- Every canonical event must have at least its primary type present in the
-- join, otherwise the membership filter would silently hide it from its own
-- primary category.
-- ============================================================================

insert into event_event_types (event_id, event_type_id)
select id, primary_event_type_id
from events
on conflict do nothing;


-- ============================================================================
-- BLOCK 4: RLS — public read for canonical published events only
--
-- Mirrors the events public-read boundary: visibility = 'published' AND
-- confidence >= 60. PostgreSQL applies RLS recursively; the subquery here
-- runs under the caller's role, so the parent events policy filters the
-- subquery result as well — but we make the gate explicit for defence in
-- depth (same approach as the A3 event_tags policy).
-- ============================================================================

alter table event_event_types enable row level security;

create policy "Public read event_event_types"
  on event_event_types for select
  using (
    exists (
      select 1 from events
      where events.id = event_event_types.event_id
        and events.visibility = 'published'
        and events.confidence >= 60
    )
  );
