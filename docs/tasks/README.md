# Engineering Backlog

Tasks are grouped by stage. Each file is a self-contained Claude Code prompt.
Work tasks in priority order; respect the dependency column.

---

## How to use

1. Open a task file.
2. Paste the **Prompt** section into a Claude Code session with the listed files as
   context.
3. Tick off the acceptance criteria before marking the task done.
4. Update this README when a task resolves — move it to the Done section.

**Sprint 0 first.** Do not start any Build task until every Sprint 0 row is ticked.
Sprint 0 is the pre-development cleanup sprint. Plan: `docs/prompts/03_SPRINT_0_PLAN.md`.

---

## Priority guide

| Priority | Meaning |
|---|---|
| P0 | Sprint 0 gate — must resolve before schema migration |
| P1 | Blocker — resolve before writing any connector or core code |
| P2 | Pre-launch — resolve before Phase 1 goes live |
| P3 | Phase 2 / improvement |

---

## ✅ Done

These tasks are closed. The closing artefact (ADR, doc, or migration) is listed.

| ID | Title | Closed by |
|---|---|---|
| BE-01 | Resolve and document the execution runtime | ADR 0002 — Trigger.dev v3 accepted |
| BE-03 | Define the normalisation contract | `docs/NORMALISATION.md` — full field-by-field contract written |
| BE-05 | Document the fan-out approach for long connector sweeps | ADR 0002 — fan-out native to Trigger.dev |
| BE-08 | Add a dead-letter path for unparseable items | ADR 0002 — Trigger.dev retry and failure alerts |
| BE-13 | Define the confidence_inputs JSON structure | `docs/NORMALISATION.md` Step 4 — structure and weights specified |
| BE-14 | Document and implement primary_source_id update logic | `docs/NORMALISATION.md` Step 8 — election rules specified |
| API-01 | SPIKE — Eventbrite deprecated; define Phase 1 grassroots coverage strategy | ADR 0003 — Apify/Crawlee strategy accepted; DICE.fm added |
| API-06 | HTML connector pre-flight — JS rendering SPIKE | ADR 0003 — PlaywrightCrawler handles JS rendering inside Trigger.dev tasks |
| API-07 | Add cold-start break detection | ADR 0002 — Trigger.dev zero-result task alerts replace custom detection |
| DOC-02 | Define error-handling and logging convention | ADR 0002 — Trigger.dev structured task logs |
| DOC-03 | Fix stale Eventbrite references in ARCHITECTURE.md | `docs/ARCHITECTURE.md` and `docs/reference/SPEC.md` updated |
| INF-02 | Set up CI pipeline | ADR 0002 — Trigger.dev deploy CLI; CI wired in INF-01 |
| DB-07 | Add publish_mappings delete guard | ADR 0001 — `publish_mappings` table being dropped in CC-NEW-1; guard is moot |
| SEC-01 | Enforce anon-key-only; document service_role blast radius | ADR 0001 + `docs/PUBLISHING.md` — anon key strategy and RLS table documented |
| SEC-05 | Link-only source enforcement — schema flag and normalisation guard | `docs/NORMALISATION.md` Step 1 — hard constraint specified |
| API-02 | SPIKE — Verify Ticketmaster Glasgow geo filter and paging guard | E1 pre-flight (2026-06-07) — `packages/connectors/src/api/ticketmaster/SPEC.md` and fixture written; `latlong` + 14-day rolling windows confirmed |
| SEC-10 | SPIKE — Ticketmaster image licensing | ADR 0004 (2026-06-08) — Option B: attribution required ("Buy on Ticketmaster"), hot-link permitted; `ticketUrlLabelGuess` implements it |

---

## 🔴 Sprint 0 — Pre-development cleanup

Run these before any implementation code. Full prompts in `docs/prompts/03_SPRINT_0_PLAN.md`.

