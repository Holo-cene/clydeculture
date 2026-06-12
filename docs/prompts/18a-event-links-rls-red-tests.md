# 18a — All Links per Event + Public RLS (ADR 0005 A1) — Red Tests

## Purpose

Write failing tests for surfacing **every** source/ticket link of a canonical event
to the anon key — the truest form of link-first. Today only one `source_url` /
`ticket_url` is exposed and per-source links in `external_events` are unreadable
publicly.

TDD Step 1 only. Do not implement production code or migrations.

---

## Skill

Use `/implement-test-first`. Use the **Supabase MCP** server (read-only) to verify RLS
behaviour where helpful (per `CLAUDE.md`).

## Parallelization

After prompt `17` (which fixes the exact shape: `event_links` table vs RLS-guarded
view, columns, and the RLS predicate). Independent of `19`, `20`, `21`.

---

## Context

Use the shape decided in prompt `17`. Two test surfaces depending on that decision:

- **If a curated `event_links` table:** the normaliser writes one row per distinct
  source/ticket link for a canonical event; the anon key can read links only for
  published events.
- **If an RLS-guarded view over `external_events`:** the view projects links for
  published parents only; the anon key sees nothing for draft/hidden events.

Either way, link-first and per-source ToS limits from prompt `17` apply: only URLs
permitted for a given source are surfaced (e.g. respect link-only sources).

The dedup model means multiple `external_events` rows (Ticketmaster, Skiddle, DICE,
venue) point at one `events.id` — those are exactly the links to surface, each labelled
by source.

---

## Files to Inspect

- The shape decision and RLS predicate from prompt `17`
- `packages/shared/src/db/publicQueries.ts` — current public read path
- `packages/shared/src/db/publicQueries.test.ts` (if present)
- `supabase/tests/rls_internal_tables_test.sql` — RLS test pattern (pgTAP)
- `packages/ingestion/src/normalise/dbNormalise.ts` — if links are written here
- `supabase/migrations/*` — `external_events` columns (`external_url`, `ticket_url_guess`, source join)

---

## Task Instructions

1. Add a **pgTAP RLS test** (in `supabase/tests/`) asserting:
   - the anon role can read links for an event whose parent `visibility = 'published'`
   - the anon role reads **zero** links for a `draft` / `hidden` / `archived` parent
   - internal-only columns of `external_events` remain unreadable by anon (the link
     projection exposes only permitted fields)

2. Add a **query-layer test** (in `packages/shared`) for a `getEventLinks(eventId)`
   helper (or extension of the event read) asserting:
   - it returns one entry per distinct source/ticket link, each with `url`, `label`,
     and `sourceName`/`sourceSlug`
   - duplicate identical links are de-duplicated
   - a link-only source contributes only its permitted URL(s) per the prompt-`17` policy

3. If prompt `17` chose a curated `event_links` table, add a `dbNormalise` test that a
   canonical event linked to N external events produces N (deduped) link rows.

4. Run the tests and confirm they fail:
   ```bash
   pnpm --filter @clydeculture/shared test
   # pgTAP (if local Supabase available):
   supabase db test
   ```

---

## Non-Goals

- Do not implement the table/view, RLS, normaliser writes, or the query helper.
- Do not open `external_events` wholesale to anon — only the permitted link projection.
- Do not store full descriptions/images from link-only sources (link-first).

---

## Validation Commands

```bash
pnpm --filter @clydeculture/shared test
supabase db test   # if local Supabase available
```

Expected: new tests fail; existing tests pass.

---

## Required Output Format

For each test: file path, assertion, failure reason. State which prompt-`17` shape the
tests target. End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] pgTAP RLS test covers published-only link visibility + internal columns stay hidden
- [ ] Query-layer test covers multi-source links, de-dup, and link-only ToS limits
- [ ] Tests target the exact shape chosen in prompt `17`
- [ ] All new tests fail; existing tests pass
- [ ] No production code or migration written
