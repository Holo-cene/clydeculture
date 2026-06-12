# 04 — Ticketmaster Fixture E2E Red Test

## Purpose

Write the failing test that specifies the full Ticketmaster path without using live
APIs. This is a Step 1 (test-first) prompt. Do not implement production code.

---

## Context

The Ticketmaster connector parser and fetch logic are implemented and tested:
- `packages/connectors/src/api/ticketmaster/parse.ts`
- `packages/connectors/src/api/ticketmaster/index.ts`
- `packages/connectors/src/api/ticketmaster/fixtures/response.json`
- `packages/connectors/src/api/ticketmaster/parse.test.ts`
- `packages/connectors/src/api/ticketmaster/connector.test.ts`

What has NOT been proven is the full path from connector output through the database
to a publicly queryable event:

```
Ticketmaster fixture response
  → connector parser → RawEvent[]
  → upsertExternalEvents() → external_events rows (source_id = ticketmaster)
  → normaliseExternalEventsForSource() → canonical events rows
  → visibility = 'published', confidence >= 60
  → getPublishedEvents() anon query returns the event
  → source_url is the Ticketmaster event URL (not example.org)
  → source name is "Ticketmaster" (not "Demo Eventbrite Feed")
```

**Critical distinction:**

> The Astro website currently displays seeded demo data labelled "Source: Demo
> Eventbrite Feed". This proves the public display path, not the real Ticketmaster
> ingestion path.
>
> Do not treat a passing Astro demo as evidence that Ticketmaster ingestion works.

The red test written in this step should fail because the E2E wiring does not yet
exist. After it is written and confirmed to fail, use prompt `05` to implement.

---

## Files to Inspect

Read all of these before writing the test:

- `packages/connectors/src/api/ticketmaster/fixtures/response.json` — the fixture
- `packages/connectors/src/api/ticketmaster/parse.ts` — what fields the parser produces
- `packages/connectors/src/api/ticketmaster/parse.test.ts` — existing parse tests
- `packages/connectors/src/connector.ts` — the `RawEvent` interface
- `packages/shared/src/db/upsertExternalEvents.ts` — how external_events are written
- `packages/shared/src/db/publicQueries.ts` — how published events are queried
- `packages/core/src/normalise/dbNormalise.ts` — (if still in core) or wherever
  `normaliseExternalEventsForSource` lives after prompt 02
- `supabase/migrations/` — check the `sources` table structure; you need a
  Ticketmaster source row in the test
- `supabase/tests/mvp_seed_test.sql` — reference for pgTAP test patterns
- `docs/PUBLISHING.md` — RLS policy rules (visibility + confidence gate)
- `docs/CONNECTOR_GUIDE.md` — externalId and externalUrl invariants

---

## Task Instructions

This is a Step 1 (test-first) task. **Do not implement production code.**

### Determine the right test type

The E2E path involves DB writes and reads, so this test must run against the local
Supabase instance. Determine whether to write:

