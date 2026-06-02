# Prompts for Claude Code — building the documentation set

Run these **in order, one at a time**, in Claude Code (Cursor). Each one produces or
refines a file in `docs/`. Review and commit each before moving to the next — the later
prompts assume the earlier docs exist.

## Before you start

1. Paste the full platform specification into `docs/reference/SPEC.md`.
2. Paste the existing v5 Postgres schema into `docs/reference/SCHEMA_v5.sql`.
3. Paste the brand/design-language document into `docs/reference/DESIGN_LANGUAGE.md`.
4. Confirm `CLAUDE.md` exists at the repo root.

The prompts reference these files, so Claude Code reads the real source material rather
than inventing it.

---

## Prompt 0 — Orient and confirm context

```
Read CLAUDE.md, docs/reference/SPEC.md, docs/reference/SCHEMA_v5.sql, and
docs/reference/DESIGN_LANGUAGE.md in full. Do not write any code or docs yet.

Then reply with: (a) a 5–10 line summary of the platform in your own words, (b) any
contradictions or gaps you found between the spec, the schema, and CLAUDE.md, and
(c) a list of the documentation files you understand you'll be generating, in the
order they should be written. Ask me to resolve any contradiction before proceeding.
```

## Prompt 1 — PROJECT_OVERVIEW.md

```
Write docs/PROJECT_OVERVIEW.md. Source of truth: docs/reference/SPEC.md.

Cover: what Clyde Culture is and is not (link-first, not a publisher); the core
principles; platform focus areas; the four-tier source landscape at a high level;
MVP scope (Phase 1 vs Phase 2); and the success criteria and realistic maintenance
targets. This is the orientation doc a new contributor reads first.

Plain technical prose. No marketing language. Keep it to ~2 pages. Do not restate
the entire spec — summarise and link to docs/reference/SPEC.md for detail.
```

## Prompt 2 — ARCHITECTURE.md (+ resolve ADR 0001)

```
Write docs/ARCHITECTURE.md. Sources: docs/reference/SPEC.md and CLAUDE.md.

Describe the engine-first design: Supabase as source of truth; the ingestion layer
(API / RSS / iCal / HTML); the normalisation and dedup core; the publishing layer; and
the frontend as a disposable presentation layer. Include a data-flow section from raw
ingest to published event. Include a component diagram in Mermaid.

The frontend is undecided (see docs/decisions/0001-frontend-architecture.md). Do NOT
assume Webflow or Next.js in the architecture — describe the publishing boundary as an
adapter, and point to ADR 0001 for the pending decision. Flag every place in the design
that the frontend choice would change.

Plain technical prose. ~2–3 pages.
```

## Prompt 3 — DATA_MODEL.md (from the v5 schema)

```
Write docs/DATA_MODEL.md from docs/reference/SCHEMA_v5.sql. Do not invent tables —
document what is actually in the v5 schema.

For each table: its purpose, key columns, important constraints, and how it relates to
the others. Call out specifically: the events / external_events relationship; the
dedupe_key derivation; the visibility vs. confidence/needs_review distinction; the
sources connector registry and health fields; and the denormalised fields and why they
exist (Webflow has no joins — note this is contingent on ADR 0001).

Then create the first migration: copy the v5 schema into supabase/migrations/ as a
timestamped migration file, unchanged except for formatting. Tell me if any part of the
schema would need adjusting if ADR 0001 chooses a coded frontend over Webflow.

Plain technical prose plus the migration file.
```

## Prompt 4 — INGESTION.md

```
Write docs/INGESTION.md. Sources: docs/reference/SPEC.md, CLAUDE.md, and
packages/connectors/src/connector.ts.

Cover: the four source types and their stability tiers; the scheduled-job model; the
raw → normalised flow into external_events then events; per-run logging to ingest_runs
(fetched/parsed/upserted/created/updated/errors counts); and break detection (flag a
connector when parsed count drops >70% below its 14-day median, raise an ingest_alert,
send mail). Describe how connectors are enabled/disabled independently.

Reference the Connector interface in packages/connectors/src/connector.ts as the
contract. Plain technical prose. ~2 pages.
```

## Prompt 5 — CONNECTOR_GUIDE.md (the contributor contract)

```
Write docs/CONNECTOR_GUIDE.md: a step-by-step guide for building a new connector,
written for an open-source community contributor who is a competent developer but new
to this codebase.

Use packages/connectors/src/connector.ts as the interface to implement. Cover: choosing
the source type; where the connector file goes; implementing run() and returning errors
rather than throwing; extracting a stable externalId per source type (API id / RSS GUID
/ iCal UID / content hash); the link-first rule (always capture externalUrl; never store
full descriptions or images from link-only sources); registering the connector in the
sources table; and testing locally. Include a minimal worked example for an RSS source.

This is the most-read contributor doc — make it concrete and followable. ~2–3 pages.
```

