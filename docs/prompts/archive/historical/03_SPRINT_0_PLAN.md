# Sprint 0 — Pre-Development Cleanup Plan

> **Temporary working document.** Delete or archive once Sprint 0 is complete and all
> tasks in `docs/tasks/README.md` are ticked off.
>
> **Purpose:** Organise the cleanup work that must happen before any implementation code
> is written. All four critical-path decisions are now made (ADRs 0001–0003,
> NORMALISATION.md). What remains is one logical contradiction, ~15 stale documents, a
> repo structure that predates the decisions, and a task backlog that hasn't been
> updated to reflect any of this.
>
> Each task below is a self-contained Claude Code session. Run them in the order shown
> within each phase. Tasks inside the same phase marked **(parallel)** can run
> concurrently in separate sessions.

---

## Sprint 0 at a glance

| ID | Task | Phase | Agent role | Depends on |
|---|---|---|---|---|
| D1 | Resolve confidence threshold contradiction | 1 | Postgres / RLS expert | — |
| F1 | Fix INGESTION.md + OPERATIONS.md (stale runtime) | 2 (parallel) | Technical writer | D1 |
| F2 | Full documentation audit | 2 (parallel) | Staff engineer | D1 |
| F3 | Update CLAUDE.md | 2 (parallel) | Tech lead | — |
| F4 | Update root files (.env.example, package.json, apps/web README) | 2 (parallel) | Platform engineer | — |
| F5 | Update packages/connectors/CLAUDE.md for Apify type | 2 (parallel) | Connectors engineer | — |
| R1 | Remove packages/ingestion + packages/publishing | 3 (parallel) | Platform engineer | — |
| R2 | Create packages/connectors/src/apify/ stubs | 3 (parallel) | Platform engineer | — |
| R3 | Relocate api/eventbrite stub → apify/eventbrite | 3 (parallel) | Platform engineer | — |
| T1 | Update docs/tasks/README.md (Done / To Do) | 4 | Tech lead | F1, F2 |
| T2 | Create new task files (CC-NEW-1 through CC-NEW-4) | 4 | Tech lead | F1, F2 |
| B1 | INF-01 Monorepo bootstrap | 5 | TypeScript/Node engineer | D1, F1–F5, R1–R3 |

---

## Phase 1 — Decision (run first; everything else depends on this)

### D1 — Resolve confidence threshold contradiction

**Role:** You are a Supabase Postgres expert.

**The contradiction:** Two documents disagree on where `confidence >= 60` lives:
- `docs/PUBLISHING.md` (line 26–28) shows it hardcoded in an RLS policy:
  `using (visibility = 'published' and confidence >= 60)`
- `docs/NORMALISATION.md` (Step 4, Score to Action) says: "The publishing threshold
  (currently 60) is stored in `sources.config` at the platform level and is applied by
  the publishing query, not hardcoded in normalisation code."

A SQL RLS policy cannot dynamically read a JSONB value from a `sources.config` row at
policy evaluation time. These two descriptions are incompatible.

**Two options:**

**Option A — Hardcode in RLS (pragmatic for Phase 1).**
Keep `confidence >= 60` in the RLS policy as a literal. Change the threshold only by
writing a migration that alters the policy. Acceptable because: (a) the threshold will
not change until real connector data validates it, and (b) BE-19 can be resolved later
by adding a `platform_config` table and migrating the policy at that point. NORMALISATION.md
must be corrected to say the threshold is hardcoded in the RLS policy for Phase 1.

**Option B — platform_config table (flexible but more schema).**
Create a single-row `platform_config` table with a `confidence_threshold` integer column.
The RLS policy uses a stable helper function `get_confidence_threshold()` that reads this
row. The function result is cached by Postgres across policy evaluations. Threshold changes
require only an UPDATE, not a migration. BE-19 is resolved as part of CC-NEW-1.