| ID | Title | Priority | Status | Depends on |
|---|---|---|---|---|
| [CC-NEW-3](CC-NEW-3.md) | Resolve confidence threshold contradiction (RLS hardcode vs sources.config) | P0 | Open | — |
| [CC-NEW-4](CC-NEW-4.md) | Fix stale runtime references in INGESTION.md, OPERATIONS.md, SPEC.md | P0 | Open | — |
| [CC-NEW-1](CC-NEW-1.md) | Schema migration: drop Webflow fields/tables + apify source_type + correctness batch | P0 | Open | CC-NEW-3 |
| [CC-NEW-2](CC-NEW-2.md) | DICE.fm Apify connector pre-flight + spec | P1 | Open | — |
| [INF-01](INF-01.md) | Bootstrap per-package TypeScript and dependency configuration | P1 | Open (**unblocked** — BE-01 closed) |  — |

---

## 🔨 Build backlog

### BE tasks — Backend / Normalisation (open)

> BE-01, BE-03, BE-05, BE-08, BE-13, BE-14 are closed. See Done section.
> DB-01, BE-09, DB-08 are superseded by CC-NEW-1 (batched into schema migration).

| ID | Title | Priority | Area | Status | Depends on |
|---|---|---|---|---|---|
| [BE-02](BE-02.md) | Implement deletion detection in the orchestrator | P1 | Ingestion | Open | CC-NEW-1 |
| [BE-04](BE-04.md) | Handle rescheduled events and dedupe_key changes | P1 | Ingestion | Open | BE-03 (closed) → CC-NEW-1 |
| [BE-06](BE-06.md) | Specify and implement the fuzzy-match similarity threshold | P2 | Deduplication | Open | CC-NEW-1 |
| [BE-07](BE-07.md) | Add an incremental-sync cursor to the Connector interface | P2 | Connectors | Open | INF-01 |
| [BE-09](BE-09.md) | Fix compute_dedupe_key session-timezone dependency | P2 | Schema | **Superseded by CC-NEW-1** | — |
| [BE-10](BE-10.md) | Add doorsAt to the RawEvent connector interface | P2 | Connectors | Open | INF-01 |
| [BE-11](BE-11.md) | Add venue-rename propagation *(scope reduced: Webflow display fields dropped)* | P2 | Schema | Open | CC-NEW-1 |
| [BE-12](BE-12.md) | Fix unbounded loop in auto_create_venue | P2 | Schema | Open | CC-NEW-1 |
| [BE-15](BE-15.md) | Specify when the fuzzy dedup pass runs | P2 | Deduplication | Open | BE-06 |
| [BE-16](BE-16.md) | Add the festival manual-override table to the schema | P2 | Schema | Open | CC-NEW-1 |
| [BE-17](BE-17.md) | Extend ingest_alerts alert_type for festival detection failures | P2 | Schema | Open | BE-16 |
| [BE-18](BE-18.md) | Set up connector test infrastructure | P2 | Testing | Open | INF-01 |
| [BE-19](BE-19.md) | Externalise the confidence-score publishing threshold | P2 | Normalisation | Open | CC-NEW-3 |
| [BE-20](BE-20.md) | Extend RawEvent with pricing, ticketing, image, and availability fields | P2 | Connectors | Open | BE-10 |

---

### API tasks — Connectors (open)

> API-01, API-06, API-07 are closed. See Done section.

| ID | Title | Priority | Area | Status | Depends on |
|---|---|---|---|---|---|
| [API-02](API-02.md) | SPIKE — Verify Ticketmaster Glasgow geo filter and paging guard | P1 | Connectors | **Done** — see closed table | — |
| [API-03](API-03.md) | Skiddle API — obtain commercial approval before connector build | P1 | Legal | Open | — |
| [API-04](API-04.md) | iCal connector spec — RRULE, floating-time, and all-day events | P2 | Connectors | Open | INF-01 |
| [API-05](API-05.md) | RSS connector policy — fix publication date bug; define article-vs-event rule | P1 | Connectors | Open | — |
| [API-08](API-08.md) | External ID stability — hash instability and orphan expiry | P2 | Ingestion | Open | BE-02 |
| [API-09](API-09.md) | SPIKE — Verify Meetup GraphQL API public event search (Phase 2) | P3 | Connectors | Open | — |

---

### DB tasks — Schema (open)

> DB-07 is closed. DB-01, BE-09, DB-08 are superseded by CC-NEW-1.

