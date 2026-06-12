# Critical Review Prompts for Claude Code — pre-build risk assessment

A set of follow-up prompts that put Claude Code into specific senior-expert roles and ask
it to **critically assess** the idea and the planned implementation across the whole `docs/`
set + `CLAUDE.md`, looking for issues, complications, and blockers *before* code is written.

These are deliberately adversarial. The goal is not validation — it is to surface what
would actually block, bite, or rot in production, and to test whether the documentation is
concrete enough to build from with an AI agent.

## How to use these (JIRA workflow)

- Run each review (R1–R5) as a **separate Claude Code task in a fresh session**, so the
  personas don't bleed into one another. Each maps to one JIRA **analysis/spike ticket**.
- Each review emits a list of **findings in the shared format below**. Each finding becomes
  a child JIRA ticket (Bug / Risk / Spike / Task).
- Run **R6 last** to deduplicate across reviews and produce the prioritised, dependency-
  ordered backlog (an Epic + tickets), plus an optional CSV block for bulk import.
- All reviews are **assessment only**: no file edits, no implementation code.
- This complements Prompt 12 in `PROMPTS_FOR_CLAUDE_CODE.md` (a consistency pass). These
  go deeper, by domain.

## Shared finding format (use for every finding in R1–R5)

```
### [<PREFIX>-NN] <concise, ticket-style summary>
- Issue type: Blocker | Risk | Spike | Tech-debt | Improvement | Question
- Priority: Critical | High | Medium | Low
- Component: <ingestion | schema | connectors | publishing | security | ops | docs>
- Labels: <freeform, e.g. supabase, rls, eventbrite, runtime>
- Affected docs: <files, sections, and the specific claim being challenged>
- Finding: <what is wrong, missing, or risky — cite the exact claim, don't paraphrase vaguely>
- Impact: <concrete consequence in production or for the build if left unaddressed>
- Recommendation: <a direction or option(s); a spike is a valid recommendation>
- Acceptance criteria: <what "resolved" looks like, testable>
- Blocks: <other finding IDs or build milestones, if any>
```

Prefixes: backend = `BE`, database = `DB`, connectors = `API`, security = `SEC`,
documentation = `DOC`.

Rules that apply to every review:
- Read **every** file in `docs/` (including `docs/reference/` and `docs/decisions/`) and
  `CLAUDE.md` in full before writing anything.
- Cite the specific document and claim. No generic best-practice filler.
- Distinguish a true **blocker** (cannot proceed) from a **risk** (can proceed with care)
  from a **spike** (needs investigation to even classify).
- Explicitly mark anything **too underspecified for you to implement without guessing** —
  that itself is a finding.
- Be concrete about severity. Do not soften. If something is fine, say so briefly and move on.

---

## R1 — Senior Backend / Ingestion Architecture review

```
You are a senior backend engineer who will own this system in production and be paged when
it breaks. Read every file in docs/ and CLAUDE.md, then critically assess the architecture
and the ingestion pipeline for issues that would block or destabilise development. Output
findings using the shared finding format (prefix BE). Assessment only — do not write code.

Interrogate at least the following, and look beyond them:
1. RUNTIME. Where does the ingestion code actually execute? The connectors are described as
   Node/TypeScript in a pnpm monorepo, but the backend is Supabase. Supabase Edge Functions
   run on Deno with wall-clock execution limits and no headless browser. Reconcile this. Can
   the connectors, RSS/iCal parsing, and especially HTML scraping run in that runtime at all?
   If not, what host runs them, and is that documented anywhere? Treat any unresolved answer
   as a high-severity blocker, because it dictates most other decisions.
2. ORCHESTRATION. What schedules and runs ingestion (pg_cron, Edge Function schedules,
   external cron)? Is per-connector isolation, concurrency, retry, and idempotency defined?
   What happens on a partial failure mid-run?
3. NORMALISATION CONTRACT. The raw -> canonical step is asserted but not specified. Is there
   a defined mapping from each source's categories to the 13-type taxonomy? Who owns tag
   derivation? An AI agent will invent this inconsistently if it is undefined.
4. LIFECYCLE. external_events has is_deleted / last_seen_at. How does an upstream
   cancellation or removal propagate to the canonical event's visibility? Is that logic
   defined? What about updates that change date/venue (which would change the dedupe_key)?
5. TIME. Timezone/BST handling on extraction, and the door-time vs show-time distinction for
   Glasgow venues. Where is this handled, and is it correct for HTML/iCal sources with
   floating or ambiguous times?
6. DEDUPE AT SCALE. The cross-source "fuzzy score threshold" candidate step has no algorithm,
   threshold, or blocking strategy. Is it O(n^2)? What stops it being expensive or wrong?
7. OBSERVABILITY & BACKFILL. Beyond ingest_runs, is there a dead-letter path for unparseable
   items? Is first-run backfill vs incremental sync distinguished?
```

---

## R2 — Supabase / Postgres / SQL review

