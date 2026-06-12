# 03 — Frontend Publishing Decision

## Purpose

Create or update an ADR clarifying the relationship between Astro and Webflow. The
decision has been made (ADR 0001: Astro + Supabase direct read) but the consequences
for the schema and for Webflow-specific code are not fully reconciled in a single
document. This prompt produces a clear, forward-looking record that resolves the
ambiguity and ensures the schema migration consequences are explicitly committed to.

---

## Context

ADR 0001 (`docs/decisions/0001-frontend-architecture.md`) accepted Astro + Supabase
direct read on 2026-06-02. However, several Webflow artefacts remain:

**In `docs/PUBLISHING.md`:**
> The following tables exist in the v5 schema but are retired under the coded frontend
> path and should be dropped in the schema migration:
> - `publish_mappings`
> - `publish_jobs`
> - `publish_job_items`
>
> The `packages/publishing` package is also removed.

**In ADR 0001 consequences:**
> Schema surgery required before building `apps/web`. The v5 schema was designed with
> a Webflow path in mind. A migration must drop 7 denormalised fields from `events`.

The v5 initial migration (`supabase/migrations/20260531000000_schema_v5_initial.sql`)
may still contain these tables and fields. The CC-NEW-1 migration
(`supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql`) is described as
applying schema corrections, but it may not have completed all the required Webflow
cleanup.

There is no single document that says: Webflow is gone, Astro is the production path,
here are the consequences, here is what is in scope now, and here is what is deferred.

---

## Files to Inspect

Read all of these before writing anything:

- `docs/decisions/0001-frontend-architecture.md` — the accepted decision
- `docs/decisions/0003-scraping-strategy.md` — for source_type 'apify' addition context
- `docs/PUBLISHING.md` — Webflow table retirement list, RLS policy table
- `docs/reference/SCHEMA_v5.sql` — v5 schema (check for Webflow tables/fields)
- `supabase/migrations/20260531000000_schema_v5_initial.sql` — initial schema
- `supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql` — schema corrections
- All other migration files in `supabase/migrations/` (check what was already dropped)
- `apps/web/src/pages/index.astro` — confirm the Astro frontend reads events via joins
- `packages/shared/src/db/publicQueries.ts` — confirm query helpers do not reference
  Webflow denormalised columns (`event_type_label`, `venue_name_display`, etc.)
- `packages/shared/src/types/event.ts` — check for any Webflow-era fields in TypeScript types

---

## Task Instructions

This is a documentation/ADR-only task. Do not implement production code.

1. **Audit the Webflow artefacts.** Check each migration file to determine whether the
   following have already been dropped or are still present:
   - `events` columns: `event_type_label`, `venue_name_display`, `venue_slug_display`,
     `festival_name_display`, `festival_slug_display`, `tags_display`,
     `location_display`
   - Tables: `publish_mappings`, `publish_jobs`, `publish_job_items`
   - Any trigger on `publish_mappings`

2. **Check `packages/shared` and `apps/web`** for any references to these deprecated
   columns or tables. If they appear in TypeScript types or query helpers, note them.

3. **Check ADR 0001** for any open questions or consequences marked as "required" that
   have not been addressed by existing migrations.

4. **Write or update the decision record.** Either:
   - Update `docs/decisions/0001-frontend-architecture.md` with a "State as of [date]"
     section that closes any open consequences, OR
   - Create `docs/decisions/0005-webflow-retirement.md` as a follow-on ADR if the
     scope of the Webflow cleanup warrants a separate record.

   The decision record must contain:
   - **Decision:** Astro + Supabase direct read is the production frontend. Webflow is
     retired and not complemented.
   - **Context:** Why Webflow was considered; why Astro was chosen instead (cite ADR
     0001); what Webflow artefacts remain and their status.
   - **Consequences:** What schema changes are required (list specific columns, tables,
     triggers); what TypeScript types need updating; what is now safe to build in
     `apps/web`; what is explicitly deferred.
   - **Scope now:** What is in scope for the current phase (Astro MVP, Ticketmaster
     fixture E2E, package boundary cleanup).
   - **Explicitly deferred:** Moderation UI, Webflow compatibility shims, membership
     portal, any Phase 2 items.

5. **If Webflow tables or columns are still present in migrations but should be dropped,**
   note them as a migration requirement. Do not write the migration in this task —
   instead add a clear "Migration required" section to the ADR consequences.

---

## Non-Goals

- Do not write any migrations or change the database schema.
- Do not modify `apps/web`, `packages/`, or `trigger/`.
- Do not design the Webflow retirement migration — only document what it needs to do.
- Do not start any new connector work.

---

## Validation Commands

For documentation tasks, validation is a consistency check only:

```bash
git status --short
find docs/decisions -name "*.md" | sort
```

Optionally, if markdown linting is configured:
```bash
pnpm lint
```

---

## Required Output Format

### Summary

One paragraph: what the current state is (Webflow artefacts present or absent), what
the decision record now says, and what migration work is still outstanding.

### Decision Record Created/Updated

State the file path and whether it was created or updated.

### Webflow Artefact Audit

| Artefact | Type | Status | Notes |
|---|---|---|---|
| `events.event_type_label` | Column | Dropped / Still present / Unknown | Which migration |
| `events.venue_name_display` | Column | Dropped / Still present / Unknown | |
| (continue for all 7 columns) | | | |
| `publish_mappings` | Table | Dropped / Still present / Unknown | |
| `publish_jobs` | Table | Dropped / Still present / Unknown | |
| `publish_job_items` | Table | Dropped / Still present / Unknown | |

### Outstanding Migration Requirements

List any schema changes that are required but not yet in a migration file.

### Deferred Items

List everything explicitly deferred and why.

---

## Acceptance Criteria

- A decision record exists (created or updated) that states Webflow is retired.
- The record lists consequences, required migrations, and deferred items.
- The audit table is populated from actual migration file content, not from memory.
- No production code is written.
- `pnpm lint` passes if markdown linting is configured.