| ID | Title | Priority | Area | Status | Depends on |
|---|---|---|---|---|---|
| [DB-01](DB-01.md) | Add missing schema CHECK constraints | P1 | Schema | **Superseded by CC-NEW-1** | — |
| [DB-02](DB-02.md) | Add PostGIS extension and venue geometry column | P2 | Schema | Open | CC-NEW-1 |
| [DB-03](DB-03.md) | Document PgBouncer connection strings | P1 | Ops | Open *(partial: OPERATIONS.md update in CC-NEW-4)* | — |
| [DB-04](DB-04.md) | Wire scheduled ingestion *(scope changed: Trigger.dev replaces pg_cron for orchestration; pg_cron may still be needed for archive_past_events)* | P2 | Schema, Ops | Open | CC-NEW-1 |
| [DB-05](DB-05.md) | Harden event_submissions RLS and add public read policies | P1 | Schema, Security | Open | CC-NEW-1, CC-NEW-3 |
| [DB-06](DB-06.md) | Add missing query performance indexes | P2 | Schema | Open | CC-NEW-1 |
| [DB-08](DB-08.md) | Add timezone_guess and IANA validation | P2 | Schema | **Superseded by CC-NEW-1** | — |
| [DB-09](DB-09.md) | Fix SPEC.md stale field definitions | P3 | Docs | Open *(partial: SPEC source table updated; field names need F2 audit)* | — |
| [DB-10](DB-10.md) | Make seed data idempotent | P3 | Schema | Open | CC-NEW-1 |
| [DB-11](DB-11.md) | Multi-room venue strategy for SWG3 — alias seed | P2 | Schema | Open | CC-NEW-1 |
| [DB-12](DB-12.md) | Define Phase 2 auth model | P2 | Schema, Security | Open | — |

---

### SEC tasks — Security & Compliance (open)

> SEC-01, SEC-05 are closed. See Done section.

| ID | Title | Priority | Area | Status | Depends on |
|---|---|---|---|---|---|
| [SEC-02](SEC-02.md) | Stored XSS — sanitisation in normalisation pipeline | P2 | Security | Open | INF-01 |
| [SEC-03](SEC-03.md) | SSRF — validate source_url before any server-side fetch | P2 | Security | Open | INF-01 |
| [SEC-04](SEC-04.md) | Submission flood — rate limiting and CAPTCHA | P2 | Security | Open | DB-05 |
| [SEC-06](SEC-06.md) | UK GDPR — PII retention policy | P2 | Compliance | Open | DB-05 |
| [SEC-07](SEC-07.md) | HTML scraper legality — ToS review and per-connector compliance log | P1 | Legal | Open | — |
| [SEC-08](SEC-08.md) | LLM prompt injection — Tier 4 connectors | P3 | Security | Open | — |
| [SEC-09](SEC-09.md) | Admin MFA and operator onboarding | P2 | Security | Open | DB-12 |
| [SEC-10](SEC-10.md) | SPIKE — Ticketmaster image licensing | P2 | Legal | **Done** — see closed table | — |
| [SEC-11](SEC-11.md) | Venue claim OTP verification (Phase 2) | P3 | Security | Open | DB-12 |

---

### DOC tasks — Documentation gaps (open)

> DOC-02, DOC-03 are closed. See Done section.

| ID | Title | Priority | Area | Status | Depends on |
|---|---|---|---|---|---|
| [DOC-01](DOC-01.md) | Create per-source fixture files | P2 | Docs | Open | ~~API-02~~ (done), CC-NEW-2 |

---

## Build sequence (after Sprint 0)

```
CC-NEW-1 schema migration (P0)
  → INF-01 monorepo bootstrap (P1)
    → DB-05 RLS policies
    → BE-02 deletion detection
    → BE-10 + BE-20 RawEvent interface
    → API-02 Ticketmaster spec
    → CC-NEW-2 DICE pre-flight
      → Tier 1 connector implementations (Ticketmaster, DICE, Eventbrite Apify)
        → packages/core normalisation implementation
          → M1 done

Parallel (no code dependency):
  API-03 Skiddle legal gate  ← send the email now
  API-05 RSS source policy
  SEC-07 HTML scraper ToS pre-flight
```
