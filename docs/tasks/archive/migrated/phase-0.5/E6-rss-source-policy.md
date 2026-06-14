> **ARCHIVED 2026-06-13.** Migrated to issue #29 (RSS connector: preflight + first source + pipeline integration). See `docs/tasks/MIGRATION_TRIAGE.md`.

# E6 — RSS Source Policy

## Status
Open

## Purpose
Not all RSS feeds are structured event feeds. Glasgow Art Map and venue Substacks publish editorial/newsletter content with partial event data — no `startAt`, variable structure, no unique event IDs. Without a policy distinguishing Type A (structured event feed) from Type B (editorial/newsletter), connectors will store newsletter posts as draft events or silently create low-quality entries with zero confidence. This task documents the classification policy. No code.

## Classification
- Type: spike (policy documentation)
- Blocks: Glasgow Art Map and venue Substack RSS connector builds
- Can run in parallel: yes (with E1–E5, E7, D tasks, H1)
- Must run after: none
- Must run before: RSS connector implementations

## Files to inspect first
- `docs/tasks/API-05.md` — existing RSS task file
- `docs/CONNECTOR_GUIDE.md` — check for any existing RSS connector guidance
- `docs/reference/SCHEMA_v5.sql` — `sources.config` JSONB structure (any existing `rssType` field?)

## Files allowed to edit
- `docs/tasks/API-05.md` — update with policy decisions
- `docs/CONNECTOR_GUIDE.md` — add RSS section or append to existing guidance (only if no separate doc is more appropriate)

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- `docs/reference/SCHEMA_v5.sql`

## Non-goals
- Do not implement any RSS connector code.
- Do not add `rssType` to the schema (document it as a `sources.config` JSONB key, not a schema column).
- Do not create a separate `docs/RSS_SOURCE_POLICY.md` — append to CONNECTOR_GUIDE.md or API-05.md.

## Required steps
1. Read `docs/tasks/API-05.md` and `docs/CONNECTOR_GUIDE.md` in full.
2. Update `docs/tasks/API-05.md` (and `docs/CONNECTOR_GUIDE.md` if appropriate) with the following policy:

   **Type A — Structured event feed:**
   - Each item is a discrete event with title, start date, venue, URL.
   - Standard connector processing applies.
   - `sources.config.rssType = 'event_feed'`.
   - Example: a venue's official event RSS feed.

   **Type B — Editorial/newsletter:**
   - Items are articles or newsletters that may mention events but lack structured start dates.
   - `sources.config.rssType = 'newsletter'`.
   - Confidence cap: ≤ 30 for all events derived from newsletter items.
   - `startAt` absent: use `time_tba = true` convention (per C7 docs). Do not skip the item — create a draft record with `visibility = 'draft'`.
   - Newsletter items create event records only if they contain a detectable date. If no date is detectable, store as an `external_events` row with `parsed_count` increment but no canonical event creation.
   - Example: Glasgow Art Map newsletter, venue Substack.

   **`sources.config.rssType` field:**
   - This is a JSONB key in `sources.config`, not a schema column.
   - Valid values: `'event_feed'` | `'newsletter'`.
   - Default (if not set): `'event_feed'` (safer assumption for structured feeds).

3. Document how the connector reads `rssType` from `sources.config` at runtime.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/tasks/API-05.md docs/CONNECTOR_GUIDE.md
```

## Acceptance criteria
- [ ] Type A and Type B RSS sources are defined.
- [ ] `sources.config.rssType` field is documented.
- [ ] Confidence cap ≤ 30 for newsletter items is stated.
- [ ] `startAt` absent handling for newsletter items is specified.
- [ ] Default value for `rssType` is specified.

## Stop condition
Stop when the policy is documented. Report:
- files updated
- any ambiguity about which Phase 1 sources are Type A vs Type B
- recommended next prompt: RSS connector implementation (Wave 5)
