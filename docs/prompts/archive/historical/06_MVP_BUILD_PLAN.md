# MVP Public Vertical Slice Build Plan

Purpose: coordinate the first launchable Clyde Culture vertical slice after Phase 0.5.
This plan chooses a conservative MVP: Ticketmaster first, Supabase as source of truth,
Trigger.dev for ingestion, and Astro for the public read layer.

Produced: 2026-06-08.

---

## MVP finish line

The MVP is complete when a Ticketmaster event can move through this path:

1. Ticketmaster connector returns `RawEvent[]`.
2. Connector output is upserted into `external_events` by `(source_id, external_id)`.
3. Normalisation creates or updates a canonical `events` row by `dedupe_key`.
4. The `external_events.event_id` column links the raw row to the canonical row.
5. A high-confidence auto-publishable event is visible through Supabase anon RLS.
6. The Astro app can list and filter that published event.
7. The public submission form can insert a safe `event_submissions` row only.

This MVP does not include DICE, Eventbrite, Skiddle, HTML scrapers, iCal connectors,
venue claims, newsletters, or a custom moderation UI.

---

## Current baseline

The baseline before this MVP prompt set was green:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Existing implementation to build on:

- CC-NEW-1 schema migration exists in `supabase/migrations/`.
- Ticketmaster parser and connector tests exist under `packages/connectors`.
- `packages/shared/src/db/upsertExternalEvents.ts` writes the expanded raw event shape.
- `packages/core` has pure normalisation, dedupe, and orchestration helpers.
- `supabase/tests/rls_internal_tables_test.sql` covers internal-table deny posture and public visibility boundaries.
- `trigger/tasks/sweep.ts` is still a placeholder.
- `apps/web` contains only its README and must remain unpopulated until schema/RLS verification passes.

---

## Build gates

### Gate 1 - Prompt files before agents

Add and review:

- `docs/prompts/06_MVP_BUILD_PLAN.md`
- `docs/prompts/07_MVP_SERIAL_AGENT_PROMPTS.md`

Do not launch implementation agents until both prompt files have been reviewed.

### Gate 2 - Schema and RLS before frontend

Before populating `apps/web`, verify the local schema:

```bash
supabase db reset
supabase db test
```

If the Supabase MCP server is authenticated, use it for read-only inspection of relevant
tables, constraints, and policies. If live MCP state differs from repo migrations, stop
and report the drift. Do not mutate remote Supabase state.

### Gate 3 - TDD for behaviour changes

Every behaviour-changing task follows the repository two-step policy:

1. Write or update the red test only, then stop.
2. After the exact follow-up instruction, implement the smallest production change.

Documentation-only tasks may skip tests, but they should run a targeted consistency check
when they change architecture, schema assumptions, or source contracts.

---

## Implementation sequence

Use `docs/prompts/07_MVP_SERIAL_AGENT_PROMPTS.md` one prompt at a time.

1. Agent 0 - add this build plan and the serial prompt file.
2. Agent 1 - write red SQL tests for the public submission gate.
3. Agent 2 - implement the submission RLS/schema tightening.
4. Agent 3 - write red tests for DB-backed canonical persistence from `external_events`.
5. Agent 4 - implement canonical persistence/linking and auto-publish rules.
6. Agent 5 - write red tests for the Trigger sweep integration boundary.
7. Agent 6 - implement the Trigger sweep against Supabase and registered connectors.
8. Agent 7 - write red tests for shared public query helpers.
9. Agent 8 - implement shared public query helpers.
10. Agent 9 - scaffold Astro and build the MVP public pages after dependency approval.

Run one agent at a time. Review the diff and reported test command before moving to the
next prompt.

---

## Review gate after every agent

After each agent finishes:

1. Inspect `git status --short`.
2. Review the changed files.
3. Run the targeted test command the agent reports.
4. Run the relevant package or Supabase test suite.
5. For implementation steps, also run:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

6. Keep the Ticketmaster source disabled until runtime secrets and the Trigger sweep are
   configured in the target environment.

---

## Source and dependency policy

- Ticketmaster is the only MVP ingestion source.
- DICE, Eventbrite, HTML, RSS, and iCal work remains post-MVP.
- Skiddle remains gated on written commercial approval.
- Astro is approved for `apps/web` by this plan.
- No other frontend, scraping, validation, styling, or UI dependency is approved by default.
- Do not store secrets in committed files.
- Do not commit service-role keys to `apps/web`; the public app must use anon-key-safe reads only.

---

## Acceptance checks

Backend and schema:

```bash
supabase db reset
supabase db test
pnpm test
pnpm typecheck
pnpm lint
```

Frontend:

```bash
pnpm --filter @clydeculture/web build
```

Manual verification:

- The event listing shows only `visibility = 'published'` events with `confidence >= 60`.
- Date, type, and venue filters are reflected in Supabase query constraints.
- Event detail pages link back to the original source.
- Submission form creates only pending submissions and cannot set review fields.
- No public route or client bundle references a service role key.