```
You are a Supabase and Postgres expert doing a pre-implementation schema and data-layer
review. Read every file in docs/ and CLAUDE.md (the authoritative schema is
docs/reference/SCHEMA_v5.sql; cross-check it against DATA_MODEL.md and SPEC.md). Output
findings using the shared finding format (prefix DB). Assessment only — do not write code.

Interrogate at least the following, and look beyond them:
1. DEDUPE_KEY CORRECTNESS. dedupe_key = SHA-256(normalised venue | hour bucket | normalised
   title). Assess false-merge risk: multi-room venues (e.g. SWG3 runs several spaces at
   once), two genuinely different events at the same venue in the same hour, and the bucket
   granularity trade-off. Should this be a unique constraint, an advisory index, or neither?
2. CONSTRAINTS & GENERATED COLUMNS. Check is_festival_event and any generated columns for
   NULL handling, and audit CHECK-constraint coverage (e.g. is the confidence/needs_review/
   visibility relationship enforced, or only described in prose?).
3. RLS. Is any Row Level Security policy actually defined for event_submissions,
   venue_claims, and public read access to events? State the required default-deny posture
   and the anon vs authenticated vs service_role split. Missing RLS on public-writable tables
   is a security blocker, not a nice-to-have.
4. INDEXES. Are the indexes required for the real query patterns specified? At minimum:
   the (source_id, external_id) unique constraint that makes upsert work, start_at for date
   listings, dedupe_key, a GIN index on tags[], and a full-text index if the site is
   "searchable". Flag each that is missing.
5. ENUMS vs LOOKUP. event_type and visibility as Postgres enums: assess the migration cost
   of adding a value later versus a lookup table, given a community-extensible taxonomy.
6. TIME MODEL. Clarify the intent of timestamptz plus a separate timezone text column. Is the
   system storing an instant or a wall-clock time? Is that consistent across the pipeline?
7. SUPABASE OPERATIONS. Connection pooling (transaction-mode PgBouncer and its effect on
   prepared statements), pg_cron availability on the chosen plan, Vault for secrets,
   service_role exposure, and any free/low-tier row or compute limits that the daily
   ingestion volume could hit.
8. MIGRATIONS & DRIFT. Assess the single-v5-dump-as-baseline approach, seed idempotency, and
   any field/enum-name drift between SCHEMA_v5.sql, DATA_MODEL.md, and SPEC.md.
```

---

## R3 — API & Connector review

```
You are an integrations engineer who has shipped many third-party API and scraper
connectors. Read every file in docs/ and CLAUDE.md, focusing on the source landscape
(SPEC.md Section 6), the connector model, and packages/connectors/src/connector.ts. Output
findings using the shared finding format (prefix API). Assessment only — do not write code.
Where a claim depends on a third party's current API policy, recommend a SPIKE to verify
rather than assuming.

Interrogate at least the following, and look beyond them:
1. EVENTBRITE. The plan treats Eventbrite as a Phase 1 backbone for grassroots coverage.
   Verify whether Eventbrite's public API still supports searching public events by location
   at all — its public event search has been heavily restricted for years and may only
   return an authenticated org's own events. If so, Eventbrite cannot deliver the role the
   spec assigns it. Raise this as a high-priority spike with a fallback plan.
2. TICKETMASTER DISCOVERY. Rate/daily quota limits, deep-paging caps, the correct Glasgow geo
   filtering approach (lat/long + radius vs market/DMA), and the attribution, caching, and
   image-licensing terms that constrain what may be stored and displayed.
3. SKIDDLE. API key approval process, rate limits, and commercial-use terms.
4. iCal. Recurrence rule (RRULE) expansion, VTIMEZONE and floating-time handling, and
   all-day events. These are common correctness failures.
5. RSS / SUBSTACK. RSS items are posts, not structured events. Assess the reliability of
   extracting date, time, and venue from prose, and how article-vs-event is disambiguated.
6. HTML SCRAPERS. JavaScript-rendered pages need a real browser, which the chosen runtime may
   not support (see the backend runtime question). robots.txt and ToS compliance, selector
   fragility, and the cold-start problem in break detection (the 70%-of-14-day-median rule is
   meaningless until 14 days of history exist).
7. EXTERNAL ID STABILITY. Assess GUID stability per source and whether the hash-fallback
   inputs are deterministic enough to avoid duplicate canonical events on re-ingestion.
8. ENRICHMENT. "Enrich ticket links via Ticketmaster/Skiddle" relies on cross-source matching
   — the same unsolved fuzzy-match problem as dedupe. Flag the dependency.
```

---

## R4 — Security & Compliance review