**Your task:** Assess both options against this project's constraints (Phase 1 scale,
minimal maintenance target, Supabase free/pro tier, need to change threshold once early
connector data is available). Write a one-paragraph recommendation with a clear choice.
Then produce the SQL for whichever option you recommend, ready for inclusion in the
CC-NEW-1 schema migration.

**Files to read first:** `docs/PUBLISHING.md`, `docs/NORMALISATION.md` (Step 4),
`docs/reference/SCHEMA_v5.sql`, `docs/tasks/BE-19.md`.

**Output:** A short written recommendation (one paragraph) and the SQL fragment to
include in the schema migration. Update `docs/PUBLISHING.md` and `docs/NORMALISATION.md`
to reflect the chosen approach. Assessment only — no migration file yet (that is CC-NEW-1).

---

## Phase 2 — Documentation fixes (run in parallel after D1)

### F1 — Fix INGESTION.md and OPERATIONS.md (stale runtime references)

**Role:** You are a technical writer performing a targeted search-and-replace across
two documents that directly contradict an accepted ADR.

**The problem:**
- `docs/INGESTION.md` line 52 still says: "implemented as a Supabase Edge Function
  invoked by a cron trigger" — contradicts ADR 0002 (Trigger.dev).
- `docs/OPERATIONS.md` Scheduled Ingestion section still presents three open options
  (A/B/C) and recommends "Option A — Supabase Scheduled Edge Functions" — contradicts
  ADR 0002.
- `docs/reference/SPEC.md` line 49 (opening paragraph) still lists Eventbrite as an
  active API source: "APIs (Ticketmaster, Skiddle, Eventbrite, Meetup)" — contradicts
  ADR 0003 and the SPEC source table update at line 163.

**Files to read first:** `docs/decisions/0002-ingestion-runtime.md`,
`docs/decisions/0003-scraping-strategy.md`, `docs/INGESTION.md`,
`docs/OPERATIONS.md`, `docs/reference/SPEC.md`.

**Your task:** Make targeted edits only — do not rewrite sections that are not stale.

1. **INGESTION.md** — Replace the scheduled-job model section to describe Trigger.dev
   tasks. Connector interface section needs no change. Break detection section may need
   minor Trigger.dev alignment. Reference ADR 0002.

2. **OPERATIONS.md** — Replace the Scheduled Ingestion section entirely with a Trigger.dev
   section describing: project setup, secrets configuration (`TRIGGER_SECRET_KEY`),
   how to view run logs, and how to trigger a manual run. Remove Options A/B/C. Also add
   a "Database connections" section covering PgBouncer (two endpoint types, port 5432 vs
   6543, prepared statement incompatibility) — this closes DB-03.

3. **SPEC.md** — Edit line 49 opening paragraph only: remove Eventbrite from the API list.
   Also add DICE.fm to the opening source description. Do not touch the source table
   (already updated at lines 162–163).

**Acceptance criteria:** No document contains the words "Edge Function" in the context
of ingestion scheduling. OPERATIONS.md does not present runtime as a 3-way choice.
SPEC.md opening paragraph does not name Eventbrite as an API source.

---

### F2 — Full documentation audit and cleanup

**Role:** You are a staff engineer performing a consistency audit of all documentation
before the first sprint of implementation code is written. Your goal is to ensure that
every document is internally consistent, consistent with each other, and consistent with
the three ADRs and NORMALISATION.md. Produce a list of findings and fix them in-place.

