# 99 — Prompt Writing Standards

Standards for writing and updating prompts in the Clyde Culture prompt library
(`docs/prompts/`). Read this before adding a new prompt or editing an existing one.

---

## Purpose of this library

These prompts exist to give future Claude Code (and Codex) sessions a controlled,
test-driven starting point for each development stage. They are not generic software
engineering guides — they are specific to Clyde Culture's engine, stack, and constraints.

---

## Required sections in every prompt

Every prompt file must include:

1. **Title** — a clear, numbered name (e.g. `# 04 — Ticketmaster Fixture E2E Red Test`)
2. **Purpose** — one short paragraph: why this prompt exists and when to use it
3. **Context** — the specific Clyde Culture context the agent needs to understand before
   acting (do not assume the agent has read previous prompts)
4. **Files to Inspect** — an explicit list of files the agent must read before acting
5. **Task Instructions** — numbered steps; clear about what to do and what not to do
6. **Non-Goals** — explicit list of things this prompt is NOT asking the agent to do
7. **Validation Commands** — the exact bash commands to run; include expected output
8. **Required Output Format** — what structure the agent's response must follow
9. **Acceptance Criteria** — a checklist of conditions that must be true for the task
   to be considered complete

---

## Recurring rules — apply these in every implementation prompt

### 1. Always distinguish demo proof from ingestion proof

Include this exact text (or a close variant) in every prompt that touches seed data,
the Astro frontend, or ingestion:

> The Astro website currently displays seeded demo data labelled "Source: Demo
> Eventbrite Feed". This proves the public display path, not the real Ticketmaster
> ingestion path.
>
> Do not treat a passing Astro demo as evidence that Ticketmaster ingestion works.

### 2. TDD red-test-first

Every implementation task must follow the two-step TDD policy from `CLAUDE.md`:
- Step 1 prompts must end with: `Ready for implementation. Prompt me with: Now implement the smallest production code needed to pass this test. Run the test and report the result.`
- Step 2 prompts must only be run after Step 1 produces a failing test.
- Assessment and planning prompts do not require tests.

### 3. No production code in assessment prompts

Prompts numbered `00`, `03`, `06`, `07`, `08`, `10`, and any future planning/audit
prompts are documentation/inspection tasks. They must not include instructions that
would cause the agent to write or modify TypeScript, SQL migrations, or other
production files.

### 4. No live API calls unless explicitly requested

Every connector test must use fixture data, not live API calls. No prompt should
instruct the agent to set `TICKETMASTER_API_KEY` or call `https://app.ticketmaster.com/`
unless the prompt is explicitly a "live API integration" task, numbered separately,
and pre-approved.

The phrasing should be: "Use fixture data only. No `TICKETMASTER_API_KEY` should be
required."

### 5. No scraping bypasses

No prompt should instruct the agent to bypass Cloudflare, robots.txt, or rate limits.
Any prompt involving HTML scraping must include: "Do not attempt to bypass bot
detection or Cloudflare protection." Refer to ADR 0003 and `docs/source-policy.md`.

### 6. Cite file paths and command outputs

Every prompt should instruct the agent to cite specific file paths and line numbers
when making claims about the code. Vague statements like "the connector is wired" are
not acceptable — the agent must cite `trigger/tasks/sweep.ts:19` or equivalent.

### 7. Run exact validation commands

Prompts must include exact bash commands, not descriptions like "run the tests". The
commands must be copy-pasteable and reproducible.

### 8. Report pre-existing failures honestly

Prompts must instruct the agent: "Record failures honestly. Pre-existing failures
should be reported as pre-existing, not fixed silently." Agents must not weaken tests
or skip steps to appear successful.

### 9. Do not overclaim

Prompts must not allow the agent to mark a task complete if:
- Tests were skipped or weakened.
- Only the demo seed was proven, not real ingestion.
- Only the parser was tested, not the full E2E chain.
- Type errors were suppressed with `// @ts-ignore`.

---

## Clyde Culture-specific concepts to use (not generic terms)

When writing prompts, use these specific terms:

| Use this | Not this |
|---|---|
| `external_events` | staging table, raw events table |
| `events` | canonical events, published events table |
| `sources` | data sources, ingestion sources |
| `ingest_runs` | run log, ingestion history |
| `ingest_alerts` | alerts table, monitoring |
| `normaliseExternalEventsForSource` | normalise step, processing step |
| `visibility = 'published'` | published, live, active |
| `confidence >= 60` | confidence threshold, quality gate |
| Ticketmaster connector | TM connector, API connector |
| Demo Eventbrite Feed | demo source, test source (only use this exact label) |
| `packages/core` | core package, pure functions package |
| `packages/shared` | shared package, DB helpers package |
| `packages/connectors` | connectors package |
| `trigger/tasks/sweep.ts` | sweep task, ingestion job, cron job |
| `supabase/seed.sql` | seed file, demo data |
| `supabase/tests/` | DB tests, pgTAP tests |
| Astro MVP | frontend, web app (use both when context makes it clear) |

---

## Prompt numbering

- `00` — repository state / assessment
- `01–03` — MVP validation, architecture cleanup, ADRs
- `04–05` — first E2E proof (Ticketmaster fixture)
- `06` — orchestration review
- `07–08` — source policy and demo data
- `09` — CI/infrastructure
- `10` — next source planning
- `11–19` — reserved for next connector E2E pairs (red test + implementation)
- `99` — standards (this file)

Each new connector should follow the `04`/`05` pattern: one red-test prompt (write
failing test, stop) and one implementation prompt (implement smallest code, run test).

---

## Updating existing prompts

If the context changes (e.g. `normaliseExternalEventsForSource` is moved to
`packages/shared` in prompt `02`), update all downstream prompts to reference the
new location. Prompts are not version-controlled separately — they should always
reflect the current state of the repository.

When updating a prompt:
- Update the "Files to Inspect" section if file paths have changed.
- Update the "Context" section if the architecture has changed.
- Do NOT remove the demo/ingestion distinction language.
- Do NOT remove the acceptance criteria.

---

## What not to include in prompts

- Generic software engineering advice ("always write clean code", "follow SOLID").
- Instructions that duplicate `CLAUDE.md` without adding Clyde Culture-specific context.
- Supabase connection strings or API keys (even test values).
- External URLs for research (agents must use existing documentation, not browse).
- Future features or out-of-scope work (prompts must have a tight scope).
