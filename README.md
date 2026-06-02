# Clyde Culture

Glasgow's shared cultural noticeboard — a low-maintenance, link-first platform that
aggregates "what's on" across the city into one structured, searchable index.

This repository is the **engine and documentation** for the platform. It is designed
to be frontend-agnostic: the ingestion, normalisation, deduplication, and publishing
layers do not depend on whether the public site is built in Webflow or in code.

## Repository layout

```
docs/            project documentation + architecture decision records (ADRs)
supabase/        database migrations, edge functions, seed data
packages/        the engine (shared, core, connectors, ingestion, publishing)
apps/web/        frontend placeholder — populated once ADR 0001 is decided
scripts/         operational and one-off scripts
tests/           cross-package tests
```

See `CLAUDE.md` for the working context every Claude Code session should start from.

## First steps (before writing code)

1. Drop the full platform spec into `docs/reference/SPEC.md`.
2. Drop the existing v5 Postgres schema into `docs/reference/SCHEMA_v5.sql`.
3. Decide the frontend: complete `docs/decisions/0001-frontend-architecture.md`.
4. Generate the documentation set by running the prompts in
   `docs/PROMPTS_FOR_CLAUDE_CODE.md` in order, one at a time, in Claude Code.

## Prerequisites

- Node 20+ and pnpm
- Supabase CLI (`supabase`) for local DB and migrations
- API credentials for Ticketmaster, Skiddle, Eventbrite (see `.env.example`)

## Why "engine-first"

Roughly 80% of the real engineering is backend ingestion and data quality, which is
identical regardless of the frontend. Building the engine first means the frontend
decision can be deferred and changed without rework. See `docs/ARCHITECTURE.md`.