**Files to read (all of them):**
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`, `docs/INGESTION.md`, `docs/NORMALISATION.md`,
  `docs/PUBLISHING.md`, `docs/OPERATIONS.md`, `docs/DEDUPLICATION.md`,
  `docs/FESTIVALS.md`, `docs/CONNECTOR_GUIDE.md`, `docs/DATA_MODEL.md`,
  `docs/PROJECT_OVERVIEW.md`, `docs/ROADMAP.md`, `docs/BRAND_VOICE.md`,
  `docs/CONTRIBUTING.md`
- `docs/decisions/0001-frontend-architecture.md`, `docs/decisions/0002-ingestion-runtime.md`,
  `docs/decisions/0003-scraping-strategy.md`
- `docs/reference/SPEC.md`, `docs/reference/SCHEMA_v5.sql`,
  `docs/reference/Schema v5 Assessment.md`
- `docs/prompts/PROMPTS_FOR_CLAUDE_CODE.md`, `docs/prompts/02_PROMPTS_REVIEW.md`

**Check for and fix:**

1. **Webflow references** — Any document that mentions Webflow as a live path (not
   as a "ruled out" option in context) should be corrected. The Webflow path is rejected
   per ADR 0001.

2. **packages/ingestion and packages/publishing** — Any monorepo layout description that
   lists these packages should be updated. Both are removed per ADR 0001/0002.

3. **Eventbrite as API source** — Any place that treats Eventbrite as a Tier 1 API
   connector (not the Apify-based Tier 2 source it now is) should be corrected.

4. **Field name drift** — Cross-check field names against `docs/reference/SCHEMA_v5.sql`.
   Known issues from the R6 review: `event_type` vs `event_type_id`; `partial` vs
   `degraded` in status enum; confirm `docs/DATA_MODEL.md` matches the schema.

5. **`docs/reference/Schema v5 Assessment.md`** — Read this file. If it is superseded
   by the ADRs and NORMALISATION.md, mark it as archived with a header note. If it
   contains anything not covered elsewhere, extract the relevant content into the
   appropriate doc before archiving.

6. **`docs/CONNECTOR_GUIDE.md`** — Check for: missing `apify` as a connector type;
   missing Crawlee references; any instructions that still assume the old `packages/ingestion`
   orchestrator; add a pre-flight checklist section (robots.txt, ToS, JSON-LD availability).
   Cross-reference ADR 0003.

7. **`docs/DEDUPLICATION.md`** and **`docs/FESTIVALS.md`** — Check alignment with
   `docs/NORMALISATION.md` Steps 5 and 6. Any contradiction or gap is a finding.

8. **`docs/CONTRIBUTING.md`** — Verify it reflects Astro, Trigger.dev, and the current
   monorepo shape.

9. **`docs/PROMPTS_FOR_CLAUDE_CODE.md`** — This was the original prompt sequence. Some
   of its prompts generated docs that have since been revised. Add a note at the top
   that this is the original generation sequence and that ADR 0001–0003 and
   NORMALISATION.md supersede many of the doc decisions it produced.

**Output format:** For each finding: document name, line/section, what is wrong, and
the fix applied. Apply all fixes inline. Produce a summary of changes at the end.

---

### F3 — Update CLAUDE.md

**Role:** You are the project tech lead updating the root CLAUDE.md to reflect the
current state of the project after the documentation sprint.

**Files to read first:** `CLAUDE.md`, `docs/decisions/0001-frontend-architecture.md`,
`docs/decisions/0002-ingestion-runtime.md`, `docs/decisions/0003-scraping-strategy.md`.

**Changes required:**

1. **Status section** — Remove "The public frontend is not yet decided (Webflow vs.
   coded Next.js)." Replace with a one-sentence summary: frontend is Astro + Supabase
   direct read (ADR 0001 accepted 2026-06-02). Remove the ADR 0001 gating language.

2. **Architecture section (monorepo layout)** — Remove `packages/ingestion` and
   `packages/publishing`. Add `packages/connectors/src/apify/` to connectors description.
   Add Trigger.dev as the ingestion runtime with a reference to ADR 0002.

3. **Never section** — Remove "Populate `apps/web` before ADR 0001 is resolved" and
   "Implement frontend-specific publishing before ADR 0001 is resolved." Replace with:
   "Do not populate `apps/web` until the schema migration (CC-NEW-1) has been applied."

4. **Stack section** — Add Trigger.dev v3 and Astro to the stack description. Add
   Crawlee and Apify as scraping tools.

5. **Hard rules** — Rule 3 (dedupe) references `venue_id | start_bucket | normalised_title`
   — confirm this still matches NORMALISATION.md Step 5 exactly. Fix if not.

**Do not change:** The development workflow section, the connector conventions, the
link-first rule (hard rule 1), the Supabase source-of-truth rule (rule 2), or the
brand voice rules (6–7).

---

### F4 — Update root files

**Role:** You are a platform engineer doing housekeeping before the first build sprint.

**Files to read first:** `docs/decisions/0002-ingestion-runtime.md`,
`docs/decisions/0003-scraping-strategy.md`, `.env.example`, `package.json`,
`apps/web/README.md`, `docs/OPERATIONS.md`.

**Changes required:**

1. **`.env.example`** — Remove `EVENTBRITE_API_KEY` (deprecated API, replaced by Apify).
   Add `APIFY_API_KEY` (required for DICE and Eventbrite Apify connectors) and
   `TRIGGER_SECRET_KEY` (required by the Trigger.dev worker). Move `MEETUP_API_KEY` to a
   "Phase 2 / unconfirmed" section. Add `SUPABASE_ANON_KEY` (used by apps/web; distinct
   from the service role key). Ensure `ALERT_EMAIL` has a comment explaining it is now
   a Trigger.dev alert webhook or email notification setting, not a raw SMTP destination.

2. **`package.json` scripts** — Replace `"ingest": "echo \"TODO: run ingestion orchestrator\""` 
   with `"ingest": "npx trigger.dev@latest dev"` (local Trigger.dev dev server). Add
   `"typecheck": "pnpm -r typecheck"` and `"test": "pnpm -r test"` as the root aggregators
   (these will work once INF-01 adds per-package scripts). Keep `"db:migrate"` unchanged.

3. **`apps/web/README.md`** — Replace the "Do not populate" placeholder with: a one-line
   description of what apps/web is (Astro + Supabase direct read), the specific gate
   that still blocks it (schema migration CC-NEW-1 must be applied first, not ADR 0001
   which is now accepted), and the stack (Astro, Supabase JS client, anon key + RLS).

---

### F5 — Update packages/connectors/CLAUDE.md for Apify type

**Role:** You are a connectors engineer extending the connector CLAUDE.md to cover
the new Apify source type introduced by ADR 0003.

**Files to read first:** `packages/connectors/CLAUDE.md`,
`docs/decisions/0003-scraping-strategy.md`, `packages/connectors/src/connector.ts`.

**Changes required:**

1. Add `apify` to the `externalId` by source type table:
   `apify | Actor output's event ID field (dataset item ID as fallback)`

