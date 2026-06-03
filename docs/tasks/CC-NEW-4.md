# CC-NEW-4: Fix stale runtime references in INGESTION.md, OPERATIONS.md, SPEC.md

**Priority:** P0  
**Area:** Documentation  
**Status:** ✅ Resolved (Sprint 0, 2026-06-03)  
**Closed by:** F1 task

---

## The stale references that were fixed

Three documents contradicted ADR 0002 (Trigger.dev accepted as the ingestion runtime)
and ADR 0003 (Eventbrite API deprecated):

1. **`docs/INGESTION.md`** — the scheduled-job section said ingestion was "implemented
   as a Supabase Edge Function invoked by a cron trigger." Contradicts ADR 0002.

2. **`docs/OPERATIONS.md`** — the Scheduled Ingestion section presented three open
   options (A/B/C) and recommended "Option A — Supabase Scheduled Edge Functions."
   Contradicts ADR 0002.

3. **`docs/reference/SPEC.md`** — the opening paragraph of Core Principles listed
   Eventbrite as a direct API source: "APIs (Ticketmaster, Skiddle, Eventbrite, Meetup)."
   Contradicts ADR 0003. (The source table further in the file was already correct.)

---

## Outcome

All three documents were updated with targeted, surgical edits:

### `docs/INGESTION.md`
- Scheduled-job model section now describes Trigger.dev: ingestion jobs are Trigger.dev
  tasks in `trigger/`, running on the Trigger.dev cloud worker with built-in cron triggers.
  Parent sweep task fans out to per-connector tasks. ADR 0002 referenced.
- Break detection section aligned: "the Trigger.dev sweep task computes..." (not the
  old orchestrator).
- Tier descriptions updated: Eventbrite removed from Tier 1 API list.

### `docs/OPERATIONS.md`
- Scheduled Ingestion section replaced with a Trigger.dev section covering: project setup
  (`@trigger.dev/sdk`, `trigger.config.ts`, tasks in `trigger/tasks/`), secrets
  (`TRIGGER_SECRET_KEY` in dashboard), viewing logs, and manual triggering.
- Options A/B/C removed entirely — decision is made.
- New "Database Connections" section added (closes DB-03): covers direct Postgres
  (port 5432) vs. PgBouncer (port 6543), prepared-statement incompatibility, and which
  endpoint to use for Trigger.dev workers vs. migrations.
- Secrets Management section updated: API keys are set in Trigger.dev project dashboard,
  not Edge Function secrets.

### `docs/reference/SPEC.md`
- Opening paragraph of Core Principles updated: Eventbrite removed from API list;
  DICE.fm added to the scraper/Apify description.
- Source table (already correct) left untouched.

**Acceptance criteria met:**
- No document contains "Edge Function" in the context of ingestion scheduling
- OPERATIONS.md does not present runtime as a 3-way choice
- SPEC.md opening paragraph does not name Eventbrite as a direct API source
