# apps/web

Clyde Culture's frontend — Astro + Supabase direct read.

**Stack:** Astro, Supabase JS client (`@supabase/supabase-js`), `PUBLIC_SUPABASE_ANON_KEY` + RLS.

**How it reads data:** The Astro site queries Supabase directly using the public anon key. Row-Level Security ensures only `visibility = 'published'` events with `confidence >= 60` are returned to the browser. No backend sync adapter.

**Local setup:**

```bash
supabase db reset
```

Then start the app with the Publishable key from `supabase status`:

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase status> \
pnpm dev
```

**Decision record:** ADR 0001 — `docs/decisions/0001-frontend-architecture.md`
