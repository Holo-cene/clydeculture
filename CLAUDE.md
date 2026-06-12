# CLAUDE.md

Project context for Claude Code. Read this before doing anything in this repo.

## What this is

Clyde Culture is Glasgow's shared cultural noticeboard: a low-maintenance platform
that aggregates "what's on" from APIs, feeds, and scrapers into one structured,
searchable index, and links back out to the original source. It is a discovery and
routing layer, **not** a publisher. Run as a non-profit community collective.

Full brief: `docs/reference/SPEC.md`. Brand and voice: `docs/BRAND_VOICE.md`.

## Status

Greenfield. The engine is designed to be frontend-agnostic.

Frontend decision accepted 2026-06-02: Astro + Supabase direct read (ADR 0001). Ingestion runtime: Trigger.dev v3 (ADR 0002). Scraping stack: Apify + Crawlee (ADR 0003).

## Development workflow

Before editing:
1. Read CLAUDE.md and the relevant docs.
2. Summarise the task and affected files.
3. Identify open questions or blockers.
4. Propose a plan.
5. Wait for approval before editing unless explicitly told otherwise.

For implementation, follow the **test-driven development policy** below.

Never:
- Make schema changes outside `supabase/migrations/`
- Add dependencies without asking
- Store secrets in committed files
- Do not populate `apps/web` until the CC-NEW-1 schema migration has been applied and reviewed.

## Architecture (engine-first)

> **Per [ADR 0008](docs/decisions/0008-tracer-bullet-delivery.md), "engine-first" is a
> quality bar (Supabase is the source of truth and must be correct), not a sequencing
> rule.** Delivery is tracer-bullet / vertical-slice — see the tracer-bullet PRD (GitHub
> issues) and `CONTEXT.md`.

The bulk of the work is a backend engine that does not care what the frontend is:

- **Source of truth:** Supabase (Postgres). The frontend is a presentation layer only.
- **Ingestion:** scheduled jobs pull from four source types — API, RSS, iCal, HTML —
  store raw payloads, then normalise into canonical `events`.
- **Publishing:** the Astro frontend reads Supabase directly via the anon key scoped
  by RLS. There is no sync adapter.

Monorepo layout (pnpm workspaces):

```
packages/shared       types, taxonomy enums, config, db client
packages/core         normalisation, deduplication, festival detection
packages/connectors   modular connector library (api/ rss/ ical/ html/ apify/)
trigger/              Trigger.dev tasks (sweep, connectors) — replaces packages/ingestion
apps/web              Astro frontend — do not populate until CC-NEW-1 migration is applied
supabase/             migrations, edge functions, seed
docs/                 all project documentation + decision records
```

## Stack

TypeScript (strict). Node. Supabase/Postgres. pnpm workspaces. Connectors are plain
TypeScript modules behind a shared interface (see `packages/connectors/src/connector.ts`).
Trigger.dev v3 (ingestion task runner). Astro (frontend framework, apps/web).
Crawlee (HTML scraping, used inside Apify actors and in-process Trigger.dev tasks).
Apify (managed scraping platform; actor-based connectors for Eventbrite and DICE.fm).

## Hard rules — do not violate these

1. **Link-first.** Clyde Culture routes to sources; it does not republish them. Store
   a short summary at most. Never store full descriptions or images from link-only
   sources (Resident Advisor, Instagram). Respect each source's terms of service.
2. **Source of truth is Supabase**, never the frontend. The frontend is disposable.
3. **Within-source dedup** = upsert by `(source_id, external_id)`. **Cross-source dedup**
   = SHA-256 of `COALESCE(venue_id::text, 'no-venue') | DATE_TRUNC('hour', start_at AT TIME ZONE 'UTC') formatted as 'YYYY-MM-DD-HH24' | normalise_title(title)`. Prefer the
   API-sourced record as canonical over scraped records.
4. **Only `visibility = 'published'` events above the confidence threshold** are eligible
   for the frontend. Everything else stays internal.
5. **Connectors are modular and isolated.** A broken connector must never affect others.
   Every run logs to `ingest_runs`; break detection flags a connector when parsed count
   drops >70% below its 14-day median.
6. **Brand voice applies to editorial and navigational copy only** — not to individual
   community listings, which keep the contributor's voice. See `docs/BRAND_VOICE.md`.
   No hype adjectives, no ranking language ("unmissable", "cutting-edge", "emerging").
7. **No language that ranks events.** A free zine fair sits at the same visual and
   editorial weight as a ticketed opera.

## Conventions

- New connector? Read `docs/CONNECTOR_GUIDE.md` first and implement the shared interface.
- Schema changes go through `supabase/migrations/` — never edit the DB out of band.
- Secrets live in env / Supabase Vault, never in `config` JSON or committed files.
- Keep `description` storage minimal even for permitted sources (link-first).
- Ask before introducing a new dependency or a new external service.

