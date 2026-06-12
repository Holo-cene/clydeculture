# 16b — RSS Connector — Implementation

## Purpose

TDD Step 2. Implement the RSS connector for the approved Glasgow venue, wire it to
`sweep.ts`, add a `sources` row via migration, and confirm the fixture pipeline
works end-to-end. The connector must pass all tests from `16a`.

Only run after `16a` has produced failing tests.

---

## Skill

Run `/run-checks` after implementation. Run `/code-review low` on the connector.
Run `/verify` to confirm the fixture E2E path if a local Supabase instance is
available.

## Parallelization

Sequential after `16a`.

---

## Context

After passing unit tests, the connector must also be:
1. Exported from `packages/connectors/src/index.ts`
2. Conditionally instantiated in `trigger/tasks/sweep.ts` (enabled only if the
   source row has `enabled = true` in the DB)
3. Backed by a `sources` table row added via migration (with `enabled = false`
   by default — the connector is not turned on in production until manually enabled)

The RSS URL should come from a connector config parameter or environment variable,
not hardcoded in the connector class.

---

## Files to Inspect

- `packages/connectors/src/rss/{slug}/parse.test.ts` (red tests from `16a`)
- `packages/connectors/src/connector.ts`
- `packages/connectors/src/api/ticketmaster/index.ts` (reference pattern for run())
- `packages/connectors/src/index.ts` (add export)
- `trigger/tasks/sweep.ts` (add conditional instantiation)
- `supabase/migrations/` (find latest migration number to increment)
- `packages/shared/src/db/upsertExternalEvents.ts` (confirm it accepts RSS items)

---

## Task Instructions

1. Create `packages/connectors/src/rss/{slug}/parse.ts`:
   - Use `rss-parser` to parse the RSS XML string
   - Apply the field mapping contract from prompt `15`
   - Skip items missing `link` — push a descriptive string to `errors`
   - Return `{ items: RawEvent[], errors: string[] }`

2. Create `packages/connectors/src/rss/{slug}/index.ts`:
   - Implements `Connector` with `slug`, `type: 'rss'`, and `run()`
   - `run()` fetches the RSS URL from config/env, passes the response body to
     `parse.ts`, returns `IngestResult`
   - Wraps fetch in a try/catch — errors go to `IngestResult.errors`, never throw

3. Export from `packages/connectors/src/index.ts`.

4. In `trigger/tasks/sweep.ts`, add conditional instantiation:
   ```typescript
   if (sources.find(s => s.slug === '{slug}' && s.enabled)) {
     connectors.push(new {SlugConnector}({ url: process.env.{SLUG}_RSS_URL }));
   }
   ```

5. Create a migration:
   `supabase/migrations/{timestamp}_add_{slug}_source.sql`
   - Insert into `sources`: `slug = '{slug}'`, `type = 'rss'`, `enabled = false`,
     `name = '{Venue Name}'`, `tier = 2`
   - Default `enabled = false` — this connector must be explicitly enabled in
     production; never enable by default in a migration.

6. Run targeted tests:
   ```bash
   pnpm --filter @clydeculture/connectors test rss
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

7. If a local Supabase instance is available:
   ```bash
   supabase db reset
   supabase db test
   ```
   Confirm the new migration applies cleanly and the `sources` row is inserted.

8. Update `docs/DECISIONS_LOG.md`:
   - Source policy decisions applied (link-first, description handling, date-missing)
   - Connector slug and RSS URL env var name

9. Update `docs/prompts/README.md`: mark prompts `15` and `16a` as completed and
   note them for archiving.

10. Update `docs/LESSONS.md` with any non-obvious discovery from this connector
    (e.g. `rss-parser` quirks, RSS date format inconsistencies encountered).

---

## Non-Goals

- Do not set `enabled = true` in the migration (default is false).
- Do not call the live RSS URL in tests.
- Do not add monitoring/alerting beyond what `sweep.ts` already provides.
- Do not add Playwright or Crawlee for this connector (it is static RSS).

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
supabase db test  # if local instance available
```

Expected: all 8 tests from `16a` pass; all previously passing tests pass;
migration applies cleanly.

---

## Acceptance Criteria

- [ ] All 8 tests from `16a` pass
- [ ] All previously passing tests still pass
- [ ] `pnpm typecheck` clean, no suppressions
- [ ] `sweep.ts` conditionally instantiates the connector
- [ ] Migration adds `sources` row with `enabled = false`
- [ ] RSS URL is read from config/env, not hardcoded
- [ ] `docs/DECISIONS_LOG.md` updated
- [ ] `docs/LESSONS.md` updated
- [ ] Prompts `15` and `16a` noted for archiving in `README.md`
