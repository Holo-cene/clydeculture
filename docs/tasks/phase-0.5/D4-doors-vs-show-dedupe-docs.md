# D4 — Specify Doors-vs-Show-Time Dedupe Policy

## Status
Open

## Purpose
When one source uses doors time and another uses show time for the same event, the result is two `external_events` rows with the same venue, same title, and start times 30–60 minutes apart. Without a documented policy, the implementation will either silently auto-merge (losing timing data) or miss the pair entirely. The recommended decision is to send these to human review via `event_merge_candidates`, not auto-merge. This task documents the policy. No code.

## Classification
- Type: docs-only
- Blocks: deduplication implementation
- Can run in parallel: yes (with D1, D2, D3, D5, D6)
- Must run after: none
- Must run before: deduplication implementation

## Files to inspect first
- `docs/DEDUPLICATION.md` — check for any existing doors/show-time section
- `docs/reference/SCHEMA_v5.sql` — `events.start_at`, `events.doors_at`, `event_merge_candidates` fields

## Files allowed to edit
- `docs/DEDUPLICATION.md`

## Files not allowed to edit
- Any TypeScript source files
- Any migration files

## Non-goals
- Do not implement dedupe logic.
- Do not add schema columns.

## Required steps
1. Read `docs/DEDUPLICATION.md` in full and check if a doors/show-time section already exists.
2. Read `docs/reference/SCHEMA_v5.sql` for `events.doors_at` and `event_merge_candidates`.
3. Add a "Doors vs Show Time" section to `docs/DEDUPLICATION.md` specifying:
   - **Policy:** Do NOT auto-merge adjacent-hour same-venue same-title pairs. Send to `event_merge_candidates` for human review.
   - **Rationale:** Merging on time ambiguity is high-risk for Glasgow live music where the distinction between doors and show time matters for attendees.
   - **Detection:** Two external events with the same normalised venue, same normalised title, same date, and start times ≤ 90 minutes apart.
   - **Time field precedence in canonical event:** `start_at` holds the show time (from the higher-tier source). `doors_at` holds the doors time if known.
   - **What happens after human review:** if merged, the lower-tier external event is marked `is_deleted = true` and `doors_at` is populated from it.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/DEDUPLICATION.md
```

## Acceptance criteria
- [ ] `docs/DEDUPLICATION.md` has a "Doors vs Show Time" section.
- [ ] Policy (human review, not auto-merge) is stated with rationale.
- [ ] Detection criteria (≤ 90 min, same venue, same title, same date) are stated.
- [ ] `start_at` vs `doors_at` field precedence is documented.
- [ ] Post-review merge process is described.

## Stop condition
Stop after `docs/DEDUPLICATION.md` is updated. Report:
- what was added
- whether any existing policy contradicted the recommendation
- recommended next prompt: any parallel D task
