-- ============================================================================
-- Migration: 20260613000000_sources_is_link_only
--
-- Issue #13 — Link-only source enforcement (CLAUDE.md hard rule #1).
--
-- Adds a typed flag on `sources` so the normaliser can refuse to copy
-- descriptions, summaries, or image URLs from sources whose terms of service
-- prohibit reproduction (Resident Advisor, Instagram, and any future
-- link-only source). Prior to this column, hard rule #1 lived only in prose
-- in CLAUDE.md and docs/source-policy.md — a connector could push a full
-- `description` and `imageUrlGuess` through `RawEvent` and nothing would
-- catch the violation.
--
-- The normaliser in packages/core/src/normalise/normalise.ts reads this flag
-- (hydrated by the orchestrator onto every ExternalEventDraft) and throws if
-- a connector for a link-only source emits a description, summary, or image
-- URL. `external_events.raw` is still stored regardless for debug/reparse.
--
-- No source currently in the seed set is link-only:
--   - Demo seed (00000000-0600-…-001): demo data with synthetic summaries.
--   - Ticketmaster: permitted descriptions/images per ADR 0004.
--   - Data Thistle: staging-only, gated through SourcePolicy.
-- Future migrations that insert a Resident Advisor or Instagram source row
-- must set `is_link_only = true` on insert.
--
-- Applies after: 20260612010000_ingestion_health_views.sql
-- ============================================================================

alter table public.sources
  add column if not exists is_link_only boolean not null default false;

comment on column public.sources.is_link_only is
  'When true, the normaliser must not copy description, summary, or image_url '
  'from external_events to the canonical event for this source. Connectors '
  'that emit any of those fields for a link-only source raise a parse-time '
  'error. Raw payloads are still stored in external_events.raw. Set for '
  'Resident Advisor, Instagram, and any source whose ToS prohibits content '
  'reproduction. See CLAUDE.md hard rule #1 and docs/source-policy.md §5.';


-- ============================================================================
-- BLOCK 2: Verification — existing sources default to is_link_only = false
-- ============================================================================

do $$
declare
  v_null_count integer;
begin
  select count(*) into v_null_count
  from public.sources
  where is_link_only is null;

  if v_null_count > 0 then
    raise exception
      'sources.is_link_only must be NOT NULL on every row (% nulls found)',
      v_null_count;
  end if;
end $$;
