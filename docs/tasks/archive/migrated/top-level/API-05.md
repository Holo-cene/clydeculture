> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #29 (RSS connector consolidated). See `docs/tasks/MIGRATION_TRIAGE.md`.

# API-05: RSS connector policy — fix publication date bug and define article-vs-event rule

**Priority:** P1  
**Area:** Connectors / Docs  
**Status:** Open  
**Depends on:** —

## Why this matters

The Connector Guide's RSS worked example (Section 6) uses `item.isoDate` as `startAt`.
For newsletter sources (Substack, arts publications), `isoDate` is the newsletter's
**publication date** — not the date of any event described inside the post. A Substack
roundup published on 2 June describing events on 14 June will be ingested with
`startAt = 2026-06-02` and show in the "tonight" feed on the wrong date.

This bug is in the current shipped documentation and will be replicated by any AI coding
agent or developer that uses the template. The CONNECTOR_GUIDE.md has been patched to
set `startAt: undefined` with an explanatory comment (done in review), but the broader
policy question is unresolved:

- RSS items from newsletters are **posts**, not structured events.
- There is no defined policy for how to extract event date/time from prose.
- There is no defined rule for distinguishing an article from an event listing.
- Without both, RSS connectors will produce low-quality records that flood the moderation
  queue with unusable drafts.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md`, `docs/INGESTION.md`,
`docs/reference/SPEC.md` Section 6 (Tier 2 sources), and `CLAUDE.md` before proceeding.

**Your task** is to write the RSS source policy and update the connector documentation.
This is a documentation task — do not build any connector.

**Step 1 — Write the RSS source policy:**

Create `docs/RSS_SOURCE_POLICY.md` addressing:

1. **What RSS connectors can reliably extract:**
   - Post title → `events.title` (as the best available title for a link-out record)
   - Post URL → `externalUrl` (required; this is the canonical link)
   - `item.guid` → `externalId`
   - Publication date → stored only in `raw`, not in `startAt`
   - `startAt` → `undefined` for all newsletter sources unless the RSS item includes
     a structured event extension (e.g., `<event:startDate>` or schema.org markup)

2. **What RSS connectors cannot reliably extract from prose:**
   - Event date and time (publication date ≠ event date)
   - Venue name (newsletter may describe events at multiple venues)
   - Whether the item is a discrete event vs. an editorial article

3. **Article-vs-event disambiguation rule:**
   Define a two-tier classification:
   - **Type A — structured event feed:** The RSS source publishes one item per event
     (e.g., a venue's own events feed). Items have a deterministic `startAt` field.
     Use standard `RawEvent` mapping including `startAt`.
   - **Type B — editorial newsletter:** The RSS source publishes editorial posts that
     may reference zero, one, or many events. Items must be ingested with `startAt: undefined`.
     They are routed to moderation and require a human to associate them with specific
     events or discard them.
   The `sources` table `config` JSON should include a `"rssType": "event-feed" | "newsletter"`
   field that the RSS connector reads to determine which behaviour to apply.

4. **Confidence scoring:**
   Define that Type B (newsletter) records receive a confidence score of ≤ 30, ensuring
   they always require manual moderation and are never auto-published.

**Step 2 — Update `docs/CONNECTOR_GUIDE.md`:**

Add a callout box at the start of Section 6 (RSS worked example):

> **RSS source type matters.** The template below applies to Type A (event-feed) sources.
> For Type B (editorial newsletter) sources such as Substack roundups, `startAt` must
> be `undefined` — see `docs/RSS_SOURCE_POLICY.md`. Never use `item.isoDate` as the
> event date for newsletter sources; it is the publication date, not the event date.

**Step 3 — Update the `sources` table spec in `docs/DATA_MODEL.md`:**

In the `sources` table description, add `rssType` as a documented config key:

> `config.rssType` — `"event-feed"` (one item = one structured event) or `"newsletter"`
> (items are editorial posts; event dates not extractable). Required for all `source_type = 'rss'`
> sources.

**Step 4 — Update Tier 2 sources in `docs/reference/SPEC.md`:**

In the RSS/iCal Tier 2 table, add a "Type" column:

| Source | Type |
|---|---|
| Glasgow Art Map (Substack) | newsletter |
| Venue Substacks | newsletter |

---

## Acceptance criteria

- [ ] `docs/RSS_SOURCE_POLICY.md` exists and covers the four sections above
- [ ] The policy defines Type A vs Type B sources and their different handling
- [ ] The policy states that newsletter sources must have `startAt: undefined`
- [ ] The policy defines confidence ≤ 30 for Type B records
- [ ] `docs/CONNECTOR_GUIDE.md` Section 6 has the callout box
- [ ] `docs/DATA_MODEL.md` documents `config.rssType` on the `sources` row
- [ ] `docs/reference/SPEC.md` Tier 2 table includes a Type column for RSS sources
- [ ] No updated RSS connector template uses `item.isoDate` as `startAt`
