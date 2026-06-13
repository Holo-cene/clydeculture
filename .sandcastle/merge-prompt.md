# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`.
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution, then complete the merge.

After all branches are merged, ensure the merge is committed (a summarising commit if the merges did not already create one).

# DO NOT

- Do **not** run the test suite or typecheck here. This sandbox is bind-mounted onto the host checkout, whose `node_modules` carries the host platform's native binaries, so `pnpm install` no-ops and the suite cannot run reliably in this container. A dedicated verifier runs the tests in a clean worktree immediately after this step.
- Do **not** close any issues. The verifier closes them only if the merged integration is green.

Once you've merged everything you can, output <promise>COMPLETE</promise>.
