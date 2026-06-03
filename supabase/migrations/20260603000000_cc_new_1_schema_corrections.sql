-- ============================================================================
-- Migration: 20260603000000_cc_new_1_schema_corrections
-- CC-NEW-1: Drop Webflow fields/tables, fix dedupe UTC bug (BE-09),
--           add apify source_type, correct RLS confidence threshold,
--           add is_all_day, align venue normalisation.
-- ============================================================================
-- Baseline: 20260531000000_schema_v5_initial.sql
-- Operation order from A1 Stage 1 plan (Phase 0.5).
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Replace validate_event_consistency() BEFORE dropping the columns
--          it currently references. The new version retains only the two
--          checks that do not depend on Webflow denormalised fields.
-- ============================================================================

create or replace function validate_event_consistency(p_event_id uuid)
returns boolean as $$
declare
  v_event record;
begin
  select * into v_event from events where id = p_event_id;

  if v_event is null then return false; end if;

  -- is_free true but price_display is missing or empty
  if v_event.is_free = true and (v_event.price_display is null or v_event.price_display = '') then
    return false;
  end if;

  -- image_url is empty string (makes has_image generated column unreliable)
  if v_event.image_url = '' then
    return false;
  end if;

  return true;
end;
$$ language plpgsql stable;


-- ============================================================================
-- BLOCK 2: Drop Webflow-era columns and tables
-- ============================================================================

-- Drop the 7 Webflow denormalised display columns from events.
-- validate_event_consistency() has already been replaced in Block 1.
alter table events
  drop column if exists event_type_label,
  drop column if exists venue_name_display,
  drop column if exists venue_slug_display,
  drop column if exists festival_name_display,
  drop column if exists festival_slug_display,
  drop column if exists tags_display,
  drop column if exists location_display;

-- Drop Webflow publish tables in FK-safe order (child before parent).
-- The set_updated_at trigger on publish_mappings drops implicitly with the
-- table — no explicit DROP TRIGGER needed. The baseline trigger is named
-- set_updated_at; there is no trigger named on_publish_mapping_change.
drop table if exists publish_job_items;
drop table if exists publish_jobs;
drop table if exists publish_mappings;


-- ============================================================================
-- BLOCK 3: Fix compute_dedupe_key() — UTC-stable hour bucketing (BE-09)
-- ============================================================================

-- Only semantic change from baseline: date_trunc now uses AT TIME ZONE 'UTC'
-- to prevent BST/UTC hash collisions. Implementation style (pgcrypto
-- encode/digest) is unchanged from baseline.
create or replace function compute_dedupe_key(
  p_venue_id   uuid,
  p_start_at   timestamptz,
  p_title      text
)
returns text as $$
begin
  return encode(digest(
    coalesce(p_venue_id::text, 'no-venue')
    || '|'
    || to_char(date_trunc('hour', p_start_at at time zone 'UTC'), 'YYYY-MM-DD-HH24')
    || '|'
    || normalise_title(p_title),
    'sha256'
  ), 'hex');
end;
$$ language plpgsql immutable;


-- ============================================================================
-- BLOCK 3b: Dedupe collision pre-check, then backfill
-- ============================================================================

-- Pre-check runs after compute_dedupe_key() is replaced so it uses the
-- corrected UTC formula. Raises an exception if any two existing events would
-- produce the same new key, preventing a unique constraint violation in the
-- backfill UPDATE below.
do $$
declare
  collision_count integer;
begin
  select count(*) into collision_count
  from (
    select compute_dedupe_key(venue_id, start_at, title) as new_key
    from events
    group by compute_dedupe_key(venue_id, start_at, title)
    having count(*) > 1
  ) as collisions;

  if collision_count > 0 then
    raise exception
      'A1 dedupe pre-check failed: % key group(s) would collide after UTC '
      'correction. Investigate events before proceeding.',
      collision_count;
  end if;
end $$;

-- Backfill dedupe_key using the corrected UTC formula.
-- Affects 0 rows on a greenfield database; included for acceptance criteria
-- and for safety if this migration is ever applied to a seeded database.
update events
  set dedupe_key = compute_dedupe_key(venue_id, start_at, title);


-- ============================================================================
-- BLOCK 4: CHECK constraint additions
-- ============================================================================

-- Add 'apify' to sources.source_type allowed values.
-- PostgreSQL does not support ALTER CHECK — must drop and recreate.
alter table sources
  drop constraint if exists sources_source_type_check;
alter table sources
  add constraint sources_source_type_check
  check (source_type in ('api', 'rss', 'ical', 'html', 'apify', 'manual'));

-- Add 'cold_start_zero' to ingest_alerts.alert_type allowed values.
alter table ingest_alerts
  drop constraint if exists ingest_alerts_alert_type_check;
alter table ingest_alerts
  add constraint ingest_alerts_alert_type_check
  check (alert_type in ('count_drop', 'parse_failure', 'timeout', 'manual', 'cold_start_zero'));