2. Add an Apify connector skeleton alongside the existing one. An Apify connector:
   - Calls the Apify API to trigger an actor run with configured input
   - Polls for run completion (status `SUCCEEDED`)
   - Fetches the output dataset
   - Maps dataset items to `RawEvent[]`
   - Pins to a specific actor version in `sources.config`

3. Update the registration SQL example to include `source_type = 'apify'` with example
   config shape: `{"actorId": "...", "actorVersion": "0.1.2", "input": {...}}`.

4. Add a note: Apify connectors do not use CSS selectors, robots.txt checking, or
   Playwright. They delegate all extraction to the Apify actor. The connector's job is
   input/output mapping only.

---

## Phase 3 — Repository structure cleanup (run in parallel after D1)

### R1 — Remove packages/ingestion and packages/publishing

**Role:** You are a platform engineer cleaning up the monorepo.

**Files to read first:** `docs/decisions/0001-frontend-architecture.md`,
`docs/decisions/0002-ingestion-runtime.md`, `pnpm-workspace.yaml`.

**Changes required:**

1. Delete `packages/ingestion/` entirely. Per ADR 0002, Trigger.dev replaces this
   package. The directory contains only `src/.gitkeep`.

2. Delete `packages/publishing/` entirely. Per ADR 0001, there is no sync adapter.
   Shared query helpers will live in `packages/shared` when INF-01 is done.

3. `pnpm-workspace.yaml` uses `packages/*` glob — no change needed. Once the
   directories are removed, pnpm will no longer attempt to load them.

4. Confirm `packages/shared` and `packages/core` and `packages/connectors` directories
   still exist (they should; do not delete them).

