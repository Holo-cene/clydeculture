# 01 — MVP Acceptance Review

## Purpose

Verify that the MVP public directory is still demoable after any implementation work.
Run this whenever you need to confirm the demo is intact before showing it to
stakeholders, after a merge, or before starting new database or frontend work.

---

## Context

The current MVP public proof uses seeded demo data, Supabase RLS, and the Astro app
in `apps/web`. The seed creates 10 synthetic cultural events with the source name
`Clyde Culture Demo Data` and source URLs pointing to real public venue or event pages
that are safe demo links, not live-ingested source records.

**This seed data is not real ingestion.** It exists to prove the public display path.
Do not treat a passing MVP acceptance review as evidence that Ticketmaster ingestion,
connector parsing, or sweep orchestration works.

The MVP is considered demoable when all of the following are true:
- Local Supabase starts and seed applies cleanly.
- 10 demo events are publicly queryable via the anon key.
- The Astro app renders the event index, search, type filter, and event cards.
- Source provenance and ticketing/status display correctly.
- No secrets are exposed in `apps/web` or in any client-side context.
- All workspace checks pass.

---

## Files to Inspect

- `docs/mvp-proof-of-concept.md` — the canonical demo runbook
- `supabase/seed.sql` — what the seed inserts
- `supabase/tests/mvp_seed_test.sql` — what the pgTAP test asserts
- `packages/shared/src/db/publicQueries.ts` — public Supabase query helpers
- `apps/web/src/pages/index.astro` — main event listing page
- `apps/web/src/lib/supabase.ts` — confirm anon key only; no service role key
- `apps/web/src/components/EventList.astro` — event card rendering
- `.env.example` or equivalent — confirm no secrets in committed files

---

## Task Instructions

Work through every step. Report the result of each step — pass or fail — with the
exact command output.

### Step 1: Reset and seed the local database

```bash
supabase db reset
```

Expected: migrations apply cleanly; seed.sql loads without errors.

If `supabase db reset` fails, stop and report the error. Do not proceed.

### Step 2: Run database tests

```bash
supabase db test
```

Expected: all pgTAP tests pass, including `mvp_seed_test.sql` and
`rls_internal_tables_test.sql`.

### Step 3: Run workspace checks

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @clydeculture/web build
```

Report the output of each command. Record failures honestly.

### Step 4: Verify published events via public query

Run this SQL against the local Supabase instance (use `supabase studio` or psql):

```sql
SELECT id, title, visibility, confidence, source_url
FROM events
WHERE visibility = 'published'
ORDER BY start_at;
```

Expected: exactly 10 rows, all with `visibility = 'published'` and
`confidence >= 60`. Confirm no row has a real Ticketmaster URL and no row uses
`example.org`; source URLs should be public Glasgow venue or event pages chosen for
demo routing.

Also run:

```sql
SELECT s.slug, s.enabled, COUNT(e.id) as event_count
FROM sources s
LEFT JOIN external_events ee ON ee.source_id = s.id
LEFT JOIN events e ON e.id = ee.event_id
GROUP BY s.slug, s.enabled
ORDER BY s.slug;
```

Expected: one source row (`demo-eventbrite-feed` or similar), `enabled = false`,
with 10 linked events.

### Step 5: Start the Astro app and verify manually

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase status> \
pnpm --filter @clydeculture/web dev
```

Open the local URL and verify each of the following. Record pass or fail for each:

| Check | Expected | Pass/Fail |
|---|---|---|
| `/` renders 10 demo events | 10 event cards visible | |
| `/?q=jazz` | Returns the jazz demo event | |
| `/?q=workshop` | Returns the workshop demo event | |
| `/?type=live_music` | Returns the live music demo event | |
| `/?q=film&type=film` | Returns the film demo event | |
| Event card shows venue name | Venue visible on each card | |
| Event card shows event type | Type label visible on each card | |
| Event card shows source name | "Clyde Culture Demo Data" visible | |
| Event card shows "View original" link | Link present on each card | |
| Event card ticketing/status | Displays ticket URL or free status | |
| No service role key in page source | Check browser network tab | |

### Step 6: Confirm no secrets in committed files

```bash
git grep -i "service_role" apps/web/
git grep -i "SUPABASE_SERVICE_ROLE" apps/web/
```

Expected: zero matches. The service role key must never appear in `apps/web`.

---

## Non-Goals

- Do not claim the demo proves real Ticketmaster ingestion.
- Do not fix architecture issues discovered during this review (file bugs for those).
- Do not change seed data, migrations, or frontend code unless a breaking regression
  is found that prevents the demo from running at all.
- Do not add new features or event types.

---

## Required Output Format

### Summary

One sentence: is the MVP demoable or not?

### Step Results Table

| Step | Command | Result | Notes |
|---|---|---|---|
| 1. DB reset | `supabase db reset` | Pass/Fail | |
| 2. DB tests | `supabase db test` | Pass/Fail | |
| 3. Workspace checks | `pnpm test / typecheck / lint / build` | Pass/Fail | |
| 4. Published events query | SQL above | 10 rows / other | |
| 5. Astro manual checks | Per table above | Pass/Fail | |
| 6. No secrets check | `git grep` | Clean / Issues found | |

### Issues Found

For each issue found: what it is, what file or step it appeared in, severity
(demo-blocking / non-blocking), and recommended next action.

### Confirmation

State explicitly: "Demo seed data source name is [name]. Source URLs are [pattern].
This is demo data, not live Ticketmaster ingestion."

---

## Acceptance Criteria

- All six steps are completed and results reported.
- Source provenance is explicitly confirmed in the output.
- No service role key appears in `apps/web`.
- Any failures are listed with severity — the report does not hide failures.
- The distinction between demo seed data and real ingestion is stated explicitly.
