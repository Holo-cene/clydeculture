# D3 — Define Upstream Removal/Cancellation Propagation

## Status
Done

## Purpose
The docs currently use "N missed runs" as a placeholder for when a missing event should be considered removed. Trigger.dev sweep tasks cannot be safely implemented without a concrete number. Additionally, multi-source cancellation behaviour (what happens when one source cancels an event but another source still lists it) is undecided. This task resolves both. No code.

## Classification
- Type: docs-only
- Blocks: G1 sweep orchestration implementation
- Can run in parallel: yes (with D1, D2, D4, D5, D6)
- Must run after: none
- Must run before: G1

## Files to inspect first
- `docs/INGESTION.md` — current lifecycle and missed-run content
- `docs/PUBLISHING.md` — current visibility transition content
- `docs/reference/SCHEMA_v5.sql` — `external_events.is_deleted`, `events.visibility`, `ingest_alerts`

## Files allowed to edit
- `docs/INGESTION.md`
- `docs/PUBLISHING.md`

## Files not allowed to edit
- Any TypeScript source files
- Any migration files

## Non-goals
- Do not implement any lifecycle logic.
- Do not add schema columns.

## Required steps
1. Read `docs/INGESTION.md` and `docs/PUBLISHING.md` in full.
2. Search for all "N missed runs" placeholders and list them.
3. Update both files with these decisions:

   **Missed run thresholds by tier:**
   - Tier 1 API: 3 consecutive missed successful runs → set `external_events.is_deleted = true`
   - Tier 2 RSS/iCal/Apify: 3 consecutive missed successful runs → set `external_events.is_deleted = true`
   - Tier 3 HTML: 5 consecutive missed successful runs → set `external_events.is_deleted = true`

   **Canonical event visibility transition:**
   - Set `events.visibility = 'hidden'` only when ALL linked external events are deleted or cancelled.
   - Exception: a Tier 1 source explicitly sending `availability = 'cancelled'` → hide immediately regardless of other sources.

   **`is_deleted` flag:**
   - Set when: `last_seen_at` has not been updated in the required number of consecutive runs.
   - Not set retroactively when a connector is temporarily disabled — only when the event is missing from an otherwise-successful run.

   **`ingest_alerts` for sustained drops vs. single-run anomalies:**
   - Single-run count drop: `count_drop` alert.
   - Zero result on first run: `cold_start_zero` alert.
   - Sustained drop (3+ consecutive): `connector_break` alert.

4. Remove all "N missed runs" placeholder text.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/INGESTION.md docs/PUBLISHING.md
```

## Acceptance criteria
- [ ] No "N missed runs" placeholder remains in `INGESTION.md` or `PUBLISHING.md`.
- [ ] Tier-specific missed-run thresholds are documented (Tier 1/2: 3, Tier 3: 5).
- [ ] Multi-source cancellation behaviour is documented.
- [ ] Tier 1 explicit cancel override is documented.
- [ ] `ingest_alerts` alert types for sustained vs. single drops are defined.

## Stop condition
Stop after both files are updated. Report:
- all "N missed runs" placeholders found and replaced
- any ambiguities about what constitutes a "successful run"
- recommended next prompt: any parallel D task or G1 (once B2/B3/B4 are complete)