**Note:** This is a structural deletion of empty placeholder directories. There is no
code to migrate. The `.gitkeep` files confirm they are empty. Proceed without further
approval — this is a pre-build cleanup, not a code change.

---

### R2 — Create packages/connectors/src/apify/ stubs

**Role:** You are a platform engineer scaffolding the Apify connector directory.

**Files to read first:** `docs/decisions/0003-scraping-strategy.md`,
`packages/connectors/CLAUDE.md`, `packages/connectors/src/connector.ts`.

**Changes required:**

1. Create `packages/connectors/src/apify/dice/.gitkeep`
2. Create `packages/connectors/src/apify/eventbrite/.gitkeep`
3. Create `packages/connectors/src/apify/README.md` with:
   - One-paragraph description of the Apify connector pattern
   - Reference to ADR 0003 and `packages/connectors/CLAUDE.md`
   - A reminder to check the actor ID and pin the version in `sources.config`
   - A gate note: do not implement the Eventbrite connector until its COMPLIANCE.md is
     written; do not implement the DICE connector until CC-NEW-2 (DICE pre-flight) is done.

Do not write any TypeScript yet — INF-01 hasn't run so there are no package.json files.
Stubs only.

---

### R3 — Relocate api/eventbrite stub → apify/eventbrite

**Role:** You are a platform engineer correcting a stale connector stub.

**The problem:** `packages/connectors/src/api/eventbrite/` contains a `.gitkeep` stub
for an Eventbrite API connector. This connector can never be built (Eventbrite's public
API is deprecated — ADR 0003). The Eventbrite coverage is now handled via an Apify
actor at `packages/connectors/src/apify/eventbrite/` (created in R2).

**Changes required:**

1. Delete `packages/connectors/src/api/eventbrite/` (empty directory with `.gitkeep`).
2. `packages/connectors/src/apify/eventbrite/` already exists after R2 — no duplication.
3. Check `packages/connectors/src/api/meetup/` — keep this stub. Meetup is a P3/Phase 2
   item (API-09) and has not been deprecated; it may become a legitimate API connector.
4. All other api/ stubs (ticketmaster, skiddle) are correct — leave them.

---

## Phase 4 — Backlog update (run after Phase 2)

### T1 — Update docs/tasks/README.md

**Role:** You are the tech lead updating the engineering backlog to reflect the outcome
of the documentation sprint.

**Files to read first:** `docs/tasks/README.md`, `docs/decisions/0001-frontend-architecture.md`,
`docs/decisions/0002-ingestion-runtime.md`, `docs/decisions/0003-scraping-strategy.md`,
`docs/NORMALISATION.md`.

**Changes required:**

Restructure `docs/tasks/README.md` to have three sections: **Done**, **To Do (Sprint 0)**,
and **To Do (Build)**.

**Done — close these tasks** (document which ADR/doc closes each):

| ID | Closed by |
|---|---|
| BE-01 | ADR 0002 — Trigger.dev is the runtime |
| BE-03 | NORMALISATION.md — full normalisation contract written |
| BE-05 | ADR 0002 — fan-out native to Trigger.dev |
| BE-08 | ADR 0002 — dead-letter handled by Trigger.dev retry/alerts |
| BE-13 | NORMALISATION.md Step 4 — confidence_inputs JSON specified |
| BE-14 | NORMALISATION.md Step 8 — primary_source_id election logic specified |
| API-01 | ADR 0003 — Eventbrite replacement strategy accepted |
| API-06 | ADR 0003 — PlaywrightCrawler handles JS rendering |
| API-07 | ADR 0002 — Trigger.dev zero-result task alerts |
| DOC-02 | ADR 0002 — Trigger.dev structured task logs |
| DOC-03 | ARCHITECTURE.md and SPEC.md updated |
| INF-02 | ADR 0002 — Trigger.dev deploy CLI handles CI/CD |
| DB-07 | ADR 0001 — publish_mappings is being dropped; delete guard moot |
| SEC-01 | ADR 0001 + PUBLISHING.md — anon key and blast radius documented |
| SEC-05 | NORMALISATION.md Step 1 — link-only enforcement specified |

