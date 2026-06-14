# 00 — Repository Status Reassessment

## Purpose

Critically reassess the repository state after any implementation branch. Use this
prompt at the start of any session where you are unsure what has been proven, what is
still mocked, or what may have drifted since the last review.

---

## Context

Clyde Culture is a link-first Glasgow cultural noticeboard. The backend engine is
built in TypeScript (pnpm workspaces). The frontend is Astro + Supabase direct read
(ADR 0001). Ingestion runs via Trigger.dev v3. Supabase is the only source of truth.

**Critical distinction — do not conflate these:**

> The Astro website currently displays seeded demo data labelled "Source: Demo
> Eventbrite Feed". This proves the public display path, not the real Ticketmaster
> ingestion path.
>
> Do not treat a passing Astro demo as evidence that Ticketmaster ingestion works.

The five proof levels are distinct:

| Level | What it would prove |
|---|---|
| Public display proof | Astro renders events from Supabase via anon key + RLS |
| Seeded demo data proof | `seed.sql` creates rows that reach `visibility = 'published'` |
| Connector parser proof | Ticketmaster fixtures parse to `RawEvent[]` with correct shape |
| Fixture E2E proof | Fixture → `external_events` → normalisation → canonical `events` → public query |
| Live ingestion proof | Real Ticketmaster API key, real Glasgow events upserted and published |

---

## Files to Inspect

Read all of these before forming any conclusions. Do not rely on README claims alone —
verify against actual code and test files.

**Entrypoints and configuration:**
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `package.json` (root scripts)
- `pnpm-workspace.yaml`

**Documentation:**
- `docs/mvp-proof-of-concept.md`
- `docs/PUBLISHING.md`
- `docs/TESTING.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `docs/decisions/0001-frontend-architecture.md`
- `docs/decisions/0002-ingestion-runtime.md`
- `docs/decisions/0003-scraping-strategy.md`
- `docs/decisions/0004-ticketmaster-image-usage.md`

**Packages:**
- `packages/core/CLAUDE.md` — package invariants
- `packages/core/src/index.ts`
- `packages/core/src/normalise/dbNormalise.ts` — check for I/O violations
- `packages/core/src/ingest/sweep.ts`
- `packages/core/src/ingest/orchestrate.ts`
- `packages/connectors/src/connector.ts`
- `packages/connectors/src/api/ticketmaster/index.ts`
- `packages/connectors/src/api/ticketmaster/parse.ts`
- `packages/connectors/src/api/ticketmaster/fixtures/response.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/db/publicQueries.ts`
- `packages/shared/src/db/upsertExternalEvents.ts`

**Trigger:**
- `trigger/tasks/sweep.ts`
- `trigger/trigger.config.ts`

**Supabase:**
- `supabase/migrations/` (list all files and their dates)
- `supabase/seed.sql` (check source name and URLs)
- `supabase/tests/mvp_seed_test.sql`
- `supabase/tests/rls_internal_tables_test.sql`

**Astro:**
- `apps/web/src/pages/index.astro`
- `apps/web/src/lib/publicQueries.ts` or equivalent (check for any service-role key use)

**Test files (check which exist and whether they pass):**
- `packages/core/src/dedupe/dedupe.test.ts`
- `packages/core/src/normalise/normalise.test.ts`
- `packages/core/src/normalise/dbNormalise.test.ts`
- `packages/core/src/ingest/orchestrate.test.ts`
- `packages/core/src/ingest/sweep.test.ts`
- `packages/connectors/src/api/ticketmaster/parse.test.ts`
- `packages/connectors/src/api/ticketmaster/connector.test.ts`
- `packages/shared/src/db/publicQueries.test.ts`
- `packages/shared/src/db/upsertExternalEvents.test.ts`

---

## Task Instructions

1. **Read every file listed above.** Do not skip files because you assume their content
   from README claims.

2. **Run the standard checks** and record the output verbatim:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

3. **Identify architecture drift.** Specifically check whether `packages/core` contains
   any functions that make DB calls, network calls, or file system calls. The
   `packages/core/CLAUDE.md` invariant is: "No I/O. This package must never import
   Supabase, fetch, fs, or any network/disk dependency." Report any violations.

4. **Check the seed source name.** Open `supabase/seed.sql` and confirm the value of the
   source name inserted. The current expected label is `Clyde Culture Demo Data`.
   Record the exact label and note that it is not a Ticketmaster source.

5. **Check Trigger/sweep wiring.** Open `trigger/tasks/sweep.ts` and record which
   connectors are instantiated, what environment variables are required, and whether the
   sweep task is registered in `trigger/trigger.config.ts`.

6. **Check connector status.** For each directory under `packages/connectors/src/`:
   - Does it contain an `index.ts` (implemented)?
   - Does it contain only a `.gitkeep` (stub placeholder)?
   - Does it have tests?

7. **Populate the status table** (see Required Output section below).

---

## Non-Goals

- Do not implement production code.
- Do not run database migrations or modify seed data.
- Do not start Ticketmaster/Eventbrite/RSS/iCal ingestion.
- Do not change any file in `apps/web`, `packages/`, `trigger/`, or `supabase/`.

---

## Validation Commands

Run these and include the output in your report. Record any failures honestly —
pre-existing failures should be reported as pre-existing, not fixed silently.

```bash
pnpm test
pnpm typecheck
pnpm lint
git status --short
find supabase/migrations -maxdepth 1 -type f | sort
find packages/connectors/src -name "index.ts" | sort
find packages/connectors/src -name ".gitkeep" | sort
```

---

## Required Output Format

### Summary

Two to three sentences. What is the current state of the repository? What is proven and
what is not?

### Proof-level Status Table

| Proof level | Status | Evidence |
|---|---|---|
| Public display (Astro renders events) | Proven / Not proven / Unknown | File, line, or test that confirms or denies |
| Seeded demo data | Proven / Not proven / Unknown | Evidence |
| Connector parser (Ticketmaster fixture) | Proven / Not proven / Unknown | Evidence |
| Fixture E2E (connector → DB → public query) | Proven / Not proven / Unknown | Evidence |
| Live Ticketmaster ingestion | Proven / Not proven / Unknown | Evidence |

### Architecture Drift

List any violations of stated package invariants. For each:
- Package name and invariant violated
- The specific file and function that violates it
- Severity (blocks testing / blocks production / cosmetic)

### Overclaims and Stale Docs

List any README claims, doc statements, or task file statuses that do not match the
actual code state.

### Test Results

Paste the verbatim output of `pnpm test`, `pnpm typecheck`, `pnpm lint`.

### Blockers

Issues that must be resolved before any production work can proceed.

### Non-blocking Issues

Issues that can be deferred without blocking current work.

### Recommended Next Safe Steps

Ordered list of the next three to five safe steps, with rationale for each. Each step
should reference a specific prompt file from `docs/prompts/` where one exists.

---

## Acceptance Criteria

- The status table is populated from file evidence, not from memory or README claims.
- Architecture drift in `packages/core` is identified if present.
- The seed source name is noted and the distinction from Ticketmaster is explicit.
- Connector stubs are identified separately from implemented connectors.
- Pre-existing test failures are reported honestly.
- No production code is written.
