# CC-NEW-1: Schema migration — drop Webflow fields/tables, add apify source_type, correctness batch

**Priority:** P0  
**Area:** Database / Schema  
**Status:** Complete  
**Depends on:** CC-NEW-3 (confidence threshold decision — resolved, use Option A)

---

## Why this exists

The v5 schema was designed with a Webflow CMS frontend in mind. ADR 0001 rejected
Webflow in favour of Astro + Supabase direct read. Several schema objects exist solely
for the Webflow sync path and must be removed before `apps/web` is built. Additionally,
a batch of correctness fixes (UTC dedup, apify source type, RLS policy, alert types)
are most efficiently applied in the same migration.

---

## Role

You are a Supabase Postgres expert writing a schema migration for the Clyde Culture
project. Read the baseline migration first:

```
supabase/migrations/20260531000000_schema_v5_initial.sql
```

Also read:
- `docs/decisions/0001-frontend-architecture.md` (§Consequences — lists exact fields/tables to drop)
- `docs/decisions/0003-scraping-strategy.md` (source_type = 'apify' requirement)
- `docs/PUBLISHING.md` (RLS policy — D1 resolution, Option A)
- `docs/NORMALISATION.md` Step 5 (compute_dedupe_key must use UTC)
- `docs/tasks/CC-NEW-3.md` (D1 decision record)

---

## Changes required

Create a new migration file:
```
supabase/migrations/20260603000000_schema_corrections.sql
```

### 1. Drop Webflow-only fields from `events`

Per ADR 0001 §Consequences, these 7 columns exist solely for the Webflow sync job:

```sql
alter table events
  drop column if exists event_type_label,
  drop column if exists venue_name_display,
  drop column if exists venue_slug_display,
  drop column if exists festival_name_display,
  drop column if exists festival_slug_display,
  drop column if exists tags_display,
  drop column if exists location_display;
```

### 2. Drop Webflow sync tables and their triggers

```sql
-- Drop trigger first (references publish_mappings)
drop trigger if exists on_publish_mapping_change on publish_mappings;

-- Drop sync tables
drop table if exists publish_job_items;
drop table if exists publish_jobs;
drop table if exists publish_mappings;
```

### 3. Add `'apify'` to `sources.source_type` CHECK constraint

The current constraint is:
`check (source_type in ('api', 'rss', 'ical', 'html', 'manual'))`

PostgreSQL does not support `ALTER TABLE ... ALTER CHECK` — you must drop and recreate:

```sql
alter table sources drop constraint if exists sources_source_type_check;
alter table sources add constraint sources_source_type_check
  check (source_type in ('api', 'rss', 'ical', 'html', 'apify', 'manual'));
```

### 4. Fix `compute_dedupe_key()` — add UTC truncation (BE-09)

The current function uses `date_trunc('hour', p_start_at)` without UTC, meaning BST
events produce different keys than their UTC equivalent. The authoritative formula
(from `docs/NORMALISATION.md` Step 5) uses `AT TIME ZONE 'UTC'`.

```sql
create or replace function compute_dedupe_key(
  p_venue_id uuid,
  p_start_at timestamptz,
  p_title   text
) returns text
  language sql
  immutable
as $$
  select encode(
    sha256(
      (
        coalesce(p_venue_id::text, 'no-venue')
        || '|'
        || to_char(date_trunc('hour', p_start_at at time zone 'UTC'), 'YYYY-MM-DD-HH24')
        || '|'
        || normalise_title(p_title)
      )::bytea
    ),
    'hex'
  );
$$;
```

### 5. Fix the public RLS policy on `events` (CC-NEW-3 / D1 resolution)

The baseline has: `using (visibility = 'published')` — missing `confidence >= 60`.

```sql
drop policy if exists "Public read events" on events;
create policy "Public read events"
  on events for select
  to anon
  using (visibility = 'published' and confidence >= 60);
```

### 6. Add `'cold_start_zero'` to `ingest_alerts.alert_type` CHECK

The baseline CHECK is `('count_drop', 'parse_failure', 'timeout', 'manual')`.
`cold_start_zero` is referenced in `docs/INGESTION.md` as the alert for a connector
that returns 0 items on its first ever run (no 14-day median to compare against).

```sql
alter table ingest_alerts drop constraint if exists ingest_alerts_alert_type_check;
alter table ingest_alerts add constraint ingest_alerts_alert_type_check
  check (alert_type in ('count_drop', 'parse_failure', 'timeout', 'manual', 'cold_start_zero'));
```

### 7. IANA timezone validation on `events.timezone`

The current column has `default 'Europe/London'` but no CHECK constraint ensuring the
value is a valid IANA timezone. Add a constraint using Postgres's built-in timezone
validation:

```sql
alter table events add constraint events_timezone_valid
  check (now() at time zone timezone is not null);
```

This is evaluated at insert/update time and rejects invalid timezone strings.

---

## Acceptance criteria

- [ ] `events` table has no Webflow-only columns (`event_type_label`, `venue_name_display`, etc.)
- [ ] `publish_mappings`, `publish_jobs`, `publish_job_items` tables are gone
- [ ] `sources.source_type` CHECK includes `'apify'`
- [ ] `compute_dedupe_key()` uses `AT TIME ZONE 'UTC'` in the `date_trunc` call
- [ ] `"Public read events"` RLS policy includes `confidence >= 60`
- [ ] `ingest_alerts.alert_type` CHECK includes `'cold_start_zero'`
- [ ] `events.timezone` has a valid IANA constraint
- [ ] `pnpm supabase:reset` applies both migrations cleanly (no errors)
- [ ] `pnpm supabase:types` regenerates `packages/shared/src/database.types.ts` without error

---

## Notes

- The `validate_event_consistency()` function in the baseline references dropped columns
  (`event_type_label`, `venue_name_display`, `festival_name_display`). Update or drop
  this function in the same migration.
- Run `supabase db reset` locally after applying to catch FK constraint errors.
- The `dedupe_key` column on existing rows will be stale after changing `compute_dedupe_key()`.
  Run a data backfill: `UPDATE events SET dedupe_key = compute_dedupe_key(venue_id, start_at, title);`
  Include this in the migration.
