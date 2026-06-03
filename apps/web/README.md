# apps/web

Clyde Culture's frontend — Astro + Supabase direct read.

**Stack:** Astro, Supabase JS client (`@supabase/supabase-js`), `SUPABASE_ANON_KEY` + RLS.

**How it reads data:** The Astro site queries Supabase directly using the public anon key. Row-Level Security ensures only `visibility = 'published'` events with `confidence >= 60` are returned to the browser. No backend sync adapter.

**Current gate:** Do not build until the CC-NEW-1 schema migration has been applied. CC-NEW-1 drops Webflow fields, adds the `apify` source type, and applies correctness fixes. The schema must be stable before frontend queries are written against it.

**Decision record:** ADR 0001 — `docs/decisions/0001-frontend-architecture.md`