## Test-driven development policy

All development tasks must follow a two-step test-first workflow unless the task is
documentation-only, configuration-only, or explicitly marked as exploratory.

Documentation-only, copy-only, ADR-only, and planning tasks do not need tests. However,
if a documentation task changes development rules, architecture, schema assumptions, or
source contracts, Claude should still run a consistency check where possible.

### Step 1 — test first, no production code

Claude must first write or update the relevant test(s), then stop.

The response must include:

- the test target file path,
- the behaviour being specified,
- why this test is the right first test,
- what existing tests may be impacted,
- a short code review of the test file,
- any edge cases not yet covered,
- the exact command to run the test.

**Claude must not implement production code in this step.**

Claude must end with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

### Step 2 — smallest production implementation

Only after the user gives the exact follow-up instruction, Claude may implement production code.

Claude must:

- make the smallest production change needed to pass the test,
- avoid opportunistic refactors,
- avoid adding dependencies unless explicitly approved,
- run the targeted test,
- run the relevant package test suite if available,
- run typecheck/lint if available,
- report changed files, commands run, test results, and any remaining risks.

### Regression-aware test selection

Before writing or editing tests, Claude must identify the smallest relevant test set for the
affected behaviour. Where possible, include:

- direct unit tests for the changed function/module,
- integration tests for the calling path,
- regression tests for previously fragile behaviours,
- link-first compliance tests where source data is involved,
- schema/RLS tests where database visibility or public access is involved.

Claude should prefer specific targeted tests first, then broader regression checks after
implementation.

### No test gaming

Claude must not:

- weaken an existing test to make implementation easier,
- remove failing assertions without explaining why they are invalid,
- update snapshots blindly,
- mock away the behaviour under test,
- change acceptance criteria without user approval,
- mark tests as skipped/todo to claim completion.

If a test cannot be written because the contract is missing, Claude must stop and propose
the missing contract instead of guessing.

---

## Supabase MCP

A Supabase MCP server is configured in `.mcp.json` for this project (HTTP transport, project ref `jtgszhnqlhkiygtrwpqy`).

**To authenticate:** run `claude /mcp` from a terminal, select `supabase`, choose `Authenticate`, complete the browser flow. Do not commit credentials or paste tokens into any file.

### When to use Supabase MCP

Use Supabase MCP for inspection and read-only verification by default.

Use it before making or reviewing changes that touch: migrations, RLS policies, database functions/triggers/constraints, table or column names, enum/check-constraint values, seed data, or Supabase auth/storage/edge function assumptions.

Claude Code may use it to: inspect table definitions, check RLS policies, review functions/triggers/constraints, and support SQL assertion writing.

### When not to use Supabase MCP

Do not mutate remote data, apply migrations, or change production state unless explicitly instructed.

The repo is canonical for committed project state. Do not use MCP as a substitute for:

- `supabase/migrations/*`
- `docs/reference/SCHEMA_v5.sql`
- `docs/NORMALISATION.md`, `docs/DEDUPLICATION.md`, `docs/PUBLISHING.md`
- `supabase/tests/*`

If live Supabase state differs from repo migrations, **stop and report the drift**. Do not silently update code based on live state not represented in migrations.

### Safety rules

- Never commit credentials, access tokens, or auth output.
- Never use MCP to make destructive live changes unless explicitly instructed.
- Prefer local migrations and `npx supabase db test` for validation.
- Treat MCP as inspection/verification support — not the only source of truth.
- For schema tasks, cite both MCP findings and migration-file evidence in the report.

### Reusable note for future prompts

```text
Before changing Supabase schema, RLS, migrations, functions, triggers, constraints, or seed data,
inspect the relevant migration files and use the Supabase MCP server for verification if available.
If MCP/live state differs from repo migrations, stop and report the drift.
Do not make destructive live Supabase changes.
```

---

## Useful references in this repo

- `docs/prompts/01_PROMPTS_FOR_CLAUDE_CODE.md` — the prompt sequence used to build the initial docs set (historical; see archive notice in that file).
- `docs/reference/SPEC.md` — the full platform specification (paste it in if missing).
- `docs/reference/SCHEMA_v5.sql` — the existing v5 schema (paste it in if missing).
- `docs/TESTING.md` — package-specific test targets, example prompts, and test commands.
- `docs/DEVELOPMENT_WORKFLOW.md` — the step-by-step implementation workflow.

## Agent skills

### Issue tracker

GitHub issues in `Holo-cene/clydeculture` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at root; ADRs in `docs/decisions/`. Work lives as GitHub issues, not in docs. See `docs/agents/domain.md`.