# D6 — Document auto_create_venue() Race Condition Under Parallel Trigger.dev Tasks

## Status
Done

## Purpose
`auto_create_venue()` uses `random()` for slug collision resolution and has a documented race condition in the schema. Under Trigger.dev, each connector runs as a separate task and may call `auto_create_venue()` concurrently for the same unknown venue. Two concurrent calls create two separate `venues` rows with different UUIDs, different random slugs, and therefore different `dedupe_key` values for the same event — producing indefinite merge candidates for every event at that venue. This task documents the risk and chosen mitigation. No code.

## Classification
- Type: docs-only
- Blocks: G1 sweep orchestration design (the sweep task design must account for this)
- Can run in parallel: yes (with all D tasks)
- Must run after: none
- Must run before: G1 (sweep orchestration must be designed with this in mind)

## Files to inspect first
- `docs/NORMALISATION.md` — Step 2 (venue resolution/creation)
- `docs/reference/SCHEMA_v5.sql` — `auto_create_venue()` function definition, `venues` table, `SECURITY DEFINER` note
- `trigger/tasks/sweep.ts` — current sweep task design (sequential vs. parallel)

## Files allowed to edit
- `docs/NORMALISATION.md` — Step 2 concurrency note addition only

## Files not allowed to edit
- Any TypeScript source files (including `trigger/tasks/sweep.ts`)
- Any migration files
- The schema

## Non-goals
- Do not implement the advisory lock.
- Do not change `auto_create_venue()`.
- Do not change the sweep task design.
- Do not replace `random()` with a sequential counter yet.

## Required steps
1. Read `docs/NORMALISATION.md` Step 2 in full.
2. Read `docs/reference/SCHEMA_v5.sql` for the `auto_create_venue()` function body, noting the `random()` usage and any race condition comments.
3. Read `trigger/tasks/sweep.ts` to understand the current concurrency model (sequential vs. fan-out).
4. Update `docs/NORMALISATION.md` Step 2 with a "Concurrency note":
   - **The risk:** Under Trigger.dev parallel tasks, two connectors can call `auto_create_venue()` simultaneously for the same unknown venue name, creating two `venues` rows and indefinite merge candidates.
   - **Phase 1 mitigation option A:** Add a Postgres advisory lock on `hashtext(normalised_venue_name)` inside `auto_create_venue()`. This serialises concurrent venue creation for the same name without changing the calling code. This requires a one-function migration change.
   - **Phase 1 mitigation option B:** Design the sweep task so connectors run sequentially within a single sweep invocation (fan-out by task ID, not by concurrent execution). If true, this must be stated in `trigger/tasks/sweep.ts` comments to prevent future agents from introducing parallelism accidentally.
   - **Chosen mitigation:** [Decision required — leave a TODO marker if not yet decided. Options A and B are not mutually exclusive.]
   - **Additional fix:** Replace `random()` slug suffix with a deterministic sequential counter suffix for reproducible venue stubs.
5. Mark the advisory lock change and the random→counter fix as Phase 1 migration tasks if not already tracked.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
git diff docs/NORMALISATION.md
git diff trigger/tasks/sweep.ts
```

## Acceptance criteria
- [ ] `docs/NORMALISATION.md` Step 2 documents the concurrency risk.
- [ ] At least one mitigation option is described.
- [ ] Whether Phase 1 connectors run sequentially or in parallel is explicitly stated (or marked as a decision required).
- [ ] The `random()` slug replacement is noted as a follow-on task.

## Stop condition
Stop after `docs/NORMALISATION.md` is updated. Report:
- what was added
- whether the current sweep design is sequential or parallel (from reading `sweep.ts`)
- whether a chosen mitigation was identified or left as a decision point
- recommended next prompt: G1 (sweep orchestration) must be informed by this decision
