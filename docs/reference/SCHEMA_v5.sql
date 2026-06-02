-- ============================================================================
-- CLYDE CULTURE — SUPABASE SCHEMA v5 (FINAL)
-- ============================================================================
--
-- CHANGES FROM v4:
--
--   AVAILABILITY & STATUS:
--   [33] availability field on events — separate from visibility
--        Handles: sold_out, low_stock, postponed, rescheduled, cancelled badges
--   [34] is_sold_out generated boolean for Webflow filtering
--   [35] 'cancelled' removed from visibility CHECK (now in availability)
--   [36] availability_guess on external_events
--
--   TAG HIERARCHY:
--   [37] parent_event_type_id on tags — enables "sculpture" → "Arts / Exhibition" filtering
--
--   VENUE ENRICHMENT:
--   [38] accessibility_info on venues
--
--   TEMPORAL:
--   [39] doors_at on events — "Doors 7pm, Show 8pm"
--
--   BUG FIXES:
--   [40] has_image handles empty strings: (image_url is not null and image_url != '')
--   [41] festivals.start_date / end_date now nullable (festivals announced before dates confirmed)
--   [42] Index on external_events.last_seen_at for removal detection
--   [43] validate_event_consistency() function to catch denormalisation mismatches
--
-- Phase key:
--   🟢 ESSENTIAL   — required before first ingestion run
--   🟡 IMPORTANT   — needed for Phase 1 launch
--   🔵 PHASE 2     — defer until after MVP is live
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";


-- ============================================================================
-- REFERENCE TABLES
-- ============================================================================

