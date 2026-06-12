# 18b — All Links per Event + Public RLS (ADR 0005 A1) — Implementation

## Purpose

TDD Step 2. Make the `18a` tests pass: create the `event_links` projection (table or
RLS-guarded view per prompt `17`), its public RLS, the normaliser write (if a table),
and the `getEventLinks` read helper — so the anon key can see every permitted
source/ticket link for a published event.

Only run after `18a` has produced failing tests.

---

## Skill

Run `/run-checks`. Run `/code-review medium` (RLS + new read path warrant more than
`low`). Verify RLS with the read-only **Supabase MCP** server.

## Parallelization

Sequential after `18a`. Independent of `19`, `20`, `21`.

---

## Context

Implement exactly the shape accepted in prompt `17`. Schema changes go through a new
file in `supabase/migrations/` — never edit the DB out of band (`CLAUDE.md`). The
migration must not weaken existing RLS: `external_events` internal columns stay
service-role-only; only the permitted link projection is anon-readable, and only for
published parents.

---

## Files to Inspect

- The `18a` failing tests + the prompt-`17` shape decision
- `supabase/migrations/*` — latest timestamp to increment; existing RLS policies
- `packages/shared/src/db/publicQueries.ts` — where `getEventLinks` belongs
- `packages/ingestion/src/normalise/dbNormalise.ts` — if links are written on normalise

---

## Task Instructions

1. Create the migration: the `event_links` table **or** the RLS-guarded view, plus its
   public read policy (published parent only). Keep the link-only / ToS restrictions
   from prompt `17` enforced (only permitted URLs surfaced).

2. If a table: extend the normaliser to write/upsert one deduped link row per distinct
   permitted source/ticket URL for the canonical event. Preserve existing link-first
   gating; do not store descriptions/images from link-only sources.

3. Add `getEventLinks` (or extend the event read) in `packages/shared` returning
   `{ url, label, sourceName, sourceSlug, kind }[]`, deduped.

4. Run the tests:
   ```bash
   pnpm --filter @clydeculture/shared test
   supabase db reset && supabase db test   # if local Supabase available
   pnpm test && pnpm typecheck && pnpm lint
   ```

5. Update docs:
   - `docs/DECISIONS_LOG.md` — the shape chosen (table vs view), RLS predicate, files
   - `docs/PUBLISHING.md` — note links are now publicly readable for published events
   - `docs/DATA_MODEL.md` — flip the A1 row from "planned" to "shipped" with the real shape

---

## Non-Goals

- Do not expose `external_events` internal columns to anon.
- Do not surface links for non-published events.
- Do not change the dedup or confidence logic here.
- Do not add the connector-facing UI (frontend consumes `getEventLinks` separately).

---

## Validation Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
supabase db test   # if local Supabase available
```

Expected: all `18a` tests pass; existing tests + RLS tests pass.

---

## Acceptance Criteria

- [ ] All `18a` tests pass
- [ ] Migration adds the link projection + public RLS (published parent only); applied cleanly via `supabase db reset`
- [ ] Anon can read permitted links for published events; nothing for draft/hidden; internal columns stay hidden
- [ ] `getEventLinks` returns deduped, source-labelled links
- [ ] `docs/DECISIONS_LOG.md`, `docs/PUBLISHING.md`, `docs/DATA_MODEL.md` updated
- [ ] No previously passing test or RLS test regressed