**To Do (Sprint 0)** — add these new tasks before the build tasks:

| ID | Title | Priority | Depends on |
|---|---|---|---|
| CC-NEW-3 | Resolve confidence threshold contradiction (RLS vs sources.config) | P0 | — |
| CC-NEW-4 | Fix stale runtime references in INGESTION.md + OPERATIONS.md | P0 | — |
| CC-NEW-1 | Schema migration: drop Webflow fields/tables + apify source_type + correctness batch | P0 | CC-NEW-3 |
| CC-NEW-2 | DICE.fm connector pre-flight + spec | P1 | — |

**Update existing open tasks:**
- `DB-01`, `BE-09`, `DB-08` — mark as "Superseded by CC-NEW-1 (batched into schema migration)"
- `DB-04` — update note: pg_cron is no longer used for ingestion scheduling (Trigger.dev); pg_cron may still be needed for `archive_past_events()` and GDPR retention. Update title and scope accordingly.
- `INF-01` — update status from "Depends on BE-01" to "Unblocked — BE-01 closed by ADR 0002"
- `BE-11` — update scope note: Webflow display fields being dropped; task reduced to venue-name propagation trigger + SWG3 alias seed only

---

### T2 — Create new task files

**Role:** You are the tech lead writing self-contained Claude Code task prompts.

Create the following four files in `docs/tasks/`:

**`CC-NEW-1.md`** — Schema migration: drop Webflow fields/tables + add apify source_type + correctness batch.
This is a database migration task. The agent reading it is a Supabase/Postgres expert.
Include the exact fields to drop (from ADR 0001 §Consequences), exact tables to drop,
the `source_type = 'apify'` CHECK addition, the three correctness fixes (compute_dedupe_key
UTC truncation, confidence/visibility CHECK, IANA timezone validation), and the resolution
of the confidence threshold (from D1). Reference `supabase/migrations/20260531000000_schema_v5_initial.sql`
as the baseline to read before writing the migration.

**`CC-NEW-2.md`** — DICE.fm Apify connector pre-flight.
This is an integrations spike. The agent is an integrations engineer. Include: Apify Store
actor discovery, actor version pinning, output schema verification, ToS and robots.txt
check for dice.fm, config shape for the `sources` row, and required output:
`packages/connectors/src/apify/dice/SPEC.md`.

**`CC-NEW-3.md`** — Resolve confidence threshold contradiction.
This is the D1 task above, formatted as a task file for the backlog.

**`CC-NEW-4.md`** — Fix stale runtime references in INGESTION.md, OPERATIONS.md, SPEC.md.
This is the F1 task above, formatted as a task file.

---

## Phase 5 — First build task

### B1 — INF-01: Monorepo bootstrap

**Role:** You are a senior TypeScript/Node engineer bootstrapping a pnpm monorepo for
the first time. Nothing compiles yet. Your job is to make `pnpm install`, `pnpm typecheck`,
and `pnpm test` work before any connector or core logic is written.

**Files to read first:** `CLAUDE.md`, `docs/decisions/0002-ingestion-runtime.md`,
`packages/connectors/src/connector.ts`, `pnpm-workspace.yaml`, `package.json`,
`docs/tasks/INF-01.md`.

**Packages to bootstrap** (in dependency order):

1. **`packages/shared`** — base types, Supabase client, taxonomy enums.
   Dependencies: `@supabase/supabase-js`, `typescript`. No internal deps.

2. **`packages/core`** — normalisation, dedup, festival detection.
   Dependencies: `packages/shared`. Placeholder `src/index.ts` only — no logic yet.

3. **`packages/connectors`** — connector interface + per-source stubs.
   Dependencies: `packages/shared`. `connector.ts` already exists; create `package.json`
   and `tsconfig.json` only. Add Vitest as a dev dependency. Create one passing test
   (`src/connector.test.ts`) that type-checks the interface.