-- 🟢 ESSENTIAL
create table event_types (
  id          smallint generated always as identity primary key,
  slug        text     not null unique,
  label       text     not null,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

insert into event_types (slug, label, sort_order) values
  ('live_music',        'Live Music',           1),
  ('club_night',        'Club Night / DJ',      2),
  ('comedy',            'Comedy',               3),
  ('theatre',           'Theatre',              4),
  ('arts_exhibition',   'Arts / Exhibition',    5),
  ('workshop',          'Workshop / Class',     6),
  ('talk_lecture',      'Talk / Lecture',        7),
  ('film',              'Film',                 8),
  ('family',            'Family',               9),
  ('sport',             'Sport',               10),
  ('community_meetup',  'Community / Meetup',  11),
  ('food_drink',        'Food & Drink',        12),
  ('other',             'Other',               99);


-- 🟢 ESSENTIAL
-- [37] Tags now have an optional parent category.
-- This enables hierarchical filtering: when a user selects "Arts / Exhibition",
-- the query also includes events tagged with "sculpture", "painting", "installation"
-- because those tags have parent_event_type_id pointing to arts_exhibition.
--
-- A tag can exist WITHOUT a parent (general tags like "late-night", "family-friendly").
-- A tag can also belong to MULTIPLE categories in theory, but this schema uses a
-- single parent for simplicity. If multi-parent is needed later, add a join table.
create table tags (
  id                    serial      primary key,
  slug                  text        not null unique,
  label                 text        not null,
  parent_event_type_id  smallint    references event_types(id),
                                    -- null = general tag (no category parent)
                                    -- set = granular tag under a category
                                    -- e.g. "sculpture" → parent = arts_exhibition
                                    -- e.g. "techno" → parent = club_night
                                    -- e.g. "late-night" → null (cross-category)
  created_at            timestamptz not null default now()
);

create index idx_tags_parent on tags (parent_event_type_id) where parent_event_type_id is not null;


-- ============================================================================
-- SOURCES (Connector Registry)
-- ============================================================================

-- 🟢 ESSENTIAL
create table sources (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  slug            text        not null unique,
  source_type     text        not null
                  check (source_type in ('api', 'rss', 'ical', 'html', 'manual')),
  tier            smallint    not null default 1
                  check (tier between 1 and 4),
  config          jsonb       not null default '{}',
  status          text        not null default 'ok'
                  check (status in ('ok', 'degraded', 'broken', 'disabled')),
  enabled         boolean     not null default true,
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- 🟡 PHASE 1.5
create table source_type_category_map (
  id              serial      primary key,
  source_id       uuid        not null references sources(id) on delete cascade,
  event_type_id   smallint    not null references event_types(id),
  source_category text        not null,
  created_at      timestamptz not null default now(),
  constraint uq_source_category unique (source_id, source_category)
);


-- ============================================================================
-- VENUES
-- ============================================================================

-- 🟢 ESSENTIAL
create table venues (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  slug              text        not null unique,
  venue_type        text,

  -- Status & lifecycle
  status            text        not null default 'active'
                    check (status in ('active', 'temporary', 'closed', 'pending')),
  active_from       date,
  active_until      date,

  -- Auto-creation tracking
  auto_created      boolean     not null default false,
  needs_review      boolean     not null default false,

  -- Location
  address           text,
  city              text        not null default 'Glasgow',
  postcode          text,
  lat               numeric(9,6),
  lng               numeric(9,6),

  -- Contact & social
  website           text,
  instagram_handle  text,

  -- Content
  description       text,
  hero_image_url    text,

  -- [38] Accessibility
  accessibility_info text,
                     -- Text field for Phase 1. Structured JSONB in Phase 2 if filtering needed.
                     -- "Wheelchair accessible, hearing loop available"
                     -- "Step-free access to ground floor only"
                     -- "Not wheelchair accessible"

  -- Capacity (manual enrichment — not available from APIs)
  capacity          integer,     -- approximate max capacity; useful for user context
                                 -- "Barrowland Ballroom — 1,900 capacity"
                                 -- null = unknown

  -- Community
  claimable         boolean     not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_venues_name_lower on venues (lower(trim(name)));
create index idx_venues_geo on venues (lat, lng) where lat is not null;
create index idx_venues_slug on venues (slug);
create index idx_venues_status on venues (status);
create index idx_venues_needs_review on venues (needs_review) where needs_review = true;


-- 🟢 ESSENTIAL
create table venue_aliases (
  id               serial      primary key,
  venue_id         uuid        not null references venues(id) on delete cascade,
  alias            text        not null,
  normalised_alias text        not null,
  source_id        uuid        references sources(id),
  created_at       timestamptz not null default now(),
  constraint uq_venue_alias unique (normalised_alias)
);

create index idx_venue_aliases_normalised on venue_aliases (normalised_alias);


-- ============================================================================
-- FESTIVALS
-- ============================================================================

-- 🟢 ESSENTIAL
create table festivals (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  slug              text        not null unique,
  website           text,
  description       text,
  banner_image_url  text,
  -- [41] Nullable: festivals may be announced before dates are confirmed.
  -- Celtic Connections 2027 can be added for title-matching in Sept 2026
  -- without exact dates. Date window check only applies when both are set.
  start_date        date,
  end_date          date,
  match_domains     text[],
  match_title_terms text[],
  match_url_slugs   text[],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);


-- ============================================================================
-- EVENT SERIES
-- ============================================================================

-- 🟢 ESSENTIAL
create table event_series (
  id               uuid        primary key default gen_random_uuid(),
  title            text        not null,
  normalised_title text        not null,
  venue_id         uuid        references venues(id),
  recurrence_hint  text,
  event_type_id    smallint    references event_types(id),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_event_series_venue on event_series (venue_id);
create index idx_event_series_title_trgm on event_series using gin (normalised_title gin_trgm_ops);


-- ============================================================================
-- EVENTS (Canonical)
-- ============================================================================

-- 🟢 ESSENTIAL
create table events (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  normalised_title      text        not null,
  slug                  text        not null unique,
                                    -- Convention: normalised-title-YYYY-MM-DD
                                    -- Collision: append '-2', '-3', etc.
  summary               text,
  description           text,

  -- Links & CTA
  source_url            text,
  ticket_url            text,
  ticket_url_label      text,       -- "Book from Ticketmaster", "Book from Venue Website", etc.

  -- Images
  image_url             text,
  -- [40] Fixed: handles empty strings. Empty string = no image.
  has_image             boolean     not null generated always as (
                          image_url is not null and image_url != ''
                        ) stored,

  -- Pricing
  price_min             numeric(8,2),
  price_max             numeric(8,2),
  is_free               boolean     not null default false,
  price_display         text,       -- "£15", "£10–£25", "Free", "PWYC"

  -- Temporal
  start_at              timestamptz not null,
  end_at                timestamptz,
  -- [39] Doors time — common for Glasgow live music: "Doors 7pm, Show 8pm"
  -- Ticketmaster returns this as dates.doorOpenTime.
  -- Null = unknown or same as start_at.
  doors_at              timestamptz,
  timezone              text        not null default 'Europe/London',
  time_tba              boolean     not null default false,

  -- Classification (normalised FKs)
  event_type_id         smallint    not null references event_types(id),
  venue_id              uuid        references venues(id),
  festival_id           uuid        references festivals(id),
  is_festival_event     boolean     not null generated always as (festival_id is not null) stored,
  series_id             uuid        references event_series(id),

  -- Classification (denormalised for Webflow)
  event_type_label      text        not null,
  venue_name_display    text,
  venue_slug_display    text,
  festival_name_display text,
  festival_slug_display text,
  tags_display          text,       -- "techno, late-night, club"
  location_display      text        not null default 'TBA',
  is_online             boolean     not null default false,
  age_restriction       text,       -- "18+", "All Ages", "Under 14s"

  -- [33] Availability — ticket/event status, SEPARATE from visibility
  -- visibility = "should this appear on the site?" (publication lifecycle)
  -- availability = "what's the status badge?" (ticket/event state)
  --
  -- A sold-out event: visibility = 'published', availability = 'sold_out'
  -- A postponed event: visibility = 'published', availability = 'postponed'
  -- A hidden duplicate: visibility = 'hidden', availability = null
  availability          text
                        check (availability in (
                          'on_sale',       -- tickets available (default display, no badge needed)
                          'sold_out',      -- "Sold Out" badge, CTA disabled or hidden
                          'low_stock',     -- "Last Few Tickets" badge
                          'postponed',     -- "Postponed" badge, date may be TBA
                          'rescheduled',   -- "Rescheduled" badge, new date shown
                          'cancelled',     -- "Cancelled" badge (still visible, unlike visibility='hidden')
                          'not_on_sale'    -- tickets not yet on sale / no ticket required
                        )),
                        -- null = unknown (no badge shown)

  -- Custom availability note for dynamic badge text.
  -- Most availability states use standard badge text in the Webflow template
  -- ("Sold Out", "Last Few Tickets", etc.) but some need context:
  --   "Rescheduled to March 20"
  --   "Postponed — new date TBA"
  --   "Cancelled — refunds available at point of purchase"
  -- Null for standard badges. Webflow: if availability_note is set, show it;
  -- otherwise fall back to the standard badge text for the availability state.
  availability_note     text,

  -- [34] Generated booleans for Webflow conditional display and filtering
  is_sold_out           boolean     not null generated always as (
                          coalesce(availability = 'sold_out', false)
                        ) stored,

  -- Source tracking
  primary_source_id     uuid        references sources(id),

  -- Moderation & quality
  -- [35] 'cancelled' removed from visibility — now in availability field
  visibility            text        not null default 'draft'
                        check (visibility in ('draft', 'published', 'hidden', 'archived')),
  confidence            smallint    not null default 50
                        check (confidence between 0 and 100),
  confidence_inputs     jsonb       not null default '{}',
  needs_review          boolean     not null default false,

  -- Deduplication
  dedupe_key            text        not null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Enforce dedup at database level
create unique index idx_events_dedupe_unique on events (dedupe_key);

-- Query indexes
create index idx_events_start_at on events (start_at);
create index idx_events_venue on events (venue_id);
create index idx_events_type on events (event_type_id);
create index idx_events_festival on events (festival_id) where festival_id is not null;
create index idx_events_series on events (series_id) where series_id is not null;
create index idx_events_visibility on events (visibility);
create index idx_events_source on events (primary_source_id);
create index idx_events_title_trgm on events using gin (normalised_title gin_trgm_ops);

-- Webflow listing queries
create index idx_events_published_date on events (start_at) where visibility = 'published';
create index idx_events_free on events (is_free) where is_free = true and visibility = 'published';
create index idx_events_online on events (is_online) where is_online = true and visibility = 'published';
create index idx_events_sold_out on events (is_sold_out) where visibility = 'published';
create index idx_events_availability on events (availability) where availability is not null and visibility = 'published';
create index idx_events_needs_review on events (needs_review) where needs_review = true;


-- 🟢 ESSENTIAL
create table event_tags (
  event_id    uuid    not null references events(id) on delete cascade,
  tag_id      integer not null references tags(id) on delete cascade,
  primary key (event_id, tag_id)
);

create index idx_event_tags_tag on event_tags (tag_id);


-- ============================================================================
-- EXTERNAL EVENTS (Per-source raw records)
-- ============================================================================

-- 🟢 ESSENTIAL
create table external_events (
  id                      uuid        primary key default gen_random_uuid(),
  source_id               uuid        not null references sources(id),
  external_id             text        not null,
  external_url            text,

  raw                     jsonb       not null default '{}',

  -- Extracted fields (pre-normalisation)
  title                   text,
  start_at                timestamptz,
  end_at                  timestamptz,
  doors_at                timestamptz,    -- [39] extracted from source if available
  venue_name              text,
  event_type_guess        text,
  tags_guess              text[],

  -- Pricing
  price_min_guess         numeric(8,2),
  price_max_guess         numeric(8,2),
  is_free_guess           boolean,
  ticket_url_guess        text,
  ticket_url_label_guess  text,

  -- Image
  image_url_guess         text,

  -- [36] Availability from source
  -- Ticketmaster: dates.status.code → 'onsale', 'offsale', 'cancelled', 'postponed', 'rescheduled'
  -- Skiddle: sold_out boolean, cancelled boolean
  -- Eventbrite: status field, is_sold_out boolean
  availability_guess      text,

  -- Resolution fields
  venue_id_guess          uuid        references venues(id),
  series_id_guess         uuid        references event_series(id),

  -- Link to canonical event
  event_id                uuid        references events(id),

  -- Lifecycle
  first_seen_at           timestamptz not null default now(),
  last_seen_at            timestamptz not null default now(),
  is_deleted              boolean     not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint uq_external_source_id unique (source_id, external_id)
);

create index idx_external_events_event on external_events (event_id) where event_id is not null;
create index idx_external_events_source on external_events (source_id);
-- [42] Index for removal detection (querying by last_seen_at to find stale records)
create index idx_external_events_last_seen on external_events (last_seen_at)
  where is_deleted = false;


-- ============================================================================
-- INGESTION MONITORING
-- ============================================================================

-- 🟢 ESSENTIAL
create table ingest_runs (
  id                      uuid        primary key default gen_random_uuid(),
  source_id               uuid        not null references sources(id),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  status                  text        not null default 'running'
                          check (status in ('running', 'success', 'partial', 'failed')),
  fetched_count           integer     not null default 0,
  parsed_count            integer     not null default 0,
  upserted_external_count integer     not null default 0,
  created_events_count    integer     not null default 0,
  updated_events_count    integer     not null default 0,
  errors_count            integer     not null default 0,
  error_message           text,
  created_at              timestamptz not null default now()
);

create index idx_ingest_runs_source on ingest_runs (source_id, started_at desc);


-- 🟡 IMPORTANT
create table ingest_alerts (
  id          uuid        primary key default gen_random_uuid(),
  source_id   uuid        not null references sources(id),
  run_id      uuid        references ingest_runs(id),
  alert_type  text        not null
              check (alert_type in ('count_drop', 'parse_failure', 'timeout', 'manual')),
  message     text,
  resolved    boolean     not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_ingest_alerts_open on ingest_alerts (source_id) where resolved = false;


-- ============================================================================
-- DEDUPLICATION
-- ============================================================================

-- 🟡 IMPORTANT
create table event_merge_candidates (
  id              uuid        primary key default gen_random_uuid(),
  event_a_id      uuid        not null references events(id),
  event_b_id      uuid        not null references events(id),
  similarity      numeric(4,3),
  match_reasons   jsonb,
  status          text        not null default 'pending'
                  check (status in ('pending', 'merged', 'rejected')),
  resolved_at     timestamptz,
  merge_group_id  uuid,
  created_at      timestamptz not null default now(),
  constraint uq_merge_pair unique (
    least(event_a_id, event_b_id),
    greatest(event_a_id, event_b_id)
  )
);

create index idx_merge_candidates_group on event_merge_candidates (merge_group_id)
  where merge_group_id is not null;
create index idx_merge_candidates_pending on event_merge_candidates (status)
  where status = 'pending';


-- ============================================================================
-- WEBFLOW PUBLISHING
-- ============================================================================

-- 🟡 IMPORTANT
create table publish_mappings (
  id              uuid        primary key default gen_random_uuid(),
  entity_type     text        not null
                  check (entity_type in ('event', 'venue', 'festival', 'tag')),
                  -- 'tag' included for Phase 2 when tags are synced as a
                  -- separate Webflow collection for native multi-reference filtering
  entity_id       uuid        not null,
  webflow_item_id text        not null,
  content_hash    text        not null,
  last_pushed_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_publish_entity unique (entity_type, entity_id)
);


-- 🟡 IMPORTANT
create table publish_jobs (
  id              uuid        primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text        not null default 'running'
                  check (status in ('running', 'success', 'partial', 'failed')),
  items_pushed    integer     not null default 0,
  items_skipped   integer     not null default 0,
  items_failed    integer     not null default 0,
  error_message   text,
  created_at      timestamptz not null default now()
);


-- 🟡 IMPORTANT
create table publish_job_items (
  id              uuid        primary key default gen_random_uuid(),
  job_id          uuid        not null references publish_jobs(id) on delete cascade,
  entity_type     text        not null
                  check (entity_type in ('event', 'venue', 'festival', 'tag')),
  entity_id       uuid        not null,
  action          text        not null
                  check (action in ('created', 'updated', 'skipped', 'deleted', 'failed')),
  error_message   text,
  webflow_item_id text,
  created_at      timestamptz not null default now()
);

create index idx_publish_job_items_job on publish_job_items (job_id);
create index idx_publish_job_items_failed on publish_job_items (job_id) where action = 'failed';


-- ============================================================================
-- COMMUNITY (Phase 2)
-- ============================================================================

-- 🔵 PHASE 2
create table event_submissions (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  description     text,
  start_at        timestamptz not null,
  end_at          timestamptz,
  venue_name      text,
  venue_id        uuid        references venues(id),
  event_type_slug text,
  tags            text[],
  source_url      text,
  submitter_email text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  event_id        uuid        references events(id),
  created_at      timestamptz not null default now()
);


-- 🔵 PHASE 2
create table venue_claims (
  id              uuid        primary key default gen_random_uuid(),
  venue_id        uuid        not null references venues(id),
  claimant_email  text        not null,
  proof           text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  created_at      timestamptz not null default now()
);


-- 🔵 PHASE 2
create table moderation_log (
  id              uuid        primary key default gen_random_uuid(),
  entity_type     text        not null
                  check (entity_type in ('event', 'submission', 'venue_claim', 'venue', 'merge')),
  entity_id       uuid        not null,
  action          text        not null
                  check (action in ('approved', 'rejected', 'flagged', 'edited', 'merged', 'created')),
  reason          text,
  performed_by    uuid,
  created_at      timestamptz not null default now()
);

create index idx_moderation_log_entity on moderation_log (entity_type, entity_id);


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- 🟢 ESSENTIAL
create or replace function trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on venues            for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on festivals         for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on sources           for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on event_series      for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on events            for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on external_events   for each row execute function trigger_set_updated_at();
create trigger set_updated_at before update on publish_mappings  for each row execute function trigger_set_updated_at();


-- 🟢 ESSENTIAL
create or replace function normalise_title(input text)
returns text as $$
begin
  return lower(trim(regexp_replace(
    regexp_replace(input, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )));
end;
$$ language plpgsql immutable;


-- 🟢 ESSENTIAL
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
    || to_char(date_trunc('hour', p_start_at), 'YYYY-MM-DD-HH24')
    || '|'
    || normalise_title(p_title),
    'sha256'
  ), 'hex');
end;
$$ language plpgsql immutable;


-- 🟢 ESSENTIAL
create or replace function resolve_venue(p_venue_name text)
returns uuid as $$
declare
  v_normalised text;
  v_venue_id uuid;
begin
  if p_venue_name is null or trim(p_venue_name) = '' then
    return null;
  end if;

  v_normalised := lower(trim(p_venue_name));

  select id into v_venue_id
  from venues
  where lower(trim(name)) = v_normalised
  limit 1;

  if v_venue_id is not null then
    return v_venue_id;
  end if;

  select venue_id into v_venue_id
  from venue_aliases
  where normalised_alias = v_normalised
  limit 1;

  return v_venue_id;
end;
$$ language plpgsql stable;


-- 🟢 ESSENTIAL
-- Creates a minimal venue record when resolve_venue() returns null.
-- The caller (connector) should ALWAYS call resolve_venue() first.
--
-- RACE CONDITION NOTE: If two connectors run concurrently and both encounter
-- the same unknown venue, both may call this function. The venue_aliases
-- unique constraint (normalised_alias) prevents duplicate aliases, but two
-- venue records could be created with slightly different names.
-- Phase 1: connectors run sequentially (Edge Functions), so this is unlikely.
-- Phase 2: if moving to parallel workers, wrap in an advisory lock or
-- use SELECT ... FOR UPDATE on the alias check.
create or replace function auto_create_venue(
  p_venue_name text,
  p_source_url text default null
)
returns uuid as $$
declare
  v_venue_id uuid;
  v_slug text;
begin
  v_slug := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', '-', 'g'
  )));

  while exists (select 1 from venues where slug = v_slug) loop
    v_slug := v_slug || '-' || floor(random() * 1000)::text;
  end loop;

  insert into venues (name, slug, status, auto_created, needs_review, website)
  values (p_venue_name, v_slug, 'pending', true, true, p_source_url)
  returning id into v_venue_id;

  insert into venue_aliases (venue_id, alias, normalised_alias)
  values (v_venue_id, p_venue_name, lower(trim(p_venue_name)))
  on conflict (normalised_alias) do nothing;

  return v_venue_id;
end;
$$ language plpgsql;


-- 🟡 IMPORTANT
-- [43] Validate denormalised field consistency before publishing.
-- Called by the Webflow sync job. Returns true if the event is consistent.
-- If false, the sync job should flag the event for review.
create or replace function validate_event_consistency(p_event_id uuid)
returns boolean as $$
declare
  v_event record;
begin
  select * into v_event from events where id = p_event_id;

  if v_event is null then return false; end if;

  -- venue_id set but display fields missing
  if v_event.venue_id is not null and v_event.venue_name_display is null then
    return false;
  end if;

  -- festival_id set but display fields missing
  if v_event.festival_id is not null and v_event.festival_name_display is null then
    return false;
  end if;

  -- event_type_label must always be set (NOT NULL, but verify it matches)
  if v_event.event_type_label is null or v_event.event_type_label = '' then
    return false;
  end if;

  -- is_free true but no price_display
  if v_event.is_free = true and (v_event.price_display is null or v_event.price_display = '') then
    return false;
  end if;

  -- image_url is empty string (would make has_image unreliable in older schemas)
  if v_event.image_url = '' then
    return false;
  end if;

  return true;
end;
$$ language plpgsql stable;


-- 🟡 IMPORTANT
create or replace function archive_past_events()
returns integer as $$
declare
  archived_count integer;
begin
  update events
  set visibility = 'archived'
  where visibility = 'published'
    and coalesce(end_at, start_at) < now() - interval '7 days';
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$ language plpgsql;


-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

alter table event_types              enable row level security;
alter table tags                     enable row level security;
alter table source_type_category_map enable row level security;
alter table venues                   enable row level security;
alter table venue_aliases            enable row level security;
alter table festivals                enable row level security;
alter table sources                  enable row level security;
alter table event_series             enable row level security;
alter table events                   enable row level security;
alter table event_tags               enable row level security;
alter table external_events          enable row level security;
alter table ingest_runs              enable row level security;
alter table ingest_alerts            enable row level security;
alter table event_merge_candidates   enable row level security;
alter table publish_mappings         enable row level security;
alter table publish_jobs             enable row level security;
alter table publish_job_items        enable row level security;
alter table event_submissions        enable row level security;
alter table venue_claims             enable row level security;
alter table moderation_log           enable row level security;

create policy "Public read event_types"    on event_types    for select using (true);
create policy "Public read tags"           on tags           for select using (true);
create policy "Public read venues"         on venues         for select using (status in ('active', 'temporary'));
create policy "Public read venue_aliases"  on venue_aliases  for select using (true);
create policy "Public read festivals"      on festivals      for select using (true);
create policy "Public read event_series"   on event_series   for select using (true);
create policy "Public read events"         on events         for select using (visibility = 'published');

create policy "Public read event_tags" on event_tags for select using (
  exists (
    select 1 from events where events.id = event_tags.event_id and events.visibility = 'published'
  )
);

create policy "Public insert submissions" on event_submissions
  for insert with check (true);


-- ============================================================================
-- TABLE INVENTORY (20 tables, 7 functions)
-- ============================================================================
--
-- 🟢 ESSENTIAL (11 tables):
--   1.  event_types
--   2.  tags                          (+ parent_event_type_id for hierarchy)
--   3.  sources
--   4.  venues                        (+ accessibility_info)
--   5.  venue_aliases
--   6.  festivals
--   7.  event_series
--   8.  events                        (+ availability, doors_at, is_sold_out)
--   9.  event_tags
--   10. external_events               (+ availability_guess, doors_at)
--   11. ingest_runs
--
-- 🟡 IMPORTANT (6 tables):
--   12. source_type_category_map
--   13. ingest_alerts
--   14. event_merge_candidates
--   15. publish_mappings
--   16. publish_jobs
--   17. publish_job_items
--
-- 🔵 PHASE 2 (3 tables):
--   18. event_submissions
--   19. venue_claims
--   20. moderation_log
--
-- Functions:
--   trigger_set_updated_at()          — auto-update timestamps
--   normalise_title(text)             — strip punctuation, lowercase
--   compute_dedupe_key(uuid, tstz, text) — SHA-256 dedup hash
--   resolve_venue(text)               — match venue name to venue_id
--   auto_create_venue(text, text)     — create minimal venue when no match
--   validate_event_consistency(uuid)  — check denormalised fields before publish
--   archive_past_events()             — archive events 7+ days past end date
-- ============================================================================