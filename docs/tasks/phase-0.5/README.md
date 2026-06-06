# Phase 0.5 Task Backlog

> **Purpose:** Structured task files for the Clyde Culture Phase 0.5 stabilisation sprint.
> Produced from the master plan in `docs/prompts/04_PHASE_0_5_PLAN.md` (2026-06-03).
> Archive this directory when all checklist items below are ticked.

---

## How to use these files

Each file in this directory is a self-contained task brief for one Claude Code session.

**To execute a task:**

```
Implement docs/tasks/phase-0.5/<task-file>.md exactly. Stop at the task's stop condition.
```

Each task file contains:
- What files to read first
- What files are allowed/not allowed to edit
- Step-by-step instructions
- Exact test commands
- A stop condition with a reporting checklist
- A recommended next prompt

**Do not skip the stop condition.** Tasks marked "TDD step 1 only" must stop after writing the failing test. Do not implement production code unless the task file explicitly says to.

**Do not combine tasks.** Each task should be a separate Claude Code session and ideally a separate commit.

---

## Canonical source-of-truth rules

Apply these in every task that touches the relevant area:

1. `docs/NORMALISATION.md` is canonical for normalisation behaviour. Task files that contradict it are wrong.
2. `docs/reference/SCHEMA_v5.sql` is canonical for table fields, column names, and enum values.
3. TypeScript shared types must match the database schema.
4. `EventCategory` must match the 13 SQL `event_types.slug` values exactly.
5. `Source` must use `enabled`, not `isActive`.
6. `SourceType` canonical values: `api | rss | ical | html | apify | manual`.
7. `RawEvent` must include all 17 fields (see B4).
8. Fuzzy dedupe threshold for Phase 1: `0.35`.
9. Link-only sources: no copied descriptions, summaries, or images in canonical events.
10. Do not build public submission, venue claim, or Phase 2 community features during this sprint.

---

## Dependency order

### Wave 0 (complete — this planning pass)
This README and all task files.

### Wave 1 — Contract stabilisation
Run A1 first (serial). Then run the rest in parallel:

| Task | Type | Serial/Parallel |
|------|------|-----------------|
| **A1** — CC-NEW-1 schema corrections | migration | Serial first |
| A2 — Internal RLS deny tests | red-tests | After A1 |
| **A3** — event_tags explicit RLS | migration | After A2 |
| B1 — EventCategory taxonomy | red-tests | Parallel |
| B2 — Source interface alignment | red-tests | Parallel |
| B3 — SourceType sync | red-tests | Parallel |
| B4 — RawEvent contract | red-tests | Parallel |
| B5 — source_type_category_map seed | migration | After B1 |
| H1 — Stale task cleanup | cleanup | Parallel |
| D1–D6 — Lifecycle/dedup docs | docs-only | All parallel |
| F1–F3 — Security/public-feature gates | docs-only | All parallel |
| C7 — time_tba and image_url docs | docs-only | Parallel |

### Wave 2 — Red tests
Run after Wave 1 contract work. All C tasks can run in parallel (except C5 depends on D2):

| Task | Type | After |
|------|------|-------|
| C1 — connector validate | red-tests | (B3 helpful but not required) |
| C2 — confidence scoring | red-tests | B1 |
| C3 — category mapping | red-tests | B1, B5 |
| C4 — venue normalisation | red-tests | (independent) |
| C5 — merge behaviour | red-tests + docs | D2 |
| C6 — festival detection | red-tests + docs | (independent) |
| G1 — sweep orchestration | red-tests | B2, B3, B4, D3, D6 |

### Wave 3 — Minimal implementations
Only after red tests are reviewed. Run in this order:

```
C1 → C4 → C2 → C3 → C5 → C6 → G1
```

Each requires the exact prompt:
> `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

### Wave 4 — Connector pre-flights (all parallel)
E1–E7 are independent research/spike tasks. Run simultaneously.

### Wave 5 — First connector
Start with the lowest-risk confirmed connector after pre-flights:
- Ticketmaster if E1 resolves quota and geo-filter.
- iCal (Mono/Flying Duck) if E5 spec is clear and E7 robots.txt is clean.
- Do not start if E4 (Eventbrite) blocks the build plan — resolve that first.

---

## Tasks that must be serial

- **A1** must complete before anything that touches the schema or depends on RLS.
- **A2** must run after A1.
- **A3** must run after A2 (extends the A2 test file and depends on the A1 RLS foundation).
- **B5** must run after B1 (seed uses correct slug values).
- **C5** must run after D2 (reschedule path must be documented first).
- **G1** must run after B2, B3, B4, D3, D6.

---

## Tasks that can run in parallel

- B1, B2, B3, B4 — independent type alignment tasks.
- D1, D2, D3, D4, D5, D6 — all docs-only, no dependencies between them.
- E1, E2, E3, E4, E5, E6, E7 — all research spikes, no dependencies.
- F1, F2, F3 — all docs-only security gates.
- H1 — cleanup only (provided it touches only its listed files).
- C1, C2, C3, C4, C6 — red-tests (with their noted pre-conditions).

---

## Task type index

### Docs-only tasks (no code)
- C7 — time_tba and image_url docs
- D1 — fuzzy threshold
- D2 — reschedule handling
- D3 — removal/cancellation lifecycle
- D4 — doors vs show-time dedupe
- D5 — multi-room venue limitation
- D6 — auto_create_venue() concurrency
- F1 — public submission gate
- F2 — link-only enforcement
- F3 — GDPR/retention

### Red-tests-only tasks (step 1 of TDD; stop after failing test)
- B1 — EventCategory alignment
- B2 — Source interface alignment
- B3 — SourceType sync
- B4 — RawEvent contract
- C1 — connector validate
- C2 — confidence scoring
- C3 — category mapping
- C4 — venue normalisation
- C5 — merge behaviour (also includes a docs step)
- C6 — festival detection (also includes a docs check step)
- G1 — sweep orchestration

### Migration tasks
- A1 — CC-NEW-1 schema corrections
- A3 — event_tags explicit RLS confidence gate
- B5 — source_type_category_map seed

### Spike / research tasks
- A2 — internal RLS deny tests (pgTAP)
- E1 — Ticketmaster pre-flight
- E2 — Skiddle pre-flight
- E3 — DICE.fm Apify pre-flight
- E4 — Eventbrite pre-flight
- E5 — iCal parser spec
- E6 — RSS source policy
- E7 — HTML scraper pre-flight

### Cleanup tasks
- H1 — stale task file cleanup

---

## Tasks that block connector or normaliser code

| Blocker | What it blocks |
|---------|----------------|
| A1 | Everything — schema foundation |
| B1 | C2, C3, B5, any normaliser that uses event types |
| B2 | G1, any connector that instantiates Source |
| B3 | Any Apify connector |
| B4 | Any connector that outputs full RawEvent |
| C1 | All connector implementations (tests broken until validate.ts exists) |
| C7 | All connectors that handle time or image URL |
| D3 | G1 sweep orchestration |
| D6 | G1 sweep design (concurrency decision) |
| E1 | Ticketmaster connector |
| E3 | DICE.fm connector |
| E4 | Eventbrite connector (may remove from Phase 1) |
| E5 | iCal connectors (Mono, Flying Duck) |
| E6 | RSS connectors (Art Map, Substack) |
| E7 | HTML connectors (SWG3, St Luke's, Mono, Flying Duck) |

---

## Tasks that block only public frontend or Phase 2

| Blocker | What it blocks |
|---------|----------------|
| A2 | Confidence in RLS posture before any public traffic |
| A3 | Defence-in-depth for public traffic; does not block Phase 1 connector work |
| F1 | Public submission form only |
| F2 | RA and Instagram connectors only |
| F3 | Public form with email collection |

---

## Definition of Done checklist

Phase 0.5 is complete when all of the following are ticked:

### Group A — Schema
- [x] [A1](A1-cc-new-1-schema-corrections.md) — CC-NEW-1 migration written, `pnpm supabase:reset` passes, BST/UTC assertion passes
- [x] [A2](A2-internal-rls-deny-tests.md) — Internal RLS deny tests pass against local Supabase
- [x] [A3](A3-event-tags-explicit-rls-confidence.md) — `event_tags` SELECT policy explicitly checks `confidence >= 60` (not relying on recursive RLS)

### Group B — Type alignment
- [x] [B1](B1-event-category-taxonomy.md) — `EventCategory` matches 13 SQL slugs
- [x] [B2](B2-source-interface-alignment.md) — `Source` interface matches `sources` table
- [x] [B3](B3-source-type-sync.md) — `SourceType` includes `'apify'` in all locations
- [x] [B4](B4-raw-event-contract.md) — `RawEvent` includes all 17 fields
- [x] [B5](B5-source-category-map-seed.md) — `source_type_category_map` seed migration exists and applies

### Group C — Core utility tests
- [ ] [C1](C1-connector-validate-red-tests.md) — `validate.ts` exists, connector tests pass
- [ ] [C2](C2-confidence-red-tests.md) — `calculateConfidence.test.ts` (red) written, one canonical formula
- [ ] [C3](C3-category-mapping-red-tests.md) — `mapSourceCategoryToEventType.test.ts` (red) written
- [ ] [C4](C4-venue-normalisation-red-tests.md) — venue normalisation tests pass (SQL/TS equivalence confirmed)
- [ ] [C5](C5-merge-behaviour-red-tests.md) — `mergeExternalEventIntoCanonicalEvent.test.ts` (red) written, merge table in docs
- [ ] [C6](C6-festival-detection-red-tests.md) — `festivals.test.ts` (red) written
- [ ] [C7](C7-time-tba-image-url-docs.md) — `NORMALISATION.md` Step 1 updated with UTC conversion, time_tba, image_url specs

### Group D — Deduplication and lifecycle docs
- [ ] [D1](D1-fuzzy-threshold-docs.md) — fuzzy-match threshold 0.35 in `DEDUPLICATION.md`
- [ ] [D2](D2-reschedule-handling-docs.md) — rescheduled event handling specified
- [ ] [D3](D3-removal-cancellation-lifecycle-docs.md) — upstream removal N-runs per tier defined
- [ ] [D4](D4-doors-vs-show-dedupe-docs.md) — doors-vs-show-time policy documented
- [ ] [D5](D5-multi-room-venue-dedupe-docs.md) — multi-room venue limitation documented
- [ ] [D6](D6-auto-create-venue-concurrency-docs.md) — `auto_create_venue()` race condition documented

### Group E — Connector pre-flights
- [ ] [E1](E1-ticketmaster-preflight.md) — Ticketmaster SPEC.md and fixture written
- [ ] [E2](E2-skiddle-preflight.md) — Skiddle approval request sent, deadline set, fallback documented
- [ ] [E3](E3-dice-apify-preflight.md) — DICE.fm Apify actor selected (or gap accepted), SPEC.md written
- [ ] [E4](E4-eventbrite-preflight.md) — Eventbrite ToS assessed, go/no-go decision documented
- [ ] [E5](E5-ical-parser-preflight.md) — iCal parsing decisions documented in `API-04.md`
- [ ] [E6](E6-rss-source-policy.md) — RSS Type A/B policy documented
- [ ] [E7](E7-html-scraper-preflight.md) — Per-source robots.txt and JS-rendering status documented

### Group F — Security and public-feature gates
- [ ] [F1](F1-public-submission-gate.md) — `SEC-04.md` updated with full Edge Function requirements
- [ ] [F2](F2-link-only-enforcement.md) — `SEC-05.md` updated with `is_link_only` migration requirement
- [ ] [F3](F3-gdpr-retention.md) — `SEC-06.md` and `OPERATIONS.md` updated with GDPR policy

### Group G — Orchestration
- [ ] [G1](G1-trigger-sweep-orchestration.md) — sweep orchestration red tests written

### Group H — Cleanup
- [x] [H1](H1-stale-task-cleanup.md) — stale task files cleaned; no references to `packages/ingestion` or `packages/publishing` remain

---

*When all boxes above are ticked, Phase 1 connector and normaliser implementation can begin.*
