> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #11 (Cross-source merge behaviour). Kept as TDD-step-1 implementation reference. See `docs/tasks/MIGRATION_TRIAGE.md`.

# 13a — Merge Behaviour — Docs Update + Red Tests

## Purpose

Two-part task completed in one session:
1. Extend `docs/NORMALISATION.md` Step 8 with a field-level merge priority table.
2. Write failing tests for `mergeExternalEventIntoCanonicalEvent()`.

The docs update must come first — the tests pin behaviour described in the spec.

TDD Step 1 for the tests; the docs update is part of this step.

---

## Skill

Spawn an **Explore** agent to read the schema and NORMALISATION.md before writing.
Use `/implement-test-first` for the test-writing portion.

## Parallelization

Independent of prompt `12`. Must complete before `13b`.

---

## Context

`mergeExternalEventIntoCanonicalEvent()` in `packages/core` decides which source
wins when multiple external events link to the same canonical event. No field-level
merge priority table exists in `docs/NORMALISATION.md` Step 8. Without a spec,
tests cannot pin the correct behaviour.

The rules to encode:
- Better source tier (lower number) wins for all fields
- Same tier: latest fetch date wins
- Null incoming value never overwrites an existing non-null value
- `availability = 'rescheduled'` triggers `needs_review = true`
- Link-first: `source_url` and `external_url` are always kept (never nulled)

---

## Files to Inspect

Spawn an Explore agent to read these in parallel:

- `docs/NORMALISATION.md` (Step 8 current content)
- `docs/reference/SCHEMA_v5.sql` (`events` table — every column)
- `packages/core/src/normalise/normalise.ts` (find `mergeExternalEventIntoCanonicalEvent`)
- `packages/core/src/normalise/normalise.test.ts` (existing merge tests)

---

## Task Instructions

**Part 1 — Update `docs/NORMALISATION.md` Step 8:**

1. Read Step 8 in full. Note what is already there.

2. Add a field-level merge priority table after the existing content, with columns:
   `Field | Better tier wins | Null overwrites non-null | Same-tier tiebreak | Notes`

   Cover every column in the `events` table. Key decisions:

   | Field | Rule |
   |---|---|
   | `title`, `normalised_title` | Better tier wins; same tier: latest fetch |
   | `start_at` | Better tier wins; `needs_review = true` if changed |
   | `end_at`, `doors_at` | Better tier wins; null never overwrites |
   | `image_url`, `ticket_url` | Better tier wins; null never overwrites |
   | `source_url`, `external_url` | Better tier wins; always keep a non-null value |
   | `availability` | Better tier wins; `rescheduled` sets `needs_review = true` |
   | `price_min`, `price_max`, `is_free` | Better tier wins; null never overwrites |
   | `description`, `summary` | Better tier wins; link-only sources may not populate |
   | `confidence`, `visibility` | Recomputed after merge; not merged directly |

3. Add the rescheduled detection rule:
   "If incoming `availability = 'rescheduled'` and the incoming `start_at` differs
   from the canonical `start_at`, update in place and set `needs_review = true`."

**Part 2 — Write failing tests:**

4. Create `packages/core/src/normalise/mergeExternalEventIntoCanonicalEvent.test.ts`:

   **Test: better tier wins for title**
   Tier 1 external event merges with existing canonical sourced from Tier 2. The
   Tier 1 `title` wins. The Tier 2 `title` is discarded.

   **Test: null incoming does not overwrite existing non-null**
   Incoming `ticket_url = null`. Existing `ticket_url = 'https://...'`. After merge,
   `ticket_url` retains the existing non-null value.

   **Test: rescheduled availability sets needs_review**
   Incoming `availability = 'rescheduled'`. Assert `result.needs_review === true`.

   **Test: same-tier latest fetch date wins**
   Two Tier 2 sources. Source A fetched earlier, Source B fetched later. Source B's
   values win for fields where they differ.

   **Test: rescheduled event updates start_at**
   Incoming `availability = 'rescheduled'` with a new `start_at`. Canonical event's
   `start_at` is updated to the new value. `needs_review = true`.

5. Run tests and confirm failures:
   ```bash
   pnpm --filter @clydeculture/core test mergeExternalEventIntoCanonicalEvent
   ```

---

## Non-Goals

- Do not implement `mergeExternalEventIntoCanonicalEvent`.
- Do not add DB columns.
- Do not change the `events` schema.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/core test mergeExternalEventIntoCanonicalEvent
```

Expected: 5 new tests fail; no existing tests broken.

---

## Required Output Format

State what was added to NORMALISATION.md Step 8 (the merge table summary).
List each new test with its assertion and failure reason.

End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] `docs/NORMALISATION.md` Step 8 includes a field-level merge priority table
- [ ] Every `events` column appears in the table (or is explicitly noted as
  `recomputed` rather than merged)
- [ ] 5 failing tests created
- [ ] Tests are failing because the function does not apply these rules yet
- [ ] No production code changed