- A pgTAP test in `supabase/tests/` (SQL assertions against a real local DB), OR
- A Vitest integration test in `packages/shared/src/db/` or `tests/` that uses the
  real Supabase client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` pointed at
  the local instance.

Recommend the pgTAP approach if it can express all five assertions below cleanly.
If pgTAP is insufficient for the connector parse step, use a two-layer approach:
- Unit test for the parse step (already exists — reuse it).
- pgTAP test for the DB path (upsert through to public query).

### Write the test

The test must assert all five steps of the chain. Use deterministic fixture data:

1. **Fixture parsing** — parse the Ticketmaster fixture (or a minimal inline fixture
   shaped like the real API response) into `RawEvent[]`. Assert:
   - At least one event is returned.
   - The first event has `externalId` matching the fixture's event ID.
   - `externalUrl` is a valid HTTPS URL pointing to Ticketmaster (not example.org).
   - `title` is non-empty.
   - `startAt` is a valid ISO 8601 timestamp.
   - (If the fixture contains a known value) `venueName` matches the fixture venue name.

2. **External events upsert** — call `upsertExternalEvents(supabase, sourceId, items)`
   with the parsed events. Assert:
   - A row exists in `external_events` with `external_id` matching the fixture event ID.
   - `source_id` matches the Ticketmaster test source ID.
   - `external_url` is the Ticketmaster event URL.
   - `event_id` is NULL (not yet normalised).

3. **Normalisation** — call `normaliseExternalEventsForSource(client, sourceId)`.
   Assert:
   - A row exists in `events` with `source_url` matching the Ticketmaster event URL.
   - `visibility` is either `'published'` or `'draft'` (not null).
   - `confidence` is a number >= 0.
   - `dedupe_key` is non-null.
   - The `external_events` row now has `event_id` set (non-null).

4. **Public visibility** — query via the anon key using `getPublishedEvents()`. If the
   event reached `visibility = 'published'` and `confidence >= 60`, assert:
   - The event appears in the public query results.
   - `source_url` is the Ticketmaster URL (not example.org).
   If the event is at `'draft'`, record this as a known-acceptable state for now but
   flag it for review.

5. **Source provenance** — assert that the source associated with the event has:
   - `slug = 'ticketmaster'`
   - The source name displayed in any `getPublishedEvents()` result is not
     `'Demo Eventbrite Feed'`.

### Fixture requirements

- Use fixture data, not live API calls. No `TICKETMASTER_API_KEY` should be required.
- Use a deterministic test source row with a known UUID or fixed slug to avoid
  collisions with the demo seed data.
- The test should be runnable against a clean `supabase db reset` state.
- Do not rely on the demo seed data being present — the test must be self-contained or
  must insert its own setup data.

### Link-first compliance assertions

Include an assertion that:
- `external_url` on the `external_events` row is the Ticketmaster event page URL.
- `source_url` on the `events` row is the Ticketmaster event page URL.
- No description field contains copied Ticketmaster content longer than a short
  summary (the `description` column on `events` should be NULL for Ticketmaster
  events at this stage).

---

## Non-Goals

- Do not implement production code in this step.
- Do not call the live Ticketmaster API.
- Do not redesign the database schema.
- Do not modify the demo seed data.
- Do not add new connector types.

---

## Validation Commands

Run these after writing the test. The test should FAIL (red):

```bash
supabase db test
# or
pnpm --filter @clydeculture/shared test
# (depending on which test type you chose)
```

Report the failure output verbatim. A failing test at this stage is the correct outcome.

---

## Required Output Format

### Test Target

State the file path of the test written and the test type (pgTAP / Vitest integration).

### Behaviour Specified

List each of the five chain steps and what the test asserts for each.

### Why This is the Right First Test

Explain why proving the E2E chain with fixtures is the most valuable next test, and
why existing unit tests (parse.test.ts, connector.test.ts) are not sufficient to prove
this path.

### Existing Tests That May Be Impacted

List any existing tests that overlap with or depend on what this test inserts.

### Test Code Review

Brief notes on the test file: structure, fixture data used, any edge cases not yet
covered.

### Failure Output

Paste the verbatim test failure output from running the test. Confirm it fails red
for the right reason (missing wiring, not a syntax error or import failure).

### Edge Cases Not Yet Covered

List behaviours not addressed by this test that should be added in later iterations.

### Next Step

End with exactly:

> Ready for implementation. Prompt me with: `Now implement the smallest production
> code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- The test file exists and specifies the five-step chain.
- The test uses only fixture data — no live API calls.
- The test is deterministic and self-contained.
- The test fails red when run (confirms missing wiring, not a broken test).
- Source provenance is asserted: source slug = 'ticketmaster', not 'Demo Eventbrite Feed'.
- Link-first compliance is asserted: source_url is the Ticketmaster URL.
- No production code is written.
