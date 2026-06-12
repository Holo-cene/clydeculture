# 08 — Demo Data to Realistic Demo URLs

## Purpose

Replace the synthetic `https://example.org/...` source URLs in the demo seed with
clearly permitted real public URLs, so stakeholder demos feel credible without
claiming live ingestion.

---

## Context

The current demo seed (`supabase/seed.sql`) creates 10 synthetic cultural events with:
- Source name: `Demo Eventbrite Feed`
- Source URLs: `https://example.org/clyde-culture-demo/event-1` etc.

These synthetic URLs are obviously fake in a demo context. Stakeholders viewing the
Astro app will see `https://example.org/...` links that go nowhere, which undermines
the credibility of the platform concept.

The fix is to replace synthetic URLs with real, publicly available event listing URLs
from Glasgow venues or legitimate ticketing pages — but the source labels must remain
honest:
- The source name must NOT be changed to "Ticketmaster" or any real connector name.
- The events are still demo/seed data, not ingested events.
- The seed must remain idempotent.

The goal is a demo that reads as a credible cultural noticeboard, not a fake website.

**Important:** This change is cosmetic for demo purposes only. It does not constitute
live ingestion and must not be represented as such in any documentation.

---

## Constraints

- Do not change the source label from `Demo Eventbrite Feed` to `Ticketmaster` or any
  other real connector name. If needed, rename it to `Demo Feed` or `Demo Data`.
- Do not copy real event descriptions or images from external sources.
- Keep summaries short — placeholder discovery copy only (one to two sentences, written
  by the team, not copied from any event listing).
- Use only public, permanently accessible URLs as the `source_url` — e.g., a venue
  homepage, a Ticketmaster Glasgow search page, or a legitimate public event listing
  page for a real past event. Do not link to an upcoming event whose URL may expire.
- Prefer venue website homepages or general "what's on" pages over specific event
  URLs, if specific event URLs would expire.
- Preserve seed idempotency: the seed must be re-runnable without creating duplicates.
- Update `docs/mvp-proof-of-concept.md` to explain that source URLs in the demo seed
  point to real public pages but are not live ingestion.

---

## Files to Inspect

Read all of these before making changes:

- `supabase/seed.sql` — current demo events and source URLs
- `docs/mvp-proof-of-concept.md` — the demo runbook (must be updated)
- `docs/PUBLISHING.md` — link-first policy (summaries must be short; no copying)
- `CLAUDE.md` — "Never store full descriptions or images from link-only sources"
- `docs/source-policy.md` — if created in prompt 07, check permitted source types
- `supabase/tests/mvp_seed_test.sql` — check what is asserted (URL format may be
  tested)

---

## Task Instructions

### Step 1: Propose the replacement URLs (do not edit yet)

Research (from memory or permitted documentation only — do not fetch live URLs)
a list of suitable replacement public URLs for the 10 demo events. For each event:

- Keep the event title, type, and venue unchanged.
- Propose a replacement `source_url` that:
  - Is a real, publicly accessible Glasgow venue or event listing page.
  - Is not an `example.org` URL.
  - Is a stable permanent URL (venue homepage preferred over a specific event URL).
  - Does not point to a specific upcoming event that may expire.

Present this as a table before making any edits:

| Event title | Current URL | Proposed replacement URL | Source label | Notes |
|---|---|---|---|---|

Wait for approval of the URL list before editing the seed file.

### Step 2: Apply the changes (only after approval)

After the URL table is approved:

1. Edit `supabase/seed.sql` to replace the `example.org` source URLs with the
   approved replacements.

2. Update the source label if appropriate. Options:
   - Keep `Demo Eventbrite Feed` but add a comment in the seed that it is demo data.
   - Rename to `Demo Data` or `Clyde Culture Demo` to remove the misleading
     "Eventbrite" association.
   Do NOT rename it to `Ticketmaster` or any real source name.

3. Update `docs/mvp-proof-of-concept.md`:
   - Change the "Source URLs point to `https://example.org/...`" statement to reflect
     the new URLs.
   - Add a note: "Source URLs in the demo seed point to real public pages for
     credibility, but these are not ingested events. The source is labelled as demo
     data, not as a live connector."

4. If `supabase/tests/mvp_seed_test.sql` asserts specific URL patterns, update the
   assertions to match the new URLs.

### Step 3: Run the verification checks

```bash
supabase db reset
supabase db test
pnpm test
```

Confirm 10 published events still exist. Confirm the new URLs appear in the events table.

---

## Non-Goals

- Do not claim the demo events are real ingested data.
- Do not copy real event descriptions from external websites.
- Do not add real images from external sources.
- Do not change the number of demo events (keep 10).
- Do not add new event types or venue rows beyond what already exists.
- Do not change the MVP Astro frontend.
- Do not enable live ingestion.

---

## Validation Commands

```bash
supabase db reset
supabase db test
pnpm test
pnpm --filter @clydeculture/web build
```

Also run:

```sql
SELECT title, source_url FROM events WHERE visibility = 'published' ORDER BY start_at;
```

Confirm no row has an `example.org` URL and no row has a URL that returns 404.

---

## Required Output Format

### Step 1: URL Proposal Table

(Before any edits — present for approval.)

| Event title | Current URL | Proposed replacement URL | Source label | Notes |
|---|---|---|---|---|

### Step 2 (after approval): Files Changed

| File | Change |
|---|---|
| `supabase/seed.sql` | URLs updated for N events |
| `docs/mvp-proof-of-concept.md` | URL description updated |
| `supabase/tests/mvp_seed_test.sql` | (if changed) |

### Verification Results

| Command | Result |
|---|---|
| `supabase db reset` | Pass / Fail |
| `supabase db test` | Pass / count |
| `pnpm test` | Pass / count |
| `pnpm --filter @clydeculture/web build` | Pass / Fail |

### Confirmation

State explicitly: "Demo data source label is [name]. Source URLs are now real public
pages but these events are demo seed data, not live ingested events."

---

## Acceptance Criteria

- No `example.org` URLs remain in the seed.
- The source label does not claim to be a real connector (not "Ticketmaster", not a
  real source name).
- `docs/mvp-proof-of-concept.md` explains that demo URLs are real but not live
  ingested data.
- Seed is idempotent: rerunning `supabase db reset` produces the same 10 events.
- `supabase db test` and `pnpm test` pass.
