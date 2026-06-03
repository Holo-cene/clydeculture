# D1 — Specify Fuzzy-Match Threshold in DEDUPLICATION.md

## Status
Open

## Purpose
`docs/DEDUPLICATION.md` does not state a concrete fuzzy-match threshold. Any agent implementing `find_fuzzy_merge_candidates()` will have to invent one. The Phase 1 threshold is 0.35, with a specific rationale (low enough for "Sub Club: Optimo" / "Optimo at Sub Club", high enough not to flood with different events). This task documents the threshold, rationale, and supporting policies. No code.

## Classification
- Type: docs-only
- Blocks: deduplication implementation
- Can run in parallel: yes (independent of all other tasks)
- Must run after: none
- Must run before: deduplication implementation

## Files to inspect first
- `docs/DEDUPLICATION.md` — current content
- `docs/reference/SCHEMA_v5.sql` — `event_merge_candidates` table definition (unique constraint)

## Files allowed to edit
- `docs/DEDUPLICATION.md`

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any connector implementations

## Non-goals
- Do not implement fuzzy matching.
- Do not add any DB columns or constraints.

## Required steps
1. Read `docs/DEDUPLICATION.md` in full.
2. Read `docs/reference/SCHEMA_v5.sql` for `event_merge_candidates` to confirm the unique constraint structure.
3. Update `docs/DEDUPLICATION.md` to include:
   - **Threshold:** 0.35 (similarity score; 0 = completely different, 1 = identical).
   - **Rationale:** Low enough to catch "Sub Club: Optimo" / "Optimo at Sub Club" title variants. High enough not to flood the merge queue with genuinely different events.
   - **Scope:** Global threshold for Phase 1 (not per-source).
   - **Duplicate candidate prevention:** unique constraint on `(event_id_a, event_id_b)` in `event_merge_candidates`; enforce `event_id_a < event_id_b` to avoid reversed duplicates.
   - **Trade-off:** at 0.35, expect occasional false positives (short-title events at the same venue on the same day may be flagged). Human review resolves these. False negatives (different title formats not caught) are logged but not a blocker.
   - **Worked example:** show a pair of titles and their similarity score passing and failing the threshold.
4. Confirm the `event_merge_candidates` unique constraint from the schema.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/DEDUPLICATION.md
```

## Acceptance criteria
- [ ] `docs/DEDUPLICATION.md` states threshold = 0.35.
- [ ] Rationale for 0.35 is documented.
- [ ] Scope (global, Phase 1) is stated.
- [ ] Duplicate candidate prevention strategy is documented.
- [ ] Trade-off between false positives and false negatives is noted.
- [ ] At least one worked example is included.

## Stop condition
Stop after `docs/DEDUPLICATION.md` is updated. Report:
- what was added
- whether any existing content contradicted the 0.35 threshold
- recommended next prompt: any parallel D task (D2, D3, D4, D5, D6)
