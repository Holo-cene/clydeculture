# Development workflow

This document describes the standard implementation workflow for the Clyde Culture engine.
The workflow is designed to reduce AI-agent regressions by requiring tests before production
code on every behaviour-changing task.

See `CLAUDE.md` for the full test-driven development policy. See `docs/TESTING.md` for
package-specific test targets and example prompts.

---

## The two-step workflow

Every behaviour-changing implementation task follows two steps.

### Step 1 — write the test, stop

1. Read the relevant docs and source files.
2. Identify affected behaviours.
3. Identify existing tests that should protect those behaviours. If no tests exist for the module yet, that is expected on a greenfield project — write the first test. If no test framework is configured in the target package, configure Vitest first (the project standard) before writing the test.
4. Choose the smallest meaningful test target.
5. Write or update the test.
6. Review the test: what does it prove? what does it not prove? what edge cases remain?
7. Report the exact command to run it.
8. **Stop. Do not write any production code.**

End Step 1 with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

### Step 2 — smallest production implementation

Only after the user says:

> `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

…may production code be written.

1. Implement the smallest change needed to pass the test.
2. Avoid opportunistic refactors or unrelated changes.
3. Run the targeted test.
4. Run the package test suite.
5. Run typecheck and lint.
6. Report changed files, commands run, test results, and remaining risks.

---

## Standard implementation prompt

Use this template when assigning an implementation task to Claude:

```text
Read CLAUDE.md and the relevant docs/files.

Task:
[describe the task]

Follow the repository test-driven development policy.

First, implement the test only.
Do not implement production code yet.

Return:
1. Test target (file path)
2. Behaviour covered
3. Existing tests likely impacted
4. Test file contents or diff summary
5. Code analysis of the test
6. Edge cases not covered
7. Command to run the test

Then stop and wait for:
"Now implement the smallest production code needed to pass this test. Run the test and report the result."
```

---

## Regression-aware test selection

Before writing a test, identify the smallest relevant set covering the affected behaviour:

| Layer | What to include |
|---|---|
| Unit | Direct tests for the changed function or module |
| Integration | Tests for the calling path (e.g. normalise → dedupe) |
| Regression | Tests for previously fragile behaviours in the same area |
| Link-first | Compliance tests where source data or descriptions are involved |
| Schema/RLS | Tests where database visibility or public access is affected |

Run targeted tests first. Run broader regression checks after the implementation is in.

---

## Scope rules

- **No opportunistic refactors.** A bug fix does not need surrounding cleanup.
- **No new dependencies** unless explicitly approved in advance.
- **No schema changes** outside `supabase/migrations/`.
- **No `apps/web` changes** until the CC-NEW-1 migration is applied and reviewed.

---

## Exceptions

See `CLAUDE.md §Test-driven development policy` for the full list of exceptions (docs-only,
ADR-only, exploratory tasks). Tasks explicitly marked as exploratory must be labelled as such
and must not be merged as production code without tests.

---

## Useful references

- `CLAUDE.md` — project rules and hard constraints
- `docs/TESTING.md` — package-specific test targets and example prompts
- `docs/CONNECTOR_GUIDE.md` — connector implementation guide
- `.claude/commands/implement-test-first.md` — reusable slash command for Step 1
