-- =============================================================================
-- Issue #17 — Harden auto_create_venue() slug collision loop.
--
-- The cc_new_1 baseline of auto_create_venue() resolved slug collisions by
-- appending `'-' || floor(random()*1000)` on every iteration. That loop is
-- unbounded — repeated collisions compound the random suffix
-- (`venue-342-17-891`) and the function has no termination guarantee.
--
-- This migration replaces the collision loop with a deterministic sequential
-- counter (`-2`, `-3`, ...) capped at 100 iterations. Counter overflow raises
-- an explicit exception rather than spinning or producing pathological slugs.
-- The counter convention matches the events-slug collision strategy described
-- in `docs/NORMALISATION.md`, Step 6.
--
-- Everything else (base slug computation, alias normalisation, the
-- ON CONFLICT DO NOTHING write to venue_aliases) is preserved exactly as
-- left by the cc_new_1 corrections migration.
-- =============================================================================

create or replace function auto_create_venue(
  p_venue_name text,
  p_source_url text default null
)
returns uuid as $$
declare
  v_venue_id        uuid;
  v_base_slug       text;
  v_slug            text;
  v_normalised_name text;
  v_counter         integer := 2;
begin
  -- Slug: strip non-alpha, collapse to hyphens (unchanged from baseline)
  v_base_slug := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', '-', 'g'
  )));

  -- Alias normalisation: strip non-alpha, collapse to spaces
  -- (matches resolve_venue — unchanged from cc_new_1)
  v_normalised_name := lower(trim(regexp_replace(
    regexp_replace(p_venue_name, '[^[:alnum:][:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )));

  v_slug := v_base_slug;

  -- Resolve slug collisions with a deterministic sequential counter
  -- (matches the events-slug convention; see docs/NORMALISATION.md Step 6).
  while exists (select 1 from venues where slug = v_slug) loop
    v_slug := v_base_slug || '-' || v_counter::text;
    v_counter := v_counter + 1;
    -- Bounded loop: refuse to allocate past `-99`. Practically unreachable
    -- for real venue names; if we ever do hit it, the input is almost
    -- certainly garbage (empty/whitespace-only) and the caller should fix
    -- the upstream payload rather than have us spin forever.
    if v_counter > 100 then
      raise exception
        'auto_create_venue: could not generate unique slug for "%" (base "%") after 99 attempts',
        p_venue_name, v_base_slug;
    end if;
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
