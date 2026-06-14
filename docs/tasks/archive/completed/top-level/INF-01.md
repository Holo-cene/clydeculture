# INF-01: Bootstrap per-package TypeScript and dependency configuration

**Priority:** P1  
**Area:** Infrastructure  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

The monorepo layout exists (`pnpm-workspace.yaml`, `.gitkeep` files in `packages/*/src/`)
but none of the five packages have a `package.json` or `tsconfig.json`. The root
`package.json` stubs all scripts with `echo "TODO"`. This means:

- `pnpm --filter @clydeculture/connectors add rss-parser` (from CONNECTOR_GUIDE.md) fails
  because there is no `packages/connectors/package.json` to write to
- TypeScript cannot build or type-check any package; `pnpm typecheck` runs nothing
- Workspace cross-references (`@clydeculture/shared`) cannot resolve
- Every task that produces TypeScript (BE-01 through BE-20, all API tasks) will fail at
  the first `tsc` call because there is no `tsconfig.json`
- BE-18 (connector test infrastructure) cannot be completed without `package.json` scripts

This task produces no connector logic, no schema changes, and no application code. It is
pure workspace scaffolding. Run it once before any other implementation task.

BE-01 must be resolved first so that the correct Node version and module format are
confirmed. This task assumes the outcome is Node ≥20 + `NodeNext` modules (the stack
stated in CLAUDE.md).

---

## Prompt

You are building Clyde Culture. Read `CLAUDE.md` (stack: TypeScript strict, Node ≥20,
pnpm workspaces), `package.json` (root), `pnpm-workspace.yaml`, and
`docs/ARCHITECTURE.md` (monorepo layout) before proceeding.

Create the per-package configuration files required to make the monorepo buildable and
type-checkable. Do not add any connector logic, schema files, or application code.
Placeholder `src/index.ts` files exporting `export type {};` are the correct content.

**Step 1 — Create `tsconfig.base.json` at the repo root:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Do not set `outDir` or `rootDir` in the base — those go in each package's own `tsconfig.json`.

**Step 2 — Create `packages/shared/package.json`:**

```json
{
  "name": "@clydeculture/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/shared/src/index.ts`:
```ts
// @clydeculture/shared — types, enums, db client, Logger interface
// Export from sub-modules as they are built.
export type {};
```

**Step 3 — Create `packages/core/package.json`:**

```json
{
  "name": "@clydeculture/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@clydeculture/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Create `packages/core/tsconfig.json` (same structure as shared, `rootDir: "src"`).
Create `packages/core/src/index.ts` with `export type {};`.

**Step 4 — Create `packages/connectors/package.json`:**

```json
{
  "name": "@clydeculture/connectors",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@clydeculture/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Create `packages/connectors/tsconfig.json` (same structure).
Update `packages/connectors/src/index.ts` to re-export the connector interface:
```ts
export * from "./connector.js";
```

**Step 5 — ⛔ SUPERSEDED — Do not create `packages/ingestion`**

`packages/ingestion` has been replaced by `trigger/` (ADR 0002 — Trigger.dev v3 runtime).
Do not create this package. Ingestion task logic lives in `trigger/` and is run via the
Trigger.dev CLI (`pnpm ingest` → `npx trigger.dev@latest dev`).

**Step 6 — ⛔ SUPERSEDED — Do not create `packages/publishing`**

`packages/publishing` has been removed. ADR 0001 adopted Astro + Supabase direct read.
There is no Webflow sync adapter; the Webflow publish tables were dropped in the A1
migration. Do not create this package.

**Step 5a — Scaffold `trigger/` for Trigger.dev v3 (replaces Steps 5 & 6):**

The ingestion runtime is Trigger.dev v3 (ADR 0002). Scaffold the `trigger/` directory:

1. Create `trigger.config.ts` at the repo root (or `trigger/trigger.config.ts`) with the
   project ID and runtime configuration per the Trigger.dev v3 docs.
2. Create `trigger/tasks/sweep.ts` as a placeholder task exporting a Trigger.dev `task`
   that calls `packages/connectors` connector `run()` methods in sequence.
3. The `trigger/` directory is **not** a pnpm workspace package — it runs directly under
   the Trigger.dev CLI without its own `package.json`.
4. Run `pnpm ingest` (`npx trigger.dev@latest dev`) to verify the local dev tunnel connects.

**Step 7 — Update root `package.json` scripts:**

Replace the `echo "TODO"` stubs with real commands. Do NOT include `packages/ingestion`
or `packages/publishing` — those packages do not exist (see Steps 5 & 6 above).

```json
"scripts": {
  "typecheck": "pnpm -r typecheck",
  "build": "pnpm -r build",
  "test": "pnpm -r --filter './packages/core' --filter './packages/connectors' test",
  "lint": "pnpm -r lint",
  "format": "pnpm -r format",
  "db:migrate": "supabase db push",
  "db:reset": "supabase db reset",
  "supabase:start": "supabase start",
  "supabase:reset": "supabase db reset",
  "supabase:types": "supabase gen types typescript --local > packages/shared/src/database.types.ts",
  "ingest": "npx trigger.dev@latest dev"
}
```

**Step 8 — Create `.env.example` at the repo root:**

```
# Supabase — required for all DB operations
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-never-commit-this

# Third-party API keys — stored in Supabase Vault or env; never in sources.config
TICKETMASTER_API_KEY=
SKIDDLE_API_KEY=

# Alerting
ALERT_EMAIL=
```

**Step 9 — Update `.gitignore`** to ensure it includes:
```
# Dependencies
node_modules/

# Build output
dist/
*.tsbuildinfo

# Environment
.env
.env.local
*.local

# Scratch / dev files
scratch/

# OS
.DS_Store
Thumbs.db
```

---

## Acceptance criteria

- [ ] `tsconfig.base.json` exists at repo root with `strict: true`, `target: ES2022`, `module: NodeNext`
- [ ] `packages/shared`, `packages/core`, `packages/connectors` each have `package.json` with correct name (prefixed `@clydeculture/`) and workspace dependencies
- [ ] **Do not create** `packages/ingestion` or `packages/publishing` — these packages do not exist (see Steps 5 & 6)
- [ ] Each package has `tsconfig.json` extending the base with `outDir: "dist"` and `rootDir: "src"`
- [ ] Each package has `src/index.ts` (placeholder export is acceptable)
- [ ] `packages/connectors/src/index.ts` re-exports `connector.ts`
- [ ] Root `package.json` `test` script filters only `packages/core` and `packages/connectors` (not ingestion)
- [ ] Root `package.json` `ingest` script uses `npx trigger.dev@latest dev` (not `node packages/ingestion/...`)
- [ ] `.env.example` documents all required environment variables
- [ ] `.gitignore` excludes `node_modules/`, `dist/`, `.env`, `scratch/`
- [ ] `pnpm install` from the repo root completes without errors
- [ ] `pnpm typecheck` from the repo root completes without type errors (placeholder files)
