# API-07: Add cold-start break detection rule for connectors with fewer than 14 days of history

**Priority:** P2  
**Area:** Ingestion / Observability  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

The 14-day rolling median break detection rule (70% count drop triggers a `degraded`
alert) requires 14 days of run history to function. A connector that is broken from
the very first run — wrong selector, rejected API key, incorrect endpoint — will
produce `parsedCount = 0` on every run, but no alert fires because there is no
baseline to compare against. The platform owner will not know the connector has never
worked until they manually inspect the run logs.

`docs/INGESTION.md` now documents the cold-start exception rule (added in review): if
`parsed_count = 0` on any run during the cold-start period (fewer than 14 completed runs),
the connector is flagged immediately with `alert_type = 'cold_start_zero'`. This task
implements that rule.

---

## Prompt

You are building Clyde Culture. Read `docs/INGESTION.md` (the updated break detection
section, including the "Cold-start exception" paragraph), `docs/reference/SCHEMA_v5.sql`,
`docs/DATA_MODEL.md`, and `CLAUDE.md` before proceeding.

**Your task** is to implement the cold-start break detection rule as a Postgres function
and document it.

**Step 1 — Add `alert_type` value to the schema:**

Create migration `supabase/migrations/20260602000001_cold_start_alert.sql`:

```sql
-- Extend the ingest_alerts alert_type CHECK to include cold_start_zero.
-- The existing CHECK constraint must be replaced (ALTER TABLE ... DROP CONSTRAINT
-- then re-add with the new value set).
-- Existing values from SCHEMA_v5.sql: 'count_drop', 'fetch_error', 'parse_error'
-- New value: 'cold_start_zero'
alter table ingest_alerts
  drop constraint if exists ingest_alerts_alert_type_check;

alter table ingest_alerts
  add constraint ingest_alerts_alert_type_check
  check (alert_type in ('count_drop', 'fetch_error', 'parse_error', 'cold_start_zero'));
```

Check `docs/reference/SCHEMA_v5.sql` for the actual existing CHECK constraint values
before writing the migration — use the exact existing values.

**Step 2 — Create the `check_cold_start` Postgres function:**

In the same migration file, add:

```sql
-- Called by the orchestrator after each ingest run.
-- If the connector has fewer than 14 completed runs and parsed_count = 0,
-- flags the source as degraded and inserts a cold_start_zero alert.
create or replace function check_cold_start(
  p_source_id uuid,
  p_run_id    uuid
) returns void as $$
declare
  v_run_count      integer;
  v_parsed_count   integer;
begin
  -- Count completed (non-running) runs for this source
  select count(*) into v_run_count
  from ingest_runs
  where source_id = p_source_id
    and status in ('success', 'partial', 'failed');

  -- Only apply the cold-start rule within the first 14 runs
  if v_run_count >= 14 then
    return;
  end if;

  -- Check whether the current run produced zero records
  select parsed_count into v_parsed_count
  from ingest_runs
  where id = p_run_id;

  if v_parsed_count = 0 then
    -- Flag the source
    update sources
    set status = 'degraded'
    where id = p_source_id;

    -- Insert alert (skip if one already exists for this run)
    insert into ingest_alerts (source_id, ingest_run_id, alert_type, resolved)
    values (p_source_id, p_run_id, 'cold_start_zero', false)
    on conflict do nothing;
  end if;
end;
$$ language plpgsql;
```

**Step 3 — Update `docs/INGESTION.md`:**

In the "Break detection" section, after the cold-start exception paragraph (already added),
add a sentence referencing the implementation:

> The cold-start rule is implemented by `check_cold_start(source_id, run_id)`, called by
> the orchestrator immediately after a run completes, before the standard 14-day median
> check runs.

**Step 4 — Update `docs/DATA_MODEL.md`:**

Add `'cold_start_zero'` to the documented `alert_type` values for the `ingest_alerts`
table.

---

## Acceptance criteria

- [ ] Migration file `supabase/migrations/20260602000001_cold_start_alert.sql` exists
- [ ] The migration extends the `alert_type` CHECK constraint with `'cold_start_zero'`
- [ ] `check_cold_start()` function is implemented and handles the 14-run threshold
- [ ] `check_cold_start()` only fires on `parsed_count = 0`, not on low-but-nonzero counts
- [ ] `check_cold_start()` is idempotent (on conflict do nothing prevents duplicate alerts)
- [ ] `docs/INGESTION.md` references the function by name
- [ ] `docs/DATA_MODEL.md` documents `cold_start_zero` as an `alert_type` value
