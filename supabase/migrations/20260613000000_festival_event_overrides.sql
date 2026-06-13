-- ============================================================================
-- Migration: festival_event_overrides — manual override table for festival
--            detection (FESTIVALS.md Rule 4).
--
-- Purpose:   Links specific (source_id, external_id) pairs to a festival_id,
--            bypassing automated detection rules and the date-window check.
--            Use case: Ticketmaster events that belong to a festival programme
--            but carry no festival signal in title, URL, or source domain.
--
-- Issue:     #12 (Festival detection: detector + override table + window-mismatch alert)
-- ============================================================================

create table festival_event_overrides (
  id          uuid        primary key default gen_random_uuid(),
  source_id   uuid        not null references sources(id)   on delete cascade,
  external_id text        not null,
  festival_id uuid        not null references festivals(id) on delete cascade,
  note        text,                           -- reason for the manual override
  created_by  text,                           -- operator who created the override
  created_at  timestamptz not null default now(),
  constraint uq_festival_override unique (source_id, external_id)
);

create index idx_festival_overrides_festival
  on festival_event_overrides (festival_id);

alter table festival_event_overrides enable row level security;
-- No public policy: this table is operator-only and accessed via the service role.
