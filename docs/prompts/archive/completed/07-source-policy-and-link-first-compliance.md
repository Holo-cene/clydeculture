# 07 — Source Policy and Link-First Compliance Audit

## Purpose

Audit and document source policy before adding real source URLs or enabling live
ingestion. Produce a recommendation document that clearly states what is permitted,
what requires review, and what is prohibited for each source type. This is a
documentation task only — no code should be written.

---

## Context

Clyde Culture is a link-first platform. The hard rule in CLAUDE.md and AGENTS.md is:

> **Link-first.** Clyde Culture routes to sources; it does not republish them. Store
> a short summary at most. Never store full descriptions or images from link-only
> sources (Resident Advisor, Instagram). Respect each source's terms of service.

Before enabling live ingestion from any source, the team needs a clear record of:
- What data can legally be stored.
- What must only be linked to.
- What is prohibited entirely.
- What requires obtaining written permission or a formal API agreement.
- How to handle Cloudflare-protected pages.
- What "link-first" means in practice for each source type.

The Ticketmaster image URL policy has already been decided in ADR 0004. This audit
should cover all other sources and produce a reusable reference.

---

## Files to Inspect

Read all of these before writing the policy document:

- `CLAUDE.md` — "Link-first" hard rule and source policy
- `AGENTS.md` — same rules for Codex agents
- `docs/CONNECTOR_GUIDE.md` — connector invariants and source type guide
- `docs/decisions/0003-scraping-strategy.md` — Apify/Crawlee decision
- `docs/decisions/0004-ticketmaster-image-usage.md` — already-decided image policy
- `docs/reference/SPEC.md` — platform specification (source tier definitions,
  link-first model, permitted sources)
- `packages/connectors/src/api/ticketmaster/SPEC.md` — Ticketmaster pre-flight notes
  (§5 and §8 cover ToS and image policy)
- `packages/connectors/src/connector.ts` — the `RawEvent` interface (what fields
  exist; which ones carry content vs. metadata)
- `packages/connectors/src/apify/README.md` — Apify connector guidance
- `supabase/migrations/` — check what `sources.source_type` values exist in the
  CHECK constraint; what tier values mean

---

## Task Instructions

This is a documentation task. Do not write code or change source files.

### 1. Define the link-first model in concrete terms

Write a section that defines link-first compliance for Clyde Culture specifically:
- What fields from `RawEvent` are considered metadata (always permitted).
- What fields are considered content (require ToS review per source).
- What is prohibited under link-first (copying full descriptions, binary-caching
  images, reproducing listings).

### 2. Audit each source category

For each of the following source categories, produce a policy entry:

**API sources (Tier 1):**
- **Ticketmaster** — already decided (ADR 0004). Summarise what is permitted and
  link to ADR 0004. Note the attribution requirement ("Buy on Ticketmaster").
- **Skiddle** — note the known requirement for written approval (from API-03 task
  notes). State the current status and what is needed before enabling.

**RSS/iCal sources (Tier 2):**
- What is typically permitted for RSS/iCal content (titles, start times, links, short
  summaries if provided).
- What is prohibited (copying full article body, caching full images from RSS item).
- Whether venue website iCal feeds (e.g. a Glasgow venue's own `/events.ics`) require
  review.

**Apify/scraper sources (Tier 2–3):**
- **Eventbrite via Apify** — the Apify actor exists as a stub. What is the ToS
  status? What data can be stored? What must be omitted?
- **DICE.fm** — note that ADR 0003 deferred DICE until official/permitted access is
  clear. What research is needed?
- **Venue HTML scraping (SWG3, Mono, St Luke's, Flying Duck)** — what data can be
  extracted from venue websites? Check whether these venues have a robots.txt policy
  (document that this should be checked before implementing each). What fields are
  permitted?

**Manual/community submissions:**
- What are the rules for user-submitted events? (Already stored as pending rows with
  moderation required — document the current policy.)

### 3. Cloudflare and anti-scraping policy

Write a policy statement on:
- What to do when a target URL is behind Cloudflare.
- Whether Crawlee/Playwright may be used to bypass bot detection.
- The answer (from ADR 0003 and CLAUDE.md) should be: prohibited without explicit
  operator agreement. Document this clearly.

### 4. How to handle source terms review

Write a short procedure for adding a new source:
1. Identify the source type (API / RSS / iCal / HTML / Apify).
2. Locate and read the source's ToS or API Terms.
3. Check whether the connector SPEC.md or pre-flight notes already cover the source.
4. Document the permitted fields, prohibited fields, and attribution requirements.
5. Record the review outcome as a note in the connector's SPEC.md or as a new ADR.
6. Only then enable the source in the database.

### 5. Produce the recommendation document

Write a new file at `docs/source-policy.md` (or update if it already exists) that
contains all of the above. The file should be structured as:
- Introduction (link-first model)
- Per-source policy table
- Cloudflare policy
- Procedure for adding new sources
- Deferred/blocked sources (Skiddle, DICE, any others requiring review)

---

## Non-Goals

- Do not implement connectors.
- Do not change the database schema.
- Do not enable any source in the database.
- Do not modify `apps/web`.
- Do not research sources by visiting live URLs (use existing documentation only).

---

## Validation Commands

```bash
git status --short
find docs -name "source-policy.md"
pnpm lint
```

---

## Required Output Format

### Summary

Two sentences: what the current link-first compliance status is, and what the policy
document now covers.

### Policy Document Created

State the file path.

### Per-Source Policy Table

| Source | Type | Tier | Permitted data | Prohibited | Status | Attribution required |
|---|---|---|---|---|---|---|
| Ticketmaster | API | 1 | (summary) | (summary) | Enabled (pending live key) | "Buy on Ticketmaster" |
| Skiddle | API | 1 | | | Blocked: written approval needed | |
| Eventbrite (Apify) | Apify | 2 | | | Stub only | |
| DICE.fm | Apify | 2–3 | | | Deferred: policy research needed | |
| SWG3 (HTML) | HTML | 3 | | | Stub only | |
| Venue iCal/RSS | iCal/RSS | 2 | | | Not started | |

### Deferred and Blocked Sources

List sources that cannot be enabled until specific reviews or approvals are completed.

---

## Acceptance Criteria

- `docs/source-policy.md` is created with the per-source policy table.
- Link-first compliance is defined in concrete terms (not just as a principle).
- Cloudflare bypass policy is explicitly documented.
- The Ticketmaster image attribution requirement (ADR 0004) is referenced.
- Skiddle and DICE.fm are listed as blocked/deferred with reasons.
- No code is written.
