# 10 — Next Source Fixture Plan

## Purpose

Plan the next ingestion source fixture after the Ticketmaster E2E path is proven.
Produce a prioritised recommendation document for the next connectors to build,
ordered by legal risk, technical complexity, and value to the Clyde Culture index.

This is a planning/documentation task only. Do not implement connectors.

---

## Context

After the Ticketmaster fixture E2E is proven (prompt 05), the next step is to expand
the source coverage to include more Glasgow cultural sources. The repository has stub
directories for:

```
packages/connectors/src/api/skiddle/       — API, requires written approval
packages/connectors/src/api/meetup/        — API (Meetup GraphQL API)
packages/connectors/src/rss/               — RSS feeds (empty)
packages/connectors/src/ical/              — iCal feeds (empty)
packages/connectors/src/html/flying-duck/  — HTML scraper stub
packages/connectors/src/html/mono/         — HTML scraper stub
packages/connectors/src/html/st-lukes/     — HTML scraper stub
packages/connectors/src/html/swg3/         — HTML scraper stub
packages/connectors/src/apify/eventbrite/  — Apify actor stub
packages/connectors/src/apify/dice/        — Apify actor stub
```

The sequence in which these are built matters. Sources with higher legal/policy risk
(DICE, Skiddle, Eventbrite via scraper) should be deferred until permits or API
agreements are in place. Sources with low legal risk and straightforward
implementation (RSS, iCal) should be prioritised.

---

## Files to Inspect

Read all of these before writing the plan:

- `docs/decisions/0003-scraping-strategy.md` — ADR on Apify/Crawlee
- `docs/CONNECTOR_GUIDE.md` — connector invariants and file layout
- `docs/source-policy.md` — if created in prompt 07, use it; otherwise use
  `CLAUDE.md` link-first rules
- `packages/connectors/src/connector.ts` — the `Connector` interface
- `packages/connectors/src/api/ticketmaster/index.ts` — implemented connector pattern
- `packages/connectors/src/apify/README.md` — Apify connector notes
- `supabase/migrations/` — check `sources` table tier definitions and existing rows
- `docs/tasks/API-01.md` through `API-09.md` — existing API task notes (check
  whether Skiddle, RSS, or iCal tasks give approval status)
- `docs/reference/SPEC.md` — platform specification (source tiers, source types)

---

## Task Instructions

This is a planning task only. Do not implement connectors or write tests.

### 1. Assess each candidate source

For each candidate source listed below, document:
- **Source type** (API / RSS / iCal / HTML / Apify)
- **Tier** (1 = Tier 1 API, 2 = RSS/iCal/Apify, 3 = HTML)
- **Legal/policy risk** (Low / Medium / High / Blocked)
- **Technical complexity** (Low / Medium / High)
- **Coverage value** (how many Glasgow events would this add?)
- **Status** (Ready to build / Needs policy review / Blocked / Deferred)
- **Blocker or prerequisite** (if any)

**Candidates to assess:**

| Source | Notes |
|---|---|
| RSS — venue websites | Many Glasgow venues publish RSS/Atom feeds |
| iCal — venue calendars | Common for arts centres and theatres |
| iCal — Glasgow Life venues | Glasgow City Council venue calendars |
| Skiddle API | Requires written approval per API-03 task |
| Meetup (GraphQL API) | Requires API key; community events |
| Eventbrite via Apify | Apify actor; ToS review needed for scraping |
| SWG3 (HTML) | Venue website scraper stub |
| Mono (HTML) | Venue website scraper stub |
| St Luke's (HTML) | Venue website scraper stub |
| Flying Duck (HTML) | Venue website scraper stub |
| DICE.fm (Apify) | Policy/ToS research needed (ADR 0003 deferred) |

### 2. Recommend the next two or three connectors to build

Based on your assessment, recommend the next two or three connectors to build, in
priority order. For each recommendation:
- State why it is the right next step (low risk, high value, technically straightforward).
- State what fixture data is needed (a sample RSS feed, a sample iCal file, etc.).
- State what the test plan would look like at a high level (parse test → E2E fixture
  test following the pattern established in prompts 04–05).
- State any prerequisites that must be completed first.

### 3. Document DICE as a policy/research item

Write a clear section on DICE.fm that:
- Notes that ADR 0003 explicitly deferred DICE.fm.
- Describes what research is needed before a DICE connector can be built.
- Does NOT recommend building a DICE connector in this phase.

### 4. Write the recommendation document

Write a new file at `docs/next-source-plan.md` that contains:
- An introduction explaining the prioritisation criteria.
- The assessment table (from step 1).
- The prioritised recommendation with rationale (from step 2).
- The DICE policy note (from step 3).
- A section on what the generic fixture-test-first pattern looks like for a new
  connector (so future agents can follow it without re-reading this prompt).

---

## Prioritisation criteria

Use these criteria when recommending the sequence:

1. **Legal/policy risk** (lowest risk first) — RSS and iCal from venue own websites
   have almost no legal risk. Apify scraping Eventbrite without an API agreement has
   high legal risk. Skiddle requires written approval.

2. **Technical complexity** (simplest first) — RSS and iCal parsers are straightforward
   and battle-tested. HTML scrapers are fragile. Apify connectors add actor management
   complexity.

3. **Coverage value** — a single RSS feed from an active Glasgow venue adds fewer events
   than a Ticketmaster integration, but proves the RSS connector pattern quickly and
   at low cost.

4. **Fixture availability** — sources with easily obtainable test fixtures (sample RSS
   XML, sample iCal file) are lower-effort to prove with the fixture-first TDD approach.

---

## Non-Goals

- Do not implement any connector in this task.
- Do not write tests in this task.
- Do not add Apify actors or configure external services.
- Do not recommend DICE as a near-term build target unless official API access has
  been confirmed.
- Do not add database rows for new sources.

---

## Validation Commands

```bash
git status --short
find docs -name "next-source-plan.md"
pnpm lint
```

---

## Required Output Format

### Summary

Two sentences: what are the top two or three recommended next connectors and why?

### Assessment Table

Full table from step 1, populated from code inspection and documentation review.

### Recommended Sequence

For each recommended connector:
- Source name and type
- Why this is the right next step
- What fixture data is needed
- High-level test plan
- Prerequisites

### DICE Policy Note

What research is required before DICE can proceed.

### Plan Document Created

State the file path: `docs/next-source-plan.md`

---

## Acceptance Criteria

- `docs/next-source-plan.md` is created with the assessment table and recommendation.
- DICE is documented as a policy/research item, not a near-term build target.
- RSS and/or iCal are recommended ahead of HTML scrapers and Apify sources for
  low-risk coverage expansion.
- Skiddle is listed as blocked until written approval is obtained.
- No connectors are implemented.
