# F2 — Link-Only Source Enforcement

## Status
Open

## Purpose
Link-only sources (Resident Advisor, Instagram) must not store copied descriptions, summaries, or image URLs in canonical events — Clyde Culture is a routing layer, not a publisher. The current schema has no typed column (`is_link_only`) to indicate this; the normaliser would have to read a JSONB key, which is fragile. This task updates the task file with the full implementation requirements and documents the migration needed. The implementation is not part of Phase 0.5.

## Classification
- Type: docs-only (task file update only in Phase 0.5)
- Blocks: RA and Instagram connector builds only
- Can run in parallel: yes (with all other tasks)
- Must run after: none
- Must run before: RA and Instagram connector implementations

## Files to inspect first
- `docs/tasks/SEC-05.md` — existing task file
- `docs/reference/SCHEMA_v5.sql` — `sources` table (check if `is_link_only` column exists)
- `docs/NORMALISATION.md` — Step 3 or any content about link-only sources
- `CLAUDE.md` — Hard rule #1 (link-first, no republication)

## Files allowed to edit
- `docs/tasks/SEC-05.md` — update with complete requirements

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- `docs/NORMALISATION.md` (read only)

## Non-goals
- Do not add `is_link_only` to the schema.
- Do not implement the normaliser enforcement.
- Do not build any RA or Instagram connector.

## Required steps
1. Read `docs/tasks/SEC-05.md` and `CLAUDE.md` Hard rule #1.
2. Read `docs/reference/SCHEMA_v5.sql` to confirm whether `sources.is_link_only` exists.
3. Update `docs/tasks/SEC-05.md` with the complete requirements:
   - **Migration:** Add `sources.is_link_only boolean NOT NULL DEFAULT false`.
   - **Normaliser:** Read `sources.is_link_only` (typed column, not JSONB key). When `true`, set `summary = null`, `description = null`, `image_url = null` on the canonical event, regardless of what the connector returned.
   - **Test requirement:** A link-only source connector returning `summary = "..."` must produce a canonical event with `summary = null`.
   - **Sources to mark as link-only:** Resident Advisor, Instagram (document both).
   - **Why typed column:** JSONB key lookup is fragile; a typed boolean column is enforced by the schema and visible to any query.
4. Mark as "Not implemented — blocks RA and Instagram connectors only".

## Test command / verification
No automated test — verify by git diff.

```bash
git diff docs/tasks/SEC-05.md
```

## Acceptance criteria
- [ ] `docs/tasks/SEC-05.md` specifies the migration (typed `is_link_only` column).
- [ ] Normaliser behaviour (null out summary/description/image) is specified.
- [ ] Test requirement is documented.
- [ ] RA and Instagram are identified as link-only sources.
- [ ] Rationale for typed column vs JSONB is documented.

## Stop condition
Stop when `docs/tasks/SEC-05.md` is updated. Do not implement. Report:
- whether `is_link_only` already exists in the schema
- any other sources that should be marked link-only
- recommended next prompt: any parallel F or D task
