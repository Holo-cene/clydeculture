# 15 — RSS Source Preflight

## Purpose

Assess RSS feasibility for Glasgow venues before writing any connector code.
Produces a source policy decision for each candidate venue, a generic field
mapping contract, and an approved venue list for `16a`. No code changes.

---

## Skill

Spawn an **Explore** subagent to read local docs. Do **not** fetch live URLs.

## Parallelization

Can start after prompt `11` completes. Does not depend on Phase A or Phase B fixes.
`16a` must wait for this prompt to complete.

---

## Context

ADR 0003 defines the connector tier hierarchy. RSS is Tier 2: near-zero maintenance,
no auth required, no JS rendering needed. Many Glasgow venues publish RSS event feeds.

Before writing the connector, each target venue requires:
- Confirmed `robots.txt` allowance (note as "to confirm" if unknown from local docs)
- Terms of Service summary (link-first compliance — may we index, normalise, and link?)
- Field mapping from their RSS item structure to `RawEvent`
- A `slug` matching a future `sources` table row

`packages/connectors/src/rss/` exists as an empty placeholder (`.gitkeep` only) —
no interface stubs yet; the connector is built from scratch.
`docs/CONNECTOR_GUIDE.md` defines the compliance requirements and interface spec.

**Do not fetch live URLs.** Use local documentation only. Mark any missing information
as "to confirm before deployment".

Candidate Glasgow venues to assess (from ADR 0003 and the project brief):
- The Glad Cafe
- CCA Glasgow (Centre for Contemporary Arts)
- Tramway
- King Tut's Wah Wah Hut
- The Hug and Pint

---

## Files to Inspect

- `docs/CONNECTOR_GUIDE.md` — compliance checklist, interface spec, `robots.txt` requirements
- `docs/decisions/0003-scraping-strategy.md` — tier rationale, source priorities
- `packages/connectors/src/rss/` — empty placeholder (`.gitkeep` only)
- `packages/connectors/src/api/ticketmaster/index.ts` — reference connector pattern
- `packages/connectors/src/connector.ts` — `RawEvent` interface fields
- `docs/tasks/phase-0.5/E6-rss-source-policy.md` — open policy decisions
- `supabase/migrations/` — latest migration (check `sources` table columns)

---

## Task Instructions

1. Read `docs/CONNECTOR_GUIDE.md`. Extract the compliance checklist required
   before any new connector can be built.

2. Read `docs/tasks/phase-0.5/E6-rss-source-policy.md`. Note which policy
   questions are still open (event vs. article disambiguation, date-missing handling,
   guid stability, link-first for description).

3. For each candidate venue, complete a preflight record:
   - **Slug** (kebab-case machine name, will become the `sources.slug` value)
   - **Known RSS URL** (from public knowledge only — no live fetches; mark unknown)
   - **robots.txt status** (confirm from public knowledge; mark "to confirm" if unknown)
   - **ToS summary** (can we index, normalise title/date/venue, and link back?)
   - **Expected field coverage** (does their RSS include dates? venue? ticket URL?)
   - **Verdict:** `Approved` / `Gated (need more info)` / `Rejected`

4. Define the generic RSS → `RawEvent` field mapping contract:

   ```
   RSS item field       → RawEvent field        Notes
   item.guid            → externalId             Use link if guid absent
   item.link            → externalUrl            Required; skip if missing
   item.title           → title                  Required; skip if missing
   item.pubDate         → startAt                ISO 8601 parse; omit if unparseable
   item.description     → NOT stored             Link-first; no description storage
   item.category        → eventTypeGuess         Optional
   item.enclosure.url   → imageUrlGuess          Optional; only if permitted
   ```

5. Answer the policy questions from `E6-rss-source-policy.md`:
   - How to handle RSS items with no date (omit `startAt`; do not fabricate)?
   - How to distinguish events from news/blog posts (title heuristic or category tag)?
   - Use `guid` as `externalId` if present and stable; fall back to `link`?
   - Should any short description be stored (≤ 200 chars) if the source ToS permits?

6. Produce an approved source list: venue slugs cleared to build a connector for,
   ordered by priority.

7. Draft `docs/DECISIONS_LOG.md` entries for any policy decisions made above.

---

## Non-Goals

- Do not write any TypeScript.
- Do not create migration files.
- Do not call live APIs, fetch RSS feeds, or check live `robots.txt`.
- Do not add connectors to `sweep.ts`.
- Do not open `SEC-07.md` compliance concerns here (those are for HTML connectors).

---

## Validation Commands

None — this is a documentation-only assessment.

---

## Required Output Format

### Candidate Venue Assessment Table

| Venue | Slug | RSS URL | ToS Status | Field Coverage | Verdict |
|---|---|---|---|---|---|

### Field Mapping Contract

Generic RSS → `RawEvent` mapping (approved for all RSS connectors).

### Policy Decisions

Answers to the open questions from `E6-rss-source-policy.md`. Record each as a
decision: question → answer → rationale.

### Approved Sources

Ordered list of venue slugs cleared for connector development, with priority rationale.

### Decisions Log Entries

Draft entries for `docs/DECISIONS_LOG.md`.

---

## Acceptance Criteria

- [ ] At least 3 Glasgow venues assessed with evidence from local docs
- [ ] Generic field mapping contract defined (all `RawEvent` fields addressed)
- [ ] All policy questions from `E6-rss-source-policy.md` answered or explicitly deferred
- [ ] Approved source list produced with at least 1 venue
- [ ] No TypeScript or SQL written
- [ ] `docs/DECISIONS_LOG.md` entries drafted
