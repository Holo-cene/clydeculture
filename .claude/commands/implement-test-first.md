# Implement test first

Read CLAUDE.md and the relevant docs/files for this task.

You must follow the repository test-driven development policy (see CLAUDE.md §Test-driven
development policy and docs/DEVELOPMENT_WORKFLOW.md).

Task:
$ARGUMENTS

Do not implement production code yet.

## Constraints

- Do not weaken existing tests to make implementation easier.
- Do not remove failing assertions without explaining why they are invalid.
- Do not mock away the behaviour under test.
- Do not mark tests as skipped or todo to claim completion.
- If the contract for this behaviour is missing, stop and propose the contract instead of guessing.
- If no test framework is configured in the target package, configure Vitest (the project standard) before writing the test.

## Steps
1. Identify the behaviours affected by the task.
2. Identify existing tests that may be impacted.
3. Choose the smallest useful test target (file path).
4. Write or update the test.
5. Review the test file: what does it prove, what does it not prove?
6. Explain what edge cases remain uncovered.
7. Provide the exact command to run it.

Then stop.

End with:
Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`
