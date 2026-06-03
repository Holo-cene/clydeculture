# Implement test first

Read CLAUDE.md and the relevant docs/files for this task.

You must follow the repository test-driven development policy (see CLAUDE.md §Test-driven
development policy and docs/DEVELOPMENT_WORKFLOW.md).

Task:
$ARGUMENTS

Do not implement production code yet.

First:
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
