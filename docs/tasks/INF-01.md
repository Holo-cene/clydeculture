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

**Step 5 — Create `packages/ingestion/package.json`:**

```json
{
  "name": "@clydeculture/ingestion",
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
    "@clydeculture/shared": "workspace:*",
    "@clydeculture/connectors": "workspace:*",
    "@clydeculture/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Create `packages/ingestion/tsconfig.json` and `packages/ingestion/src/index.ts`
(`export type {};`).

**Step 6 — Create `packages/publishing/package.json`:**

```json
{
  "name": "@clydeculture/publishing",
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
    "@clydeculture/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

Create `packages/publishing/tsconfig.json` and `packages/publishing/src/index.ts`
(`export type {};`).

Note: `packages/publishing` has no `test` script because the publishing adapter shape
is not decided until ADR 0001 resolves. Add tests when the adapter is built.

**Step 7 — Update root `package.json` scripts:**

Replace the `echo "TODO"` stubs with real commands:

```json
"scripts": {
  "typecheck": "pnpm -r typecheck",
  "build": "pnpm -r build",
  "test": "pnpm -r --filter './packages/core' --filter './packages/connectors' --filter './packages/ingestion' test",
  "lint": "echo 'TODO: wire up eslint once first connector is built'",
  "db:migrate": "supabase db push",
  "db:reset": "supabase db reset",
  "ingest": "node packages/ingestion/dist/index.js"
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
- [ ] `packages/shared`, `packages/core`, `packages/connectors`, `packages/ingestion`, `packages/publishing` each have `package.json` with correct name (prefixed `@clydeculture/`) and workspace dependencies
- [ ] Each package has `tsconfig.json` extending the base with `outDir: "dist"` and `rootDir: "src"`
- [ ] Each package has `src/index.ts` (placeholder export is acceptable)
- [ ] `packages/connectors/src/index.ts` re-exports `connector.ts`
- [ ] Root `package.json` `typecheck` and `test` scripts use `pnpm -r` (recursive)
- [ ] `.env.example` documents all required environment variables
- [ ] `.gitignore` excludes `node_modules/`, `dist/`, `.env`, `scratch/`
- [ ] `pnpm install` from the repo root completes without errors
- [ ] `pnpm typecheck` from the repo root completes without type errors (placeholder files)
