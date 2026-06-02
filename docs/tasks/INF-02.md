# INF-02: Set up CI pipeline

**Priority:** P2  
**Area:** Infrastructure  
**Status:** Open  
**Depends on:** INF-01, BE-18

## Why this matters

No CI configuration exists. CLAUDE.md says "Run lint, typecheck, and tests" but specifies
no commands and no CI host. There are no `.github/workflows/` files. Without CI:

- A connector can be merged that does not typecheck
- A schema migration can be merged with a syntax error
- Tests added in BE-18 provide no regression gate unless CI enforces them
- There is no documented baseline for what "passing" means before a PR merges
- `pnpm-lock.yaml` can drift between environments silently

INF-01 must be complete first — the per-package `typecheck` and `test` scripts must
exist. BE-18 should be complete or in progress so that `pnpm test` runs something real
rather than returning no tests.

---

## Prompt

You are building Clyde Culture. Read `CLAUDE.md`, the root `package.json`, `pnpm-workspace.yaml`,
and `docs/CONTRIBUTING.md` before proceeding. INF-01 must be complete — per-package
`typecheck` and `test` scripts must exist.

**Step 1 — Create `.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    name: TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck all packages
        run: pnpm typecheck

  test:
    name: Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test
```

Two jobs run in parallel: `typecheck` (fast, catches type errors) and `test` (runs
vitest across packages). They are separate so that a type error does not suppress test
output and vice versa.

**Step 2 — Add a CI section to `docs/CONTRIBUTING.md`:**

After the "Pull requests" section, add a "CI" section:

> ## CI
>
> Every push and pull request runs two checks:
>
> - **TypeScript** — runs `pnpm typecheck` across all packages. Must pass.
> - **Tests** — runs `pnpm test` across all packages that have a `test` script. Must pass.
>
> Run both locally before pushing:
>
> ```
> pnpm install
> pnpm typecheck
> pnpm test
> ```
>
> If you add or change a dependency, run `pnpm install` locally to update
> `pnpm-lock.yaml` and commit the updated lockfile. CI uses `--frozen-lockfile`
> and will fail if the lockfile is out of date.
>
> PRs cannot be merged while CI is failing.

**Step 3 — Create `.github/PULL_REQUEST_TEMPLATE.md`:**

```markdown
## What this does
<!-- One paragraph. What changed and why. -->


## Checklist

- [ ] `pnpm typecheck` passes locally
- [ ] `pnpm test` passes locally (or no testable code in this PR)
- [ ] `pnpm-lock.yaml` updated if dependencies changed (`pnpm install`)
- [ ] New connector: follows `docs/CONNECTOR_GUIDE.md` checklist in section 8
- [ ] Schema change: migration file in `supabase/migrations/`, no out-of-band DB edits
- [ ] No secrets committed (no `.env` values, no API keys in config JSON)
```

---

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` exists and defines `typecheck` and `test` jobs
- [ ] Both jobs use `pnpm@9` and `node@20`, matching root `package.json` `engines` and `packageManager`
- [ ] `--frozen-lockfile` is used in all CI `pnpm install` steps
- [ ] `typecheck` and `test` jobs run in parallel (separate jobs, not sequential steps)
- [ ] CI triggers on push to `main` and on pull_request targeting `main`
- [ ] `docs/CONTRIBUTING.md` has a CI section explaining what must pass before merge
- [ ] `docs/CONTRIBUTING.md` includes the `pnpm-lock.yaml` update instruction
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists with the checklist
