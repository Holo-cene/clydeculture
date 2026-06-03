# C2 — Pin Confidence Scoring with Red Tests

## Status
Open

## Purpose
There is no automated test for the confidence scoring formula. `docs/tasks/BE-03.md` and `docs/tasks/BE-13.md` both describe confidence calculations but may contradict `docs/NORMALISATION.md` (the canonical source). Without a pinned test, any implementation could use the wrong formula or threshold. This task writes `calculateConfidence.test.ts` using only `docs/NORMALISATION.md` Step 4 as the specification.

**TDD step 1 only** — write the red test file, stop.

## Classification
- Type: red-tests-only (step 1 of two)
- Blocks: normaliser code
- Can run in parallel: yes (after B1 for correct slug values in tests)
- Must run after: B1 (tests use correct event type values)
- Must run before: normaliser implementation

## Files to inspect first
- `docs/NORMALISATION.md` — Step 4 is the canonical confidence specification; use it exclusively
- `docs/tasks/BE-03.md` — check for contradictions with NORMALISATION.md (note them, do not resolve)
- `docs/tasks/BE-13.md` — check for contradictions with NORMALISATION.md (note them, do not resolve)
- `packages/core/src/normalise/` — check what already exists
- `packages/shared/src/types/` — check if `ConfidenceInputs` type exists

## Files allowed to edit
- `packages/core/src/normalise/calculateConfidence.test.ts` (new)
- `packages/shared/src/types/confidence.ts` (new stub type file, if needed to write typed tests)

## Files not allowed to edit
- Any production source files under `packages/core/src/normalise/`
- `docs/NORMALISATION.md` — read only
- `docs/tasks/BE-03.md` — read only (contradictions are flagged in report, not resolved here)
- `docs/tasks/BE-13.md` — read only

## Non-goals
- Do not implement `calculateConfidence()`.
- Do not resolve contradictions between BE-03, BE-13, and NORMALISATION.md — only flag them.
- Do not add any confidence scoring logic to the normaliser.

## Required steps
1. Read `docs/NORMALISATION.md` Step 4 in full. Extract the exact formula:
   - Base score by tier (Tier 1, Tier 2, Tier 3)
   - Additive inputs: `+10 has_start_at`, `+10 venue_resolved`, `+10 type_classified`, `+5 title_quality`, `+5 has_url`, `+10 corroborated`
   - Auto-publish threshold (≥ 60)
2. Read `docs/tasks/BE-03.md` and `docs/tasks/BE-13.md`. Note any values that contradict NORMALISATION.md.
3. Create `packages/shared/src/types/confidence.ts` with a stub `ConfidenceInputs` interface (keys only, no logic):
   ```ts
   export interface ConfidenceInputs {
     hasStartAt: boolean;
     venueResolved: boolean;
     typeClassified: boolean;
     titleQuality: boolean;
     hasUrl: boolean;
     corroborated: boolean;
   }
   ```
4. Create `packages/core/src/normalise/calculateConfidence.test.ts` with tests covering:
   - Tier 1 base score (e.g. 40 — confirm exact value from NORMALISATION.md)
   - Each additive input adds its documented score
   - Full-data Tier 1 event reaches ≥ 80
   - Missing `start_at` (hasStartAt = false) produces < 60 (does not auto-publish)
   - Minimal data (title only, all inputs false) ≤ 40
   - `ConfidenceInputs` JSONB keys match the type defined in step 3
5. Run the tests and confirm they fail (the implementation file does not exist yet).

## Test command / verification
```bash
cd packages/core && pnpm test
# or
pnpm --filter @clyde-culture/core test
```

## Acceptance criteria
- [ ] `packages/core/src/normalise/calculateConfidence.test.ts` exists.
- [ ] `packages/shared/src/types/confidence.ts` exists with `ConfidenceInputs` type.
- [ ] Tests cover tier base scores, each additive input, the auto-publish threshold, and the minimal-data floor.
- [ ] Tests are failing (red) because the implementation does not exist.
- [ ] Any contradictions between BE-03/BE-13 and NORMALISATION.md are noted in the report.

## Stop condition
Stop after the test file is written and confirmed failing. Report:
- files inspected
- files created
- exact formula extracted from NORMALISATION.md Step 4 (base scores and additives)
- contradictions found between BE-03/BE-13 and NORMALISATION.md
- test output showing failure
- recommended next prompt: `Implement docs/tasks/phase-0.5/C2-confidence-red-tests.md step 2. Now implement the smallest production code needed to pass this test. Run the test and report the result.`