## Prompt 6 — DEDUPLICATION.md

```
Write docs/DEDUPLICATION.md. Sources: docs/reference/SPEC.md and docs/DATA_MODEL.md.

Explain within-source dedup (upsert by source_id + external_id) and cross-source dedup
(SHA-256 of normalised venue | start bucket | normalised title). Specify the
normalisation rules precisely (lowercasing, trimming, punctuation stripping, the time
bucket size and the trade-off between 30-minute and hourly buckets). Describe the
fuzzy-match candidate flow into event_merge_candidates and the rule that API-sourced
records win as canonical over scraped records. Include 2–3 worked examples of the same
real event arriving from different sources and how it collapses to one record.

Plain technical prose. ~1.5 pages.
```

## Prompt 7 — FESTIVALS.md

```
Write docs/FESTIVALS.md. Source: docs/reference/SPEC.md.

Cover: festivals as first-class entities; the detection rules (festival domain match,
title contains festival name, URL contains a known festival slug, manual mapping table);
the date-window validation needed to avoid false positives (an event must fall inside
the festival's start/end window to be tagged); attaching festival_id and setting
is_festival_event; and how festival pages are populated automatically. List the named
festivals from the spec.

Plain technical prose. ~1.5 pages.
```

## Prompt 8 — PUBLISHING.md

```
Write docs/PUBLISHING.md. Sources: docs/reference/SPEC.md and
docs/decisions/0001-frontend-architecture.md.

Describe the publishing boundary: only visibility = 'published' events above the
confidence threshold are eligible. Document BOTH paths and state that the active one
depends on ADR 0001:
  - Webflow path: batched sync to the Webflow CMS API, publish_mappings with content
    hash for incremental publishing, publish_jobs for audit.
  - Coded-frontend path: the frontend reads Supabase directly; no sync job, no content
    hash, no denormalised-for-Webflow fields.
Make clear which tables/fields exist only to serve the Webflow path.

Plain technical prose. ~1.5 pages.
```

## Prompt 9 — OPERATIONS.md (devops)

```
Write docs/OPERATIONS.md. Sources: docs/reference/SPEC.md, .env.example, CLAUDE.md.

Cover the operational model for a 1–3 hours/month maintenance target: environments
(local via Supabase CLI, production); secrets management (env / Supabase Vault, never
committed); where scheduled ingestion runs (Supabase Edge Functions, scheduled
functions, or an external cron — list the options and trade-offs); monitoring via
ingest_runs and ingest_alerts; the break-detection alert flow and who it emails;
the moderation queue workflow for submissions and venue claims; and a backup/restore note.

Plain technical prose. ~2 pages.
```

## Prompt 10 — ROADMAP.md (delivery plan)

```
Write docs/ROADMAP.md. Source: docs/reference/SPEC.md (sections 14 and 15).

Turn the Phase 1 / Phase 2 / long-term scope into an actual build order with milestones
and a clear definition of done per milestone. Sequence it so the engine ships before the
frontend, and so the three Tier 1 APIs (Ticketmaster, Skiddle, Eventbrite) land before
the HTML scrapers. Note the dependency: the frontend milestones are blocked on ADR 0001.
Keep it realistic against the stated maintenance target.

Plain technical prose. Milestones may use a checklist format.
```

## Prompt 11 — BRAND_VOICE.md and CONTRIBUTING.md

```
Write two files.

1. docs/BRAND_VOICE.md — distil docs/reference/DESIGN_LANGUAGE.md into an actionable
   voice guide. Make explicit WHERE the voice applies (editorial and navigational copy,
   alt text, social) and where it does NOT (individual community listings keep the
   contributor's voice). Keep the four principles, the Glaswegian-tone rule (rhythm
   Scottish, spelling not), the never-rank rule, and the accessibility rules. Write it
   IN the Clyde Culture voice. Do not use staccato rhetorical fragments. Keep it short
   enough to actually be used.

2. docs/CONTRIBUTING.md — the contributor model: how to propose and submit a connector
   (point to docs/CONNECTOR_GUIDE.md), code conventions from CLAUDE.md, the PR/review
   expectation, and the link-first / ToS rules contributors must respect.
```

## Prompt 12 — Final consistency pass

```
Read every file in docs/ and CLAUDE.md. Produce a short report listing: any
contradictions between documents, any term used inconsistently (e.g. event type names,
table names, field names), any doc that assumes a frontend decision ADR 0001 hasn't
made yet, and any link or filename that points to something that doesn't exist. Propose
fixes but do not apply them until I approve.
```
