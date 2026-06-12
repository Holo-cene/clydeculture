# 09 — CI Validation Workflow

## Purpose

Add a GitHub Actions workflow that validates the workspace on every push and pull
request. The workflow should confirm the basics — install, test, typecheck, lint, and
Astro build — without overcomplicating CI or requiring live credentials.

---

## Context

The repository currently has no CI workflow. The standard local validation sequence
is documented in `README.md` and `docs/mvp-proof-of-concept.md`:

```bash
pnpm install
supabase db reset
supabase db test
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @clydeculture/web build
```

The `supabase db test` step requires a running local Supabase instance. Running a full
Supabase stack in CI is possible but adds complexity (Docker, port management, startup
time). For a first CI workflow, it is acceptable to separate this into a dedicated
workflow or to skip it with a clear comment explaining why.

The pnpm workspace test suite (`pnpm test`) does not require Supabase for most tests —
unit tests in `packages/core`, `packages/shared`, and `packages/connectors` run
against vitest with no external dependencies. Only `packages/shared/src/db/` tests
that use a real Supabase client require the database.

---

## Files to Inspect

Read all of these before writing the workflow:

- `README.md` — standard validation sequence
- `package.json` (root) — scripts available
- `pnpm-workspace.yaml` — workspace packages
- `packages/core/vitest.config.ts` — vitest config (if present)
- `packages/connectors/src/api/ticketmaster/connector.test.ts` — confirm this test
  does not require TICKETMASTER_API_KEY for fixture-only tests (check for `vi.mock`
  or similar)
- `apps/web/astro.config.mjs` — confirm the Astro build does not require
  `PUBLIC_SUPABASE_URL` at build time (or document what env vars are needed)
- `.env.example` — check what env vars exist and which have safe defaults for CI
- `supabase/config.toml` — check if the local Supabase project ref is used anywhere
  that would require real credentials in CI
- `tsconfig.base.json` — to understand the TypeScript setup

Also check whether there is already a `.github/workflows/` directory:
```bash
find .github -type f 2>/dev/null | sort
```

---

## Task Instructions

### Step 1: Determine the CI scope

Before writing the workflow, decide which steps to include and which to defer. Follow
this decision framework:

**Include (no external dependencies):**
- pnpm install
- `pnpm test` (vitest unit tests — packages/core, connectors, shared type tests)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @clydeculture/web build` (Astro build — check env var requirements)

**Assess (may need mocking or skipping):**
- `supabase db test` — requires Docker/Supabase CLI. If including, use the
  `supabase/postgres` container approach. If deferring, add a comment in the workflow
  explaining why and link to `docs/TESTING.md`.

**Exclude (require live credentials):**
- Any test requiring `TICKETMASTER_API_KEY`
- Any test requiring `SUPABASE_SERVICE_ROLE_KEY` pointing at production

Document which steps are included and which are deferred, with the reason.

### Step 2: Write the workflow file

Create `.github/workflows/ci.yml`.

The workflow should:
- Trigger on: push to any branch, pull_request to main
- Run on: `ubuntu-latest`
- Use Node 20
- Install pnpm (use the version from `package.json` `packageManager` field)
- Cache pnpm store for speed
- Run `pnpm install --frozen-lockfile`
- Run each included check as a separate step with a clear name
- Fail fast: if any step fails, the workflow should fail

For the Astro build step, check whether `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` are needed at build time or only at runtime. If they are
needed at build time, add them as GitHub Actions secrets instructions in a comment
within the workflow file — do not hard-code values.

### Step 3: Write the workflow (no tests required for CI config itself)

This is a configuration-only task. No test-first step is required for the CI workflow
itself. However, you must verify the workflow is valid YAML before committing.

```bash
# Validate YAML (if yamllint is available)
yamllint .github/workflows/ci.yml

# Or use Python's yaml parser
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "Valid YAML"
```

### Step 4: Document why Supabase DB tests are separate

Add a comment block at the top of the workflow file explaining:
- Why `supabase db test` is not included in this workflow (or explaining how it is
  handled if included).
- What a contributor should run locally to replicate the full check suite.
- Where to find the full local check sequence (`docs/mvp-proof-of-concept.md`).

---

## Non-Goals

- Do not add deployment steps.
- Do not set up Supabase in CI unless it is straightforward (e.g. using the official
  `supabase/setup-cli` action with `supabase start`).
- Do not add secrets to the repository.
- Do not add test coverage reporting or artifact uploads in the first pass.
- Do not add preview deployment environments.
- Do not add branch protection rules (those are configured in GitHub UI, not code).

---

## Validation Commands

```bash
# Confirm the workflow file is valid YAML
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "Valid"

# Confirm the workflow triggers and steps look reasonable
cat .github/workflows/ci.yml

# Run the equivalent checks locally to confirm they would pass in CI
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @clydeculture/web build
```

---

## Required Output Format

### Summary

What steps are included in CI and what is deferred, with reasons.

### Workflow File

State the path: `.github/workflows/ci.yml`

### CI Step Coverage Table

| Step | Included | Reason if deferred |
|---|---|---|
| pnpm install | Yes | |
| pnpm test (unit) | Yes | |
| pnpm typecheck | Yes | |
| pnpm lint | Yes | |
| pnpm --filter @clydeculture/web build | Yes/No | |
| supabase db reset + test | No/Yes | Requires Docker / Supabase stack |

### Env Var Requirements

List any environment variables needed for CI steps and whether they need to be set as
GitHub Secrets.

### Validation Output

Paste the output of the YAML validation command.

---

## Acceptance Criteria

- `.github/workflows/ci.yml` is valid YAML.
- The workflow triggers on push and pull_request.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` are included.
- Supabase DB test exclusion is documented with a clear comment.
- No live credentials are hard-coded or committed.
- The workflow is a starting point — it does not need to be comprehensive, but it must
  not be misleading (e.g. it must not claim to run supabase db test if it does not).
