# TASK

You are the integration verifier. The branches for the issues below have just been merged into this branch, and you are running in a **fresh, clean git worktree** where dependencies install correctly for this platform. Confirm the merged result builds and passes its tests, then record the outcome to a file.

Issues just merged:

{{ISSUES}}

# STEPS

1. Dependencies were installed by the sandbox setup hook (`pnpm install`). If anything looks off, run `pnpm install` once more.
2. Run `pnpm -r typecheck`.
3. Run `pnpm -r test`.

Do **not** edit code or attempt fixes — this step only verifies and records.

# RECORD THE OUTCOME

Write a file named `verify-result.json` at the repository root (your current working directory), with exactly this shape:

`{"passed": <true|false>, "summary": "<one short line>"}`

- Set `passed` to `true` only if BOTH `pnpm -r typecheck` AND `pnpm -r test` succeed.
- `summary` is one line, e.g. `"all packages typecheck and tests pass"`, or `"@clydeculture/web typecheck failed"` / `"core test failed: <name>"`.

Do **not** commit `verify-result.json` — leave it as an untracked file.

# THEN

- If `passed` is `true`: close each issue above with
  `gh issue close <ID> --comment "Verified green by Sandcastle — integration typecheck + tests pass after merge."`
- If `passed` is `false`: do **not** close any issue. For each issue above, leave it open, add a comment noting the merged integration is failing (include the one-line summary), and park it for a human:
  - `gh issue comment <ID> --body "Merged but integration verification is RED: <summary>. Left open for review."`
  - `gh issue edit <ID> --remove-label ready-for-agent --add-label ready-for-human`

Once done, output <promise>COMPLETE</promise>.
