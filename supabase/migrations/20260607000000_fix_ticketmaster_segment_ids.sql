-- ============================================================================
-- Migration: 20260607000000_fix_ticketmaster_segment_ids
-- Fix B5 seed typo: Ticketmaster segment IDs in source_type_category_map have
-- a transposition in positions 10–11 (`szy` should be `syz`).
--
-- Discovered: live smoke test 2026-06-07.
-- Reference: packages/connectors/src/api/ticketmaster/SPEC.md §6
-- Applies after: 20260606000000_source_category_map_seed.sql
--
-- Affected rows (all Ticketmaster, source_category column):
--   kzfzniwnszyfz7v7nj  →  kzfzniwnsyzfz7v7nj  (Music → live_music)
--   kzfzniwnszyfz7v7ne  →  kzfzniwnsyzfz7v7ne  (Comedy → comedy)
--   kzfzniwnszyfz7v7nn  →  kzfzniwnsyzfz7v7nn  (Film → film)
--   kzfzniwnszyfz7v7na  →  kzfzniwnsyzfz7v7na  (Arts & Theatre → arts_exhibition)
--
-- Unchanged: knvzfz7vavf (Undefined/Club → club_night) — different format,
--            not confirmed wrong.
--
-- Idempotency: the NOT EXISTS guard prevents a unique-constraint violation if
-- this migration is applied more than once or if the correct IDs already exist.
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Correct the four transposed segment IDs
-- ============================================================================

update source_type_category_map scm
set source_category = correction.correct_id
from sources s,
  (values
    ('kzfzniwnszyfz7v7nj', 'kzfzniwnsyzfz7v7nj'),
    ('kzfzniwnszyfz7v7ne', 'kzfzniwnsyzfz7v7ne'),
    ('kzfzniwnszyfz7v7nn', 'kzfzniwnsyzfz7v7nn'),
    ('kzfzniwnszyfz7v7na', 'kzfzniwnsyzfz7v7na')
  ) as correction(wrong_id, correct_id)
where scm.source_id = s.id
  and s.slug = 'ticketmaster'
  and scm.source_category = correction.wrong_id
  and not exists (
    select 1
    from source_type_category_map dup
    where dup.source_id = scm.source_id
      and dup.source_category = correction.correct_id
  );


-- ============================================================================
-- BLOCK 2: Verification assertions
-- ============================================================================

do $$
declare
  v_wrong   integer;
  v_correct integer;
  v_total   integer;
begin

  -- Assert: none of the wrong IDs remain
  select count(*) into v_wrong
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'ticketmaster'
    and scm.source_category in (
      'kzfzniwnszyfz7v7nj',
      'kzfzniwnszyfz7v7ne',
      'kzfzniwnszyfz7v7nn',
      'kzfzniwnszyfz7v7na'
    );

  if v_wrong > 0 then
    raise exception
      'fix_ticketmaster_segment_ids: % wrong segment ID(s) still present after correction',
      v_wrong;
  end if;

  -- Count correct IDs and total ticketmaster rows.
  -- Only assert correctness when ticketmaster rows exist — allows a clean local DB
  -- reset where B5 seed runs before this migration in the correct order.
  select count(*) into v_correct
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'ticketmaster'
    and scm.source_category in (
      'kzfzniwnsyzfz7v7nj',
      'kzfzniwnsyzfz7v7ne',
      'kzfzniwnsyzfz7v7nn',
      'kzfzniwnsyzfz7v7na'
    );

  select count(*) into v_total
  from source_type_category_map scm
  join sources s on s.id = scm.source_id
  where s.slug = 'ticketmaster';

  if v_total > 0 and v_correct < 4 then
    raise exception
      'fix_ticketmaster_segment_ids: expected 4 correct segment IDs, found % (total ticketmaster rows: %)',
      v_correct, v_total;
  end if;

  raise notice 'fix_ticketmaster_segment_ids: OK — % wrong IDs remaining, % correct IDs present (% total)',
    v_wrong, v_correct, v_total;
end $$;