4. **Trigger.dev worker** — this lives at the monorepo root (not a package), as
   `trigger/` directory with `trigger.config.ts`. Dependencies: `@trigger.dev/sdk`,
   `packages/connectors`, `packages/shared`. Create one stub task
   `trigger/tasks/sweep.ts` that logs "sweep starting" and returns.

**Per-package requirements:**
- `package.json`: `name`, `version: 0.0.1`, `private: true`, `main`, `types`, `scripts`
  (build, typecheck, test). Use `"type": "module"` for ESM throughout.
- `tsconfig.json`: extends from root `tsconfig.base.json`. Strict mode. Path aliases for
  internal workspace imports.
- Root `tsconfig.base.json`: `target: ES2022`, `moduleResolution: bundler`, strict, no emit.

**Root scripts:** Wire `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` to produce
useful output rather than `echo "TODO"`.

**CI:** Create `.github/workflows/ci.yml` — runs on push to main, executes
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`.

**Acceptance criteria:**
- `pnpm install` completes without errors
- `pnpm typecheck` passes on all packages
- `pnpm test` runs the connector interface test and passes
- Trigger.dev project initialises with `npx trigger.dev@latest dev`
- CI workflow is syntactically valid YAML

---

## Additional items found during assessment

These are not part of Sprint 0 but should be created as task files before Sprint 1:

### Stale connector stub
`packages/connectors/src/api/eventbrite/` is a dead stub for a deprecated API connector.
Handled by R3 above.

### Schema v5 Assessment document
`docs/reference/Schema v5 Assessment.md` — purpose unclear. Included in F2 (full audit)
for assessment. If superseded, archive it with a header note.

### CONNECTOR_GUIDE.md — Apify type missing
`docs/CONNECTOR_GUIDE.md` has no guidance for Apify connectors. Covered by F2 (audit)
and F5 (connectors CLAUDE.md). A full CONNECTOR_GUIDE update may be warranted as a
separate task after CC-NEW-2 (DICE pre-flight) completes, when the Apify pattern is
proven out.

### DATA_MODEL.md alignment
`docs/DATA_MODEL.md` may have field name drift against `SCHEMA_v5.sql` and the dropped
Webflow fields. Covered by F2 (full audit). If significant changes are found, a
dedicated DATA_MODEL update task should be raised.

### DEDUPLICATION.md — key-change section missing
`docs/DEDUPLICATION.md` does not have a section on what happens when `dedupe_key`
changes due to rescheduling. This is noted in CC-09 (deletion/orphan lifecycle).
Document it as part of the CC-09 implementation task.

---

## Definition of done for Sprint 0

Sprint 0 is complete when:

- [ ] D1: Confidence threshold contradiction resolved; both PUBLISHING.md and
      NORMALISATION.md are consistent
- [ ] F1: INGESTION.md and OPERATIONS.md contain no Supabase Edge Function references
      for ingestion scheduling
- [ ] F2: Full audit complete; findings list produced; all fixes applied
- [ ] F3: CLAUDE.md reflects Astro, Trigger.dev, and removed packages
- [ ] F4: .env.example has APIFY_API_KEY and TRIGGER_SECRET_KEY; apps/web README updated
- [ ] F5: packages/connectors/CLAUDE.md covers apify source type
- [ ] R1: packages/ingestion and packages/publishing directories removed
- [ ] R2: packages/connectors/src/apify/ exists with dice/ and eventbrite/ stubs
- [ ] R3: packages/connectors/src/api/eventbrite/ removed
- [ ] T1: docs/tasks/README.md has Done / Sprint 0 / Build sections; 15 tasks closed
- [ ] T2: CC-NEW-1 through CC-NEW-4 task files exist in docs/tasks/
- [ ] B1: `pnpm install`, `pnpm typecheck`, `pnpm test` all pass; CI workflow exists

When all boxes are ticked, the project is ready for Sprint 1 (CC-NEW-1 schema migration).
Archive or delete this document.
