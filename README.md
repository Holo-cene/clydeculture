# Clyde Culture

Glasgow's shared cultural noticeboard — a low-maintenance, link-first platform that
aggregates "what's on" across the city into one structured, searchable index.

This repository is the **engine, documentation, and MVP Astro proof-of-concept** for
the platform. The ingestion, normalisation, deduplication, and publishing layers are
kept separate from the public presentation layer.

## Repository layout

```
docs/            project documentation + architecture decision records (ADRs)
supabase/        database migrations, tests, and local MVP seed data
packages/        the engine (shared, core, connectors)
trigger/         Trigger.dev v3 tasks — sweep and connector orchestration
apps/web/        Astro frontend for the MVP public directory
scripts/         operational and one-off scripts
tests/           cross-package tests
```

See `CLAUDE.md` for the working context every Claude Code session should start from.

## MVP proof-of-concept

The current public proof uses demo-safe seeded data, Supabase RLS, shared public query
helpers, and the Astro app in `apps/web`.

```bash
pnpm install
supabase start
supabase db reset
supabase db test
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @clydeculture/web build
```

Then run the web app with the local public Supabase values from `supabase status`:

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase status> \
pnpm --filter @clydeculture/web dev
```

See `docs/mvp-proof-of-concept.md` for the full demo runbook, seed command, and known
limitations.

## First steps (before writing code)

1. Drop the full platform spec into `docs/reference/SPEC.md`.
2. Drop the existing v5 Postgres schema into `docs/reference/SCHEMA_v5.sql`.
3. Decide the frontend: complete `docs/decisions/0001-frontend-architecture.md`.
4. Generate the documentation set by running the prompts in
   `docs/PROMPTS_FOR_CLAUDE_CODE.md` in order, one at a time, in Claude Code.

## Prerequisites

- Node 20+ and pnpm
- Supabase CLI (`supabase`) for local DB and migrations
- API credentials for production connectors when enabling them (see `.env.example`);
  the local MVP proof does not require live API keys

## Why "engine-first"

Roughly 80% of the real engineering is backend ingestion and data quality, which is
identical regardless of the frontend. Building the engine first means the frontend
decision can be deferred and changed without rework. See `docs/ARCHITECTURE.md`.
