# SEC-01: Enforce anon-key-only for the coded frontend path; document service_role blast radius

**Priority:** P1 (Blocker)
**Area:** Security, Architecture
**Status:** Open
**Depends on:** ADR 0001 (frontend architecture decision)

## Why this matters

`SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security. If ADR 0001 resolves to the
coded Next.js path (Path B), the frontend initialises a Supabase client directly. No
document currently states that this client **must** use the anon key, not the service
role key. An AI agent implementing the frontend client could initialise it with
`SUPABASE_SERVICE_ROLE_KEY` — the same env var used in Edge Functions — exposing all
draft, hidden, and archived events, the full `event_submissions` table (including
`submitter_email`), `ingest_runs`, `sources` config, and every other internal table to
public HTTP traffic. This is a total RLS bypass with no recovery other than rotating the
key.

The coded-frontend risk is immediate because ADR 0001 is unresolved. Even for the
Webflow path, the blast radius of the service role key is not explicitly bounded anywhere
in the docs.

---

## Prompt

You are building Clyde Culture. Read `docs/ARCHITECTURE.md` (the "Frontend-dependent
decisions" table and the Supabase section), `docs/OPERATIONS.md` (Secrets Management
section), `docs/PUBLISHING.md` (Path B section), and `docs/reference/SCHEMA_v5.sql`
(RLS section) before proceeding.

**Your task** is to add explicit service_role key constraints and a coded-frontend
client-initialisation guard to two documents. No code or schema changes in this task.

---

### Step 1 — Update `docs/OPERATIONS.md`

In the **Secrets Management** section, after the paragraph that says:

> The service role key bypasses Row Level Security and must be kept out of client-side
> code and committed files at all times.

Add the following paragraph:

> **Blast radius:** A leaked or misused `SUPABASE_SERVICE_ROLE_KEY` exposes the entire
> database with no RLS filtering — including draft and hidden events, all
> `event_submissions` rows (including `submitter_email`), `ingest_runs`, `sources.config`,
> and all internal tables. Rotate immediately if exposure is suspected via the Supabase
> dashboard → Settings → API → Reveal + Roll. The key is used only in:
> (1) Supabase Edge Functions (set via `supabase secrets set`);
> (2) Node ingestion workers (set via environment variable on the host, never in
> `.env.local` or any file committed to the repository).
>
> **Vault vs env:** Use `supabase secrets set` (Edge Function environment) for secrets
> that need to be accessible inside a running Edge Function. Use Supabase Vault
> (`vault.secrets`) only for secrets that must be read by a SQL function at query time —
> this is an uncommon case. Third-party API keys (Ticketmaster, Skiddle, etc.) go in
> `supabase secrets set`. The service role key itself is never stored in Vault.

---

### Step 2 — Update `docs/ARCHITECTURE.md`

In the **"Frontend-dependent decisions"** table, add a new row:

| Decision | Webflow | Coded frontend |
|---|---|---|
| Supabase client key in `apps/web` | Not applicable — no direct DB access | **Anon key only** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Never the service role key. RLS enforces visibility filtering. |

In the **`apps/web`** section, add a warning after "Do not build anything here until
ADR 0001 is resolved.":

> ⚠ **Key constraint (Path B only):** The frontend Supabase client must be initialised
> with the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), never the service role key.
> The anon key is safe to expose in browser code; RLS policies enforce that only
> `visibility = 'published'` events and active venues are visible. Initialising with
> the service role key bypasses all RLS and exposes the full database to public HTTP
> requests.

---

### Step 3 — Update `docs/PUBLISHING.md`

In **Path B — Coded frontend reading Supabase directly**, after the sentence:

> It reads Supabase directly via the standard Supabase client, filtered to
> `visibility = 'published'` and `confidence >= threshold` using Postgres row-level
> security (RLS).

Add:

> The Supabase client in `apps/web` is initialised with `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
> This key is intentionally public — it can only access rows permitted by RLS policies.
> The `SUPABASE_SERVICE_ROLE_KEY` is never imported into `apps/web`.

---

## Acceptance criteria

- [ ] `docs/OPERATIONS.md` defines the blast radius of `SUPABASE_SERVICE_ROLE_KEY` and the two permitted usage contexts
- [ ] `docs/OPERATIONS.md` documents the Vault-vs-env distinction for secret storage
- [ ] `docs/ARCHITECTURE.md` frontend-dependent decisions table includes an "anon key only" row for Path B
- [ ] `docs/ARCHITECTURE.md` `apps/web` section has the key constraint warning
- [ ] `docs/PUBLISHING.md` Path B section states `NEXT_PUBLIC_SUPABASE_ANON_KEY` explicitly
- [ ] No schema or code changes made in this task
