# Clyde Culture MVP Proof Of Concept

This proof-of-concept demonstrates a small public vertical slice:

demo-safe seed data -> Supabase storage -> public query helpers -> searchable Astro directory.

It is not production ingestion. Ticketmaster/Eventbrite/RSS/iCal ingestion, moderation operations, abuse controls, and Webflow publishing compatibility are still future work.

## What The Seed Contains

`supabase/seed.sql` creates idempotent demo data:

- one disabled demo source, `Demo Eventbrite Feed`
- active Glasgow venues
- 10 synthetic cultural events across multiple existing taxonomy slugs
- matching `external_events` rows linked to canonical `events`

The event summaries are short placeholder discovery copy. Source URLs point to `https://example.org/clyde-culture-demo/...` and are safe for local demo use.

## Prerequisites

- Node 20+
- pnpm 9+
- Supabase CLI
- psql, for the explicit `pnpm mvp:seed` rerun command

## Setup

```bash
pnpm install
supabase start
supabase db reset
```

`supabase db reset` applies migrations and then loads `supabase/seed.sql`.

To rerun only the demo seed against the local Supabase database:

```bash
pnpm mvp:seed
```

The seed is idempotent: rerunning it updates the fixed demo rows instead of creating duplicate visible events.

## Environment

The Astro app reads Supabase through public, RLS-scoped environment variables:

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase status>
```

Do not expose or use `SUPABASE_SERVICE_ROLE_KEY` in `apps/web`.

## Verify The MVP

Run the database checks:

```bash
supabase db test
```

Run the workspace checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @clydeculture/web build
```

Start the Astro app:

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase status> \
pnpm --filter @clydeculture/web dev
```

Open the local Astro URL and verify:

- `/` shows 10 demo events
- `/?q=jazz` returns the jazz demo event
- `/?q=workshop` returns the workshop demo event
- `/?type=live_music` returns the live music demo event
- `/?q=film&type=film` returns the film demo event
- event cards show venue, type, source name, and a `View original` link

## Known Limits

- The demo source URLs are synthetic.
- Production connector scheduling and live API credentials are not required for this proof.
- Public submissions are stored as pending rows only; moderation workflows are not complete.
- Abuse controls such as CAPTCHA and rate limiting are not implemented.
- Webflow publishing compatibility is not part of this Astro proof.