```
You are an application security engineer reviewing this design before any code exists. Read
every file in docs/ and CLAUDE.md. Output findings using the shared finding format (prefix
SEC). Assessment only — do not write code. Treat anything touching public-writable tables,
secrets, or third-party data with appropriate suspicion.

Interrogate at least the following, and look beyond them:
1. SECRETS. service_role key blast radius, where it is used, and how it is kept off any
   client. Vault vs environment variables. Connector config in jsonb must never hold secrets.
2. PUBLIC SUBMISSION FORM. Stored-XSS risk if submitted descriptions are rendered later;
   input sanitisation point; SSRF risk if the system ever fetches a user-supplied source_url
   server-side for enrichment or preview; spam, rate limiting, and CAPTCHA; and whether the
   moderation queue is genuinely the only path to publication.
3. VENUE CLAIMS. Robustness of "proof" (a venue-domain email is spoofable), the authorisation
   scope a claimant receives, the risk of venue-profile takeover, and whether an audit trail
   exists.
4. RLS & ADMIN AUTH. Confirm a default-deny posture, who can read the moderation queue, and
   how admins/moderators authenticate (Supabase Auth, MFA). Cross-reference the DB review.
5. UK DATA PROTECTION. PII in submissions (submitter contact details, and any personal data
   of third-party organisers), lawful basis, retention policy, and data-subject-request
   handling.
6. COPYRIGHT / ToS ENFORCEMENT. The link-first and "link-only sources" rules (Resident
   Advisor, Instagram) are stated in prose. Are they actually enforceable in the schema or
   connector code, or could a future connector store descriptions/images anyway? Image
   licensing (e.g. Ticketmaster images) constrains storage and display.
7. SCRAPING LEGALITY. Assess ToS and UK Computer Misuse exposure for the HTML scrapers, and
   whether robots.txt is respected.
8. LLM-IN-THE-LOOP. If any normalisation, classification, or summarisation uses an LLM,
   assess prompt-injection risk from attacker-controlled event titles/descriptions and the
   need to validate/clamp model output.
```

---

## R5 — Documentation feasibility for AI-assisted development

```
You are a staff engineer assessing whether this documentation set is concrete enough to
build the platform using AI coding agents (Claude Code) without the agents guessing or
drifting between sessions. Read every file in docs/ and CLAUDE.md. Output findings using the
shared finding format (prefix DOC). Assessment only — do not write code.

Assess specifically:
1. MISSING CONTRACTS. Identify every place an agent would have to invent a contract: the
   RawEvent -> canonical-event normalisation mapping, the per-source taxonomy mapping, the
   fuzzy-match algorithm and its thresholds, expected API response shapes, and example
   payloads/fixtures per source. Each missing contract is a finding.
2. UNRESOLVED DECISIONS. ADR 0001 (frontend) is open. List exactly which docs and build
   tasks are blocked by it and where an agent would otherwise pick inconsistently across
   sessions.
3. RUNTIME AMBIGUITY. If the docs don't pin Node vs Deno (and an execution host), an agent
   will write code that does not deploy. Flag this as a documentation blocker.
4. CONSISTENCY. Check that field names, enum values, and table names match exactly across
   SPEC.md, DATA_MODEL.md, SCHEMA_v5.sql, and the connector interface. List every mismatch;
   drift causes agent hallucination.
5. COMPLETENESS FOR EXECUTION. Is there a defined testing strategy, error-handling and
   logging convention, and — critically — a definition of done / acceptance criteria per
   work item? Without these an agent cannot know when a task is complete.
6. SCORECARD. Rate each document as build-ready / needs-detail / placeholder, and for each
   give the single biggest ambiguity that would stall an agent.
7. RECOMMENDATIONS. Propose the minimum additions that would make the set build-ready (e.g.
   a glossary, an explicit non-goals list, per-source fixtures, per-module READMEs, a
   normalisation spec).
```

---

## R6 — Consolidation & triage into a JIRA backlog

```
You are a tech lead turning five expert reviews into an actionable plan. Inputs: the
findings produced by R1–R5 (paste them in, or read them if they were saved into docs/).
Do not re-review the project from scratch — work only from the findings plus docs/ for
context. Produce the following. Assessment/planning only — do not write code.

1. DEDUPLICATE. Merge findings that overlap across reviews (e.g. RLS appears in both the DB
   and security reviews; the runtime question appears in backend, connectors, and docs).
   Keep one canonical ticket each, cross-referencing the original IDs.
2. CRITICAL PATH. Identify the "must resolve before any code is written" set — the decisions
   that everything else depends on (expect: ADR 0001, the ingestion runtime/host decision,
   the Eventbrite viability spike, and the normalisation contract). State them first.
3. BACKLOG. Produce a single prioritised backlog as one Epic plus child tickets, ordered by
   build dependency, blockers first. For each ticket give: Summary, Issue type, Priority,
   Component, Labels, Description, Acceptance criteria, and Blocks/Blocked-by links.
4. CSV. Also emit a CSV block with columns: Summary, Issue type, Priority, Component, Labels,
   Description, Acceptance criteria, Blocks — for bulk import into JIRA.
5. JUDGEMENT CALL. End with a short, honest verdict: is the project ready to start building,
   ready to start building only the parts unblocked by the critical-path items, or not ready
   until specific decisions are made? Name them.
```