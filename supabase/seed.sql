-- Clyde Culture MVP proof-of-concept demo data.
--
-- This seed is intentionally demo-safe: source URLs point to real public venue pages
-- for demo credibility, but events are synthetic demo data — not live-ingested.
-- Payloads are synthetic, descriptions are short discovery summaries. Idempotent.

insert into public.sources (
  id,
  name,
  slug,
  source_type,
  tier,
  config,
  enabled,
  status
) values (
  '00000000-0600-4000-8000-000000000001'::uuid,
  'Clyde Culture Demo Data',
  'clyde-culture-demo-data',
  'manual',
  1,
  '{"demo": true, "auto_publish": true, "timezone": "Europe/London"}'::jsonb,
  false,
  'ok'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  source_type = excluded.source_type,
  tier = excluded.tier,
  config = excluded.config,
  enabled = excluded.enabled,
  status = excluded.status;

insert into public.venues (
  id,
  name,
  slug,
  status,
  address,
  city,
  auto_created,
  needs_review
)
select
  venue.id::uuid,
  venue.name,
  venue.slug,
  'active',
  venue.address,
  'Glasgow',
  false,
  false
from (
  values
    ('00000000-0601-4000-8000-000000000001', 'The Old Hairdressers', 'the-old-hairdressers', 'Renfield Lane'),
    ('00000000-0601-4000-8000-000000000002', 'Stereo', 'stereo', 'Renfield Lane'),
    ('00000000-0601-4000-8000-000000000003', 'Centre for Contemporary Arts', 'centre-for-contemporary-arts', 'Sauchiehall Street'),
    ('00000000-0601-4000-8000-000000000004', 'Glasgow Film Theatre', 'glasgow-film-theatre', 'Rose Street'),
    ('00000000-0601-4000-8000-000000000005', 'The Glad Cafe', 'the-glad-cafe', 'Pollokshaws Road'),
    ('00000000-0601-4000-8000-000000000006', 'Queens Park Arena', 'queens-park-arena', 'Queens Park'),
    ('00000000-0601-4000-8000-000000000007', 'The Pipe Factory', 'the-pipe-factory', 'Bain Street')
) as venue(id, name, slug, address)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  address = excluded.address,
  city = excluded.city,
  auto_created = excluded.auto_created,
  needs_review = excluded.needs_review;

with mvp_demo_events (
  id,
  external_event_id,
  external_id,
  title,
  slug,
  summary,
  starts_at,
  venue_id,
  event_type_slug,
  source_url,
  is_free,
  price_display,
  availability
) as (
  values
  (
    '00000000-0602-4000-8000-000000000001',
    '00000000-0603-4000-8000-000000000001',
    'demo-live-music-001',
    'Southside Jazz Sketches',
    'southside-jazz-sketches-2026-07-10',
    'A short early-evening set from a local jazz quartet.',
    '2026-07-10 19:30:00+01',
    '00000000-0601-4000-8000-000000000005',
    'live_music',
    'https://www.thegladcafe.co.uk/whats-on',
    false,
    '£8',
    'on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000002',
    '00000000-0603-4000-8000-000000000002',
    'demo-club-night-001',
    'Subcity Radio Night',
    'subcity-radio-night-2026-07-11',
    'Resident DJs share a compact night of new club selections.',
    '2026-07-11 22:00:00+01',
    '00000000-0601-4000-8000-000000000002',
    'club_night',
    'https://www.stereocafebar.com/',
    false,
    '£6',
    'on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000003',
    '00000000-0603-4000-8000-000000000003',
    'demo-comedy-001',
    'Open Mic Comedy Room',
    'open-mic-comedy-room-2026-07-12',
    'A hosted open mic with short sets from Glasgow comics.',
    '2026-07-12 20:00:00+01',
    '00000000-0601-4000-8000-000000000001',
    'comedy',
    'https://www.theoldhairdressers.com/',
    true,
    'Free',
    'not_on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000004',
    '00000000-0603-4000-8000-000000000004',
    'demo-theatre-001',
    'New Writing Scratch Night',
    'new-writing-scratch-night-2026-07-15',
    'Short theatre works in progress followed by informal discussion.',
    '2026-07-15 19:00:00+01',
    '00000000-0601-4000-8000-000000000003',
    'theatre',
    'https://www.cca-glasgow.com/programme/',
    false,
    '£5',
    'on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000005',
    '00000000-0603-4000-8000-000000000005',
    'demo-arts-exhibition-001',
    'Print Exchange Preview',
    'print-exchange-preview-2026-07-16',
    'A preview evening for a small print and risograph exchange.',
    '2026-07-16 18:00:00+01',
    '00000000-0601-4000-8000-000000000007',
    'arts_exhibition',
    'https://www.thepipefactory.co.uk/whats-on',
    true,
    'Free',
    'not_on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000006',
    '00000000-0603-4000-8000-000000000006',
    'demo-workshop-001',
    'Zine Making Workshop',
    'zine-making-workshop-2026-07-18',
    'A practical afternoon session covering folding, layout, and copying.',
    '2026-07-18 14:00:00+01',
    '00000000-0601-4000-8000-000000000003',
    'workshop',
    'https://www.cca-glasgow.com/programme/',
    false,
    '£4',
    'on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000007',
    '00000000-0603-4000-8000-000000000007',
    'demo-talk-001',
    'Clyde Built: Local Archives Talk',
    'clyde-built-local-archives-talk-2026-07-21',
    'An illustrated talk on community archive projects around the Clyde.',
    '2026-07-21 18:30:00+01',
    '00000000-0601-4000-8000-000000000003',
    'talk_lecture',
    'https://www.cca-glasgow.com/programme/',
    true,
    'Free',
    'not_on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000008',
    '00000000-0603-4000-8000-000000000008',
    'demo-film-001',
    'Neighbourhood Shorts Programme',
    'neighbourhood-shorts-programme-2026-07-24',
    'A short film programme by early-career filmmakers based in Glasgow.',
    '2026-07-24 18:15:00+01',
    '00000000-0601-4000-8000-000000000004',
    'film',
    'https://www.glasgowfilm.org/whats-on',
    false,
    '£7',
    'on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000009',
    '00000000-0603-4000-8000-000000000009',
    'demo-family-001',
    'Family Drawing Morning',
    'family-drawing-morning-2026-07-26',
    'A relaxed drawing session for children and accompanying adults.',
    '2026-07-26 10:30:00+01',
    '00000000-0601-4000-8000-000000000006',
    'family',
    'https://qpa.inhouse.scot/',
    true,
    'Free',
    'not_on_sale'
  ),
  (
    '00000000-0602-4000-8000-000000000010',
    '00000000-0603-4000-8000-000000000010',
    'demo-food-drink-001',
    'Community Kitchen Supper',
    'community-kitchen-supper-2026-07-30',
    'A shared supper with a short introduction from the organisers.',
    '2026-07-30 19:00:00+01',
    '00000000-0601-4000-8000-000000000005',
    'food_drink',
    'https://www.thegladcafe.co.uk/whats-on',
    false,
    null,
    null
  )
)

insert into public.events (
  id,
  title,
  normalised_title,
  slug,
  summary,
  description,
  source_url,
  ticket_url,
  ticket_url_label,
  price_min,
  price_max,
  is_free,
  price_display,
  start_at,
  timezone,
  event_type_id,
  venue_id,
  availability,
  primary_source_id,
  visibility,
  confidence,
  confidence_inputs,
  needs_review,
  dedupe_key
)
select
  e.id::uuid,
  e.title,
  public.normalise_title(e.title),
  e.slug,
  e.summary,
  null,
  e.source_url,
  e.source_url,
  'Clyde Culture Demo Data',
  case when e.is_free = false and e.price_display ~ '^£[0-9]+$'
    then replace(e.price_display, '£', '')::numeric
    else null
  end,
  case when e.is_free = false and e.price_display ~ '^£[0-9]+$'
    then replace(e.price_display, '£', '')::numeric
    else null
  end,
  coalesce(e.is_free, false),
  e.price_display,
  e.starts_at::timestamptz,
  'Europe/London',
  et.id,
  e.venue_id::uuid,
  e.availability,
  '00000000-0600-4000-8000-000000000001'::uuid,
  'published',
  90,
  '{"demo_seed": true, "link_first": true}'::jsonb,
  false,
  public.compute_dedupe_key(e.venue_id::uuid, e.starts_at::timestamptz, e.title)
from mvp_demo_events e
join public.event_types et on et.slug = e.event_type_slug
join public.venues v on v.id = e.venue_id::uuid
on conflict (id) do update set
  title = excluded.title,
  normalised_title = excluded.normalised_title,
  slug = excluded.slug,
  summary = excluded.summary,
  description = excluded.description,
  source_url = excluded.source_url,
  ticket_url = excluded.ticket_url,
  ticket_url_label = excluded.ticket_url_label,
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  is_free = excluded.is_free,
  price_display = excluded.price_display,
  start_at = excluded.start_at,
  timezone = excluded.timezone,
  event_type_id = excluded.event_type_id,
  venue_id = excluded.venue_id,
  availability = excluded.availability,
  primary_source_id = excluded.primary_source_id,
  visibility = excluded.visibility,
  confidence = excluded.confidence,
  confidence_inputs = excluded.confidence_inputs,
  needs_review = excluded.needs_review,
  dedupe_key = excluded.dedupe_key;

insert into public.external_events (
  source_id,
  external_id,
  external_url,
  raw,
  title,
  start_at,
  venue_name,
  event_type_guess,
  price_min_guess,
  price_max_guess,
  is_free_guess,
  ticket_url_guess,
  ticket_url_label_guess,
  availability_guess,
  venue_id_guess,
  event_id
)
select
  '00000000-0600-4000-8000-000000000001'::uuid,
  e.slug,
  e.source_url,
  jsonb_build_object(
    'demo', true,
    'title', e.title,
    'summary', e.summary
  ),
  e.title,
  e.start_at,
  v.name,
  et.slug,
  e.price_min,
  e.price_max,
  e.is_free,
  e.ticket_url,
  e.ticket_url_label,
  e.availability,
  e.venue_id,
  e.id
from public.events e
join public.event_types et on et.id = e.event_type_id
join public.venues v on v.id = e.venue_id
where e.primary_source_id = '00000000-0600-4000-8000-000000000001'::uuid
on conflict (source_id, external_id) do update set
  external_url = excluded.external_url,
  raw = excluded.raw,
  title = excluded.title,
  start_at = excluded.start_at,
  venue_name = excluded.venue_name,
  event_type_guess = excluded.event_type_guess,
  price_min_guess = excluded.price_min_guess,
  price_max_guess = excluded.price_max_guess,
  is_free_guess = excluded.is_free_guess,
  ticket_url_guess = excluded.ticket_url_guess,
  ticket_url_label_guess = excluded.ticket_url_label_guess,
  availability_guess = excluded.availability_guess,
  venue_id_guess = excluded.venue_id_guess,
  event_id = excluded.event_id,
  last_seen_at = now();
