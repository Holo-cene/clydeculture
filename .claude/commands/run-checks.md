# Run checks

Run typecheck, lint, and tests for the packages touched in this session, then report results.

If you know which package(s) were modified, run targeted checks first:

```bash
pnpm --filter @clydeculture/PACKAGE typecheck
pnpm --filter @clydeculture/PACKAGE lint
pnpm --filter @clydeculture/PACKAGE test
```

Then run the full workspace checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Report:
1. Which packages were checked
2. Typecheck — pass or fail, with any errors quoted
3. Lint — pass or fail, with any errors quoted
4. Tests — pass or fail, test count, any failures quoted
5. Any remaining risks or follow-up needed