-- Free-event price consistency: is_free = true must not coexist with price > 0.
alter table events
  add constraint events_price_min_free_check
  check (not (is_free = true and price_min > 0));

alter table events
  add constraint events_price_max_free_check
  check (not (is_free = true and price_max > 0));


-- ============================================================================
-- BLOCK 5: New events columns
-- ============================================================================

-- Support all-day events (festival days, open studios, etc.)
alter table events
  add column is_all_day boolean not null default false;

-- IANA timezone validation via two-step NOT VALID + VALIDATE.
-- now() AT TIME ZONE 'invalid_tz' raises an error at INSERT/UPDATE time,
-- which rejects the row. The two-step approach avoids a blocking table scan
-- during constraint creation (safe practice for larger tables).
alter table events
  add constraint events_timezone_iana_valid
  check (now() at time zone timezone is not null)
  not valid;

alter table events validate constraint events_timezone_iana_valid;


-- ============================================================================
-- BLOCK 6: RLS policy replacements
-- ============================================================================

-- Replace the events public read policy to enforce the confidence threshold.
-- Baseline was: using (visibility = 'published') — missing confidence >= 60.
-- Threshold is hardcoded as a literal; changing it requires a new migration
-- (tracked in BE-19 for future externalisation to platform_config).
drop policy if exists "Public read events" on events;
create policy "Public read events"
  on events for select
  using (visibility = 'published' and confidence >= 60);

-- Replace the venue_aliases public read policy. The baseline exposed all
-- aliases unconditionally. The new policy restricts to aliases whose parent
-- venue has status IN ('active', 'temporary'). Aliases for closed or pending
-- venues are not publicly visible.
drop policy if exists "Public read venue_aliases" on venue_aliases;
create policy "Public read venue_aliases"
  on venue_aliases for select
  using (
    exists (
      select 1 from venues
      where venues.id = venue_aliases.venue_id
        and venues.status in ('active', 'temporary')
    )
  );


-- ============================================================================
-- BLOCK 7: Align resolve_venue() and auto_create_venue() normalisation
-- ============================================================================

-- Shared normalisation expression used in both functions:
--   lower(trim(regexp_replace(
--     regexp_replace(input, '[^[:alnum:][:space:]]', '', 'g'),
--     '[[:space:]]+', ' ', 'g'
--   )))
-- Strips non-alphanumeric/non-space characters, collapses internal whitespace
-- to a single space, trims, then lowercases. Must match TypeScript
-- normaliseVenueName() in packages/core.

-- resolve_venue(): updated to use full normalisation for both the venues.name
-- lookup and the venue_aliases lookup, matching the alias format now written
-- by auto_create_venue() below.
create or replace function resolve_venue(p_venue_name text)
returns uuid as $$
declare
  v_normalised text;
  v_venue_id   uuid;
begin
  if p_venue_name is null or trim(p_venue_name) = '' then
    return null;
  end if;

  v_normalised := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )));

  -- Check venues.name (apply same normalisation for case-insensitive match)
  select id into v_venue_id
  from venues
  where lower(trim(regexp_replace(
    regexp_replace(name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  ))) = v_normalised
  limit 1;

  if v_venue_id is not null then
    return v_venue_id;
  end if;

  -- Check venue_aliases.normalised_alias (stored using the same algorithm)
  select venue_id into v_venue_id
  from venue_aliases
  where normalised_alias = v_normalised
  limit 1;

  return v_venue_id;
end;
$$ language plpgsql stable;


-- auto_create_venue(): updated so the alias stored in venue_aliases uses the
-- same normalisation as resolve_venue(). The baseline used lower(trim()) only,
-- which would cause lookups to miss aliases for names containing punctuation.
-- Slug generation (hyphen-separated) is unchanged from baseline.
create or replace function auto_create_venue(
  p_venue_name text,
  p_source_url text default null
)
returns uuid as $$
declare
  v_venue_id        uuid;
  v_slug            text;
  v_normalised_name text;
begin
  -- Slug: strip non-alpha, collapse to hyphens (unchanged from baseline)
  v_slug := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', '-', 'g'
  )));

  -- Alias normalisation: strip non-alpha, collapse to spaces (matches resolve_venue)
  v_normalised_name := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )));

  while exists (select 1 from venues where slug = v_slug) loop
    v_slug := v_slug || '-' || floor(random() * 1000)::text;
  end loop;

  insert into venues (name, slug, status, auto_created, needs_review, website)
  values (p_venue_name, v_slug, 'pending', true, true, p_source_url)
  returning id into v_venue_id;

  insert into venue_aliases (venue_id, alias, normalised_alias)
  values (v_venue_id, p_venue_name, v_normalised_name)
  on conflict (normalised_alias) do nothing;

  return v_venue_id;
end;
$$ language plpgsql;
