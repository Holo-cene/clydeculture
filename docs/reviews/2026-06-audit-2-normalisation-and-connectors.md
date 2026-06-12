# Audit 2 — Normalisation and Connectors

Review-only audit of normalisation, deduplication, connector, orchestration, and public-query code against the MVP data model identified in Audit 1. No production changes made.

---

## A. Metadata

- **Audit 1 file read:** `docs/reviews/2026-06-audit-1-data-model.md` (present, verified by preflight).
- **Audit 1 commit SHA:** `21a6a278d8c2ecd69b84bd64f8cd1904849dadfb`
- **Current commit SHA:** `21a6a278d8c2ecd69b84bd64f8cd1904849dadfb` — **matches Audit 1**.
- **Dirty-tree status:** dirty. Same `docs/prompts/` and `docs/tasks/` modifications/deletions as Audit 1, plus four untracked paths that are new since Audit 1: `docs/prompts/archive/`, `docs/tasks/archive/`, `docs/reviews/` (contains the Audit 1 report), and **`packages/core/src/architecture/`** — a single untracked file, `package-boundary.test.ts`, a deliberately red architecture test (see Section C). This is the only change inside `packages/` relative to Audit 1's observation; it is a test file, not production code.

**Files inspected**

- `packages/core/src/normalise/dbNormalise.ts` (324 lines, full read)
- `packages/core/src/normalise/normalise.ts` (268 lines, full read)
- `packages/core/src/dedupe/dedupe.ts` (16 lines, full read)
- `packages/core/src/ingest/orchestrate.ts` (258 lines, full read)
- `packages/core/src/ingest/sweep.ts` (58 lines, full read)
- `packages/core/src/architecture/package-boundary.test.ts` (84 lines, untracked)
- `packages/core/CLAUDE.md` (package-level agent rules)
- `packages/connectors/src/connector.ts`, `validate.ts` (full read)
- `packages/connectors/src/api/ticketmaster/fetch.ts`, `parse.ts`, `index.ts` (full read)
- `packages/shared/src/db/upsertExternalEvents.ts`, `publicQueries.ts` (full read)
- `packages/core/src/normalise/ticketmaster-fixture-e2e.integration.test.ts` (header + setup read, not run)
- SQL functions `normalise_title` / `compute_dedupe_key` in `supabase/migrations/20260531000000_schema_v5_initial.sql:677–705` and `20260603000000_cc_new_1_schema_corrections.sql:60–130`
- Seeds: `supabase/migrations/20260606000000_source_category_map_seed.sql`, `20260607000000_fix_ticketmaster_segment_ids.sql`, `supabase/seed.sql`
- Docs (claims vs code): `docs/NORMALISATION.md`, `docs/INGESTION.md`, `docs/CONNECTOR_GUIDE.md`, `docs/DEDUPLICATION.md`
- Read-only `git grep` sweeps for `process.env`, `fetch(`, `createClient`, `.from(`, dedupe-key symbols, and the field list from the audit prompt

**Tests/typechecks run**

Unit test suites were run for all three packages using the already-installed package-local vitest binaries (no `pnpm install`, no dependency changes):

- `@clydeculture/core` — **53 passed, 1 failed** (the failure is `src/architecture/package-boundary.test.ts`, red by design — Section C)
- `@clydeculture/connectors` — 98 passed
- `@clydeculture/shared` — 33 passed

Safety verification performed before running, per the audit prompt: (1) `git grep` confirmed `createClient` and `process.env` appear in no unit test, only in `ticketmaster-fixture-e2e.integration.test.ts`; (2) `packages/core/vitest.config.ts` excludes `**/*.integration.test.ts` from default runs; (3) the Ticketmaster connector tests stub `fetch` via `vi.stubGlobal('fetch', …)` (connector.test.ts:182, 250), so no network is reachable; (4) shared's DB tests use hand-rolled mock query builders, no Supabase client. The integration test (which requires a live local Supabase plus service-role env vars) was **not** run.

---

## B. Safety and scope note

Audit 0 does not exist (A1-011). Audit 2 proceeded because Audit 1 captured the necessary anchoring directly: pinned SHA, dirty-tree inventory, and the CLAUDE.md supersession record. The preflight re-verified all three; HEAD is unchanged, so Audit 1's evidence remains addressable by the same line references.

Minimal safety checks performed: preflight commands only (`pwd`, `git rev-parse HEAD`, `git status --short`, Audit 1 presence test); read-only greps from the approved list; fixture-only unit tests after the four-step safety inspection above. No ingestion runs, no external APIs, no Supabase reads or writes, no dependency installs, no commits, no edits other than this report.

Deliberately not checked (out of scope / later audits): RLS policy correctness and secrets handling (security audit, R4), Trigger.dev task wiring under `trigger/` (only the package boundary it implies), live Ticketmaster API behaviour (external research prohibited), Supabase data state, and the `docs/prompts`/`docs/tasks` reorganisation in the dirty tree.

**Instruction conflict note:** as in Audit 1, the project `CLAUDE.md` approval gate is superseded by this prompt for this report file only. Additionally, `packages/core/CLAUDE.md` is itself audit *subject matter* this pass: it asserts invariants ("No I/O", SQL parity, an API-wins merge function) that the code partially violates or does not implement — see A2-002 and A2-012.

---

## C. Core package purity

**`packages/core` violates its own no-I/O invariant, and the repo already knows.**

The invariant is stated in `packages/core/CLAUDE.md:9–10` ("This package must never import Supabase, fetch, fs, or any network/disk dependency. If you need data from the DB, pass it as an argument."). The violation is structural rather than import-level: `dbNormalise.ts` defines `NormaliseDbClient` (a structural Supabase-client interface with `.from()` and `.rpc()`, lines 17–30) and `normaliseExternalEventsForSource()` performs live table reads, RPC calls, and upserts against `sources`, `external_events`, `events`, `source_type_category_map`, and `event_types` (lines 134–148, 153, 168–172, 240–250, 261–283). `packages/core/src/index.ts` re-exports the client interface. No `@supabase/supabase-js` import exists in core production code — the coupling is duck-typed — but DB-backed orchestration is unambiguously living in core.

By contrast, `orchestrate.ts` and `sweep.ts` are **clean**: both are fully dependency-injected (callers pass `loadSources`, `upsertExternalEvents`, `persistIngestRuns`, a `clock`, etc.) and contain no client interfaces or table access. They belong in core under the current rules; `dbNormalise.ts` does not.

The untracked `packages/core/src/architecture/package-boundary.test.ts` codifies exactly this: it scans production sources for `.from('<table>')`, `client.rpc(`, and the `NormaliseDbClient` symbol, and currently **fails with four violations** (dbNormalise.ts three patterns, index.ts re-export). Its failure message proposes the remedy this audit independently arrives at: a new `packages/ingestion` that depends on core + shared and is imported by `trigger/`. The red test is a ready-made acceptance criterion for the move (see M-2).

One nuance: `dedupe.ts` imports `node:crypto` (line 1). That is not I/O and not a violation of the stated rule, but it pins core to Node-compatible runtimes; worth knowing if anything in core is ever evaluated in an edge/browser context. Recorded as an observation, not a finding.

Finding: **A2-002 (critical, per the prompt's calibration that package-boundary impurity is critical).**

---

## D. Raw → external → canonical normalisation contract

**The three layers exist, but each handoff narrows the funnel, and the narrowest point is the canonical write.**

- **`RawEvent`** (`packages/connectors/src/connector.ts:8–29`) is rich: start/end/doors, venue name, type guess, tags, price min/max, free flag, ticket URL + label, image, availability. Missing entirely: **`timeTba`**, **`isAllDay`**, and any series/festival hint. Datetimes are typed only as "ISO 8601" with no offset requirement.
- **`external_events`** (schema) can store everything `RawEvent` carries, plus `series_id_guess`, `venue_id_guess`, lifecycle fields. `upsertExternalEvents.ts` maps **all 17** `RawEvent` fields faithfully (lines 31–54). This is the healthiest joint in the pipeline.
- **`ExternalEventDraft`** (`normalise.ts:51–67`) drops to 9 content fields: no end/doors, no prices, no free flag, no availability, no tags.
- **The canonical write** (`eventRow`, `dbNormalise.ts:112–132`) writes title, slug, URLs, image, `start_at`, timezone, type, venue, source, confidence, visibility, dedupe key — and **none of**: `end_at`, `doors_at`, `is_all_day`, `time_tba`, `price_min/max`, `is_free`, `price_display`, `availability`, `festival_id`, `series_id`, tags. It also hardcodes `summary: null, description: null`.

There are additionally **two parallel canonical builders**: the live `eventRow` in `dbNormalise.ts` and the pure, tested `buildCanonicalEventDraft()` (`normalise.ts:206–268`), which nothing in the runtime path calls (dbNormalise does not import it). They already disagree — the draft carries `timeTba` and forces `visibility: 'draft'`; `eventRow` omits `time_tba` and can publish directly via `auto_publish`. Two builders for one row is a drift engine (A2-003).

Manual/CSV-style sources **could** use the same contract today: a manual connector emitting `RawEvent`s with content-hash `external_id`s would flow through `upsertExternalEvents` unchanged, confirming Audit 1 Section F's recommendation. The blocker is not the contract shape but the canonical write dropping the fields grassroots events need most (free/price).

### Field preservation table

| Concept | RawEvent | external_events | ExternalEventDraft | canonical events | Written by normalisation? | Risk | A1 link |
|---|---|---|---|---|---|---|---|
| title | yes | yes | yes | yes | yes (trimmed, 500-cap) | low | — |
| start time | yes (offset not enforced) | yes | yes | yes | yes | naive-datetime hazard | A1-006 |
| end time | yes | yes | **no** | yes | **no** | exhibitions/ranges unusable | A1-004/005 |
| doors time | yes | yes | **no** | yes | **no** | doors/show UX lost | A1-005/007 |
| timezone | no (implied) | no column | no | yes | yes (source config or default) | low | — |
| all-day | **no** | no column | no | yes (`is_all_day`) | **no** | flag unreachable from ingestion | A1-004 |
| time TBA | **no** | no column | no | yes (`time_tba`) | **no** (hardcoded false in confidence input) | TBA events masquerade as midnight events | A1-003 |
| venue | name yes | name + id guess | id only | id | yes (resolve/auto-create RPC) | ok | — |
| source URL | yes (required) | yes | yes | yes | yes | ok (link-first holds) | — |
| ticket URL | yes | yes | yes | yes | yes | ok | — |
| image URL | yes | yes | yes | yes | yes (https-validated) | ok | — |
| price / free | yes | yes | **no** | yes | **no** | free/PWYC — the grassroots load-bearing fact — never reaches the site | A1-005/008 |
| availability/status | yes (raw upstream code) | yes | **no** | yes (canonical enum) | **no**; no mapping exists | cancellations/sold-out invisible | A1-005 |
| category/event type | guess yes | guess yes | guess yes | id yes | yes (map → fallback `other`) | fallback flags review, ok | — |
| tags | yes | yes | **no** | via `event_tags` | **no** | genre data dead-ends in external layer | A1-005 |
| festival | no | no | no | yes (`festival_id`) | **no** | detection unbuilt | A1-009 |
| series/recurrence | no | `series_id_guess` | **no** | yes (`series_id`) | **no** | A1-002 confirmed at pipeline level | A1-002 |
| external source identity | yes | yes (`uq_external_source_id`) | sourceId+externalId | `primary_source_id` + back-links | partially (see Section E) | identity never used for updates | A1-001 |

---

## E. Canonical identity and dedupe write path

This section validates and **sharpens** A1-001. The implemented behaviour is worse than the fork-on-reschedule failure Audit 1 described, in an instructive way.

The flow in `normaliseExternalEventsForSource()`:

1. `getUnlinkedExternalEvents()` selects only rows where **`event_id IS NULL`** (`dbNormalise.ts:168–172`).
2. Each is upserted into `events` with `onConflict: 'dedupe_key'` (line 136).
3. The new canonical id is written back to `external_events.event_id` (lines 145–148).

Consequence: **once linked, an external event is never normalised again.** A later connector run that updates the external row — new start time, price change, `availability_guess = 'cancelled'`, title correction — refreshes `external_events`, and then nothing happens. The canonical event is not updated, not forked, not flagged. It is permanently frozen at first-ingest state. The A1-001 reschedule fork only occurs in the narrower case where `event_id` is somehow reset to null; in the code as written, the dominant failure is **silent permanent staleness** of every published event.

So, to the prompt's questions directly:

- *Is `external_events.event_id` used before the dedupe upsert?* Only as a "not yet processed" filter — never to locate and update an existing canonical row.
- *Does `dedupe_key` act as canonical identity?* Yes, but only at creation time; after linking, no write path of any kind exists.
- *Reschedule / time correction / title correction / venue correction?* None propagate. (`docs/NORMALISATION.md` §reschedule, ~line 390, describes in-place updates of `dedupe_key`/`start_at`/`end_at` plus `availability='rescheduled'` — none of it implemented.)
- *Updated or duplicated?* Neither: ignored.
- *Should source identity be primary and dedupe secondary?* Yes. The data already supports it — `(source_id, external_id)` → `event_id` is a durable identity chain; `dedupe_key` should only arbitrate first-time linking across sources (and even then, see A1-007).
- *Smallest safe change:* re-select **all** non-deleted external events for the source (not just unlinked); for rows with `event_id`, update the existing canonical row in place by id and recompute `dedupe_key` as a stored attribute (not the conflict target); keep the dedupe upsert only for the `event_id IS NULL` path. No schema change strictly required for step one; the unique index on `dedupe_key` becomes the next constraint to address when two linked events legitimately converge on one key (that is the merge problem, A1-007, separable).

Secondary identity defect found in the same function: the dedupe key is derived from `externalEvent.title ?? title` (line 131) — the **raw, untrimmed** title — while `normalised_title` and `slug` use the trimmed, 500-char-sliced `title` (line 78). For titles with leading/trailing whitespace beyond what `normaliseTitle` strips, or over 500 chars, the TS-computed key diverges from what SQL `compute_dedupe_key(venue_id, start_at, title)` would compute from the *stored* title column. The system can disagree with itself about its own keys (folded into A2-007).

Findings: **A2-001 (critical)**, contributes to **A2-007**.

---

## F. Dedupe parity and time parsing

Comparing TS `deriveDedupeKey`/`normaliseTitle` against SQL `compute_dedupe_key`/`normalise_title` (post-BE-09):

- **Hour bucket:** parity is good for offset-qualified inputs. SQL truncates `at time zone 'UTC'` (20260603:73–89); TS uses `getUTC*` accessors. ✔
- **Offset-less datetimes:** TS `new Date(startAt)` (`dedupe.ts:7`) interprets `2026-06-12T19:00:00` in the **runtime's local zone**. On a UTC server vs a BST laptop vs a Trigger.dev worker, the same string yields different hour buckets. SQL would interpret the same literal via the DB timezone. Nothing rejects such strings: `validate.ts` checks only `externalUrl` (lines 13–22); the contract comment says merely "ISO 8601" (`connector.ts:14`); `docs/CONNECTOR_GUIDE.md:107` repeats it without an offset requirement. The Ticketmaster parser currently always emits Z-suffixed values (`parse.ts:146` and passthrough of `dateTime`), so the hazard is latent until the second connector. Confirms A1-006.
- **Title normalisation order:** SQL strips-then-lowercases (`v5:680–683`); TS lowercases-then-strips (`normalise.ts:92–96`). Equivalent for virtually all input because both character classes are case-insensitive; a residual Unicode edge exists where lowercasing changes character class (e.g. Turkish İ lowercases to i + combining dot: TS strips the combining mark, SQL retains it). Cosmetic-rare, but it means the "must match exactly" contract in `packages/core/CLAUDE.md:11–13` is not literally provable without a parity fixture suite.
- **Character classes:** SQL POSIX `[[:alnum:]]` vs TS `\p{L}\p{N}` — `packages/core/CLAUDE.md:45–48` asserts the PG class is Unicode-aware; true under UTF-8, but it is environment/locale-sensitive in a way the TS class is not. A1-006's recommendation (one authority, or a cross-checked fixture corpus) stands.
- **Self-parity:** the untrimmed-title key derivation noted in Section E.
- **Doors-vs-show buckets:** unchanged from A1-007; the hour bucket plus the absence of any trigram/merge-candidate pass in code (the secondary pass exists only in `docs/DEDUPLICATION.md:58–90`) means cross-source matching is exact-key-or-nothing today.

**Exact tests needed (not implemented):** (1) parity corpus — identical (venueId, startAt, title) triples through `deriveDedupeKey` and `compute_dedupe_key` covering ASCII, accented (é/ü/ñ), Turkish İ/ı, CJK, emoji, >500-char titles, whitespace padding; (2) a `deriveDedupeKey` test asserting a thrown error (or documented behaviour) for offset-less input; (3) a `validateIngestResult` test asserting rejection of `startAt` without offset; (4) a dbNormalise test asserting the key is computed from the same trimmed/sliced title that is stored.

Finding: **A2-007 (medium)**.

---

## G. Connector contract and validation

- **Is `RawEvent` rich enough for MVP?** Nearly. The 17 fields cover the canonical schema's content surface except `timeTba`, `isAllDay`, and series/festival hints. The first two are required for correctness, not enrichment — without `timeTba`, the Ticketmaster parser actively *destroys* information (Section H). Finding A2-005.
- **Does validation catch malformed/missing fields?** No. `validateIngestResult` validates exactly one thing: `externalUrl` is https (`validate.ts:13–22`). No datetime shape check, no title-presence check (downstream `dbNormalise` skips empty titles, but at the cost of a DB round-trip per skip), no price sanity (negative, min>max), no availability vocabulary check. Optional fields are preserved (the filter copies items whole) — preservation is fine; coverage is the gap.
- **`parsedCount`/`fetchedCount` semantics:** mostly coherent but redefined at each layer. The TM connector sets `fetchedCount` = events received across pages and `parsedCount` = items surviving parse (index.ts:112, 153); `validateIngestResult` then **overwrites** `parsedCount` to the post-validation count (validate.ts:22) — reasonable, but nothing composes them: the connector's `run()` does not call `validateIngestResult`, and `orchestrate.ts` does not either (grep: no call site outside tests). Validation exists but is dead code in the runtime path. INFERENCE from absence of call sites; the glue under `trigger/` was not in scope, but core's `runEnabledConnectors` consumes `connector.run()` output directly.
- **Are connector failures isolated?** At fetch level, yes — `runEnabledConnectors` try/catches each source and continues (orchestrate.ts:116–143), and the TM connector additionally degrades per-window. At **normalisation** level, no — see A2-004: `runSweepIntegration` normalises sources in a plain loop (sweep.ts:51–53) with no try/catch, and `dbNormalise` line 140 dereferences a possibly-null upsert result (`canonicalEvent['id']` after ignoring `error`), so one bad event (most plausibly a `slug` unique-constraint collision: two different events, same title, same date, different venues — the schema's documented "-2" suffix convention, v5:272–273, is implemented nowhere) throws a TypeError that aborts normalisation for that source **and every source after it**, and skips `persistIngestAlerts` entirely. The connector-isolation invariant stated in `connector.ts:2–3` holds for fetching and breaks at normalisation.
- **Could CSV/iCal/JSON-LD/manual sources emit the current `RawEvent`?** Yes, comfortably — stable `externalId` via content hash, `externalUrl` required (a genuine constraint for sources without per-event pages; the guide addresses this at CONNECTOR_GUIDE.md:187), everything else optional. The contract is not the blocker; the canonical write is.

Findings: **A2-004 (high)**, **A2-005 (high)**, contributes to **A2-013 (low)**.

---

## H. Ticketmaster connector assessment

Code and fixtures only; no external API documentation consulted.

- **Payload → RawEvent mapping** (`parse.ts:186–240`): id/name/url guarded by a type guard; title trimmed and 500-capped (matching dbNormalise's cap — good); ticket URL = event URL with label 'Buy on Ticketmaster'; venue from first embedded venue; image selection prefers 16:9 ≥640px https with sensible fallback; price min/max from the first `priceRanges` entry with `isFreeGuess = (min === 0)`; genre name → single-element `tagsGuess`; segment id lowercased → `eventTypeGuess`.
- **Segment/category mapping:** parser emits lowercased segment ids; the seed's transposed ids were corrected by migration 20260607, and the seeded five segments (music, club, comedy, film, arts) match the parser's output format. Theatre remains unmapped per the seed comments — those events will fall back to `other` + `needs_review`, which is the designed behaviour, but at Ticketmaster volume it may flood review (observation, no new finding; A1-discussed).
- **`doorOpenTime`:** passed through **verbatim** (`parse.ts:212–213`) with no shape validation or timezone conversion, unlike `startAt`, which gets careful local→UTC conversion (`localDateTimeToUtcIso`, lines 128–147, with a correct DST double-resolution step — genuinely well done). The fixture's value is Z-qualified, so tests pass; if the live field is ever local-time-shaped, it lands in a `timestamptz` column via whatever the DB session assumes. INFERENCE: live format unverified (external research out of scope). Currently harmless because doors never reaches canonical anyway (A2-003).
- **Status/availability:** `dates.status.code` → `availabilityGuess` raw (line 233–234). The mapping table to the canonical enum (`onsale → on_sale`, `cancelled → cancelled`, etc.) exists only in `docs/NORMALISATION.md:62–87`. Unimplemented; canonical `availability` is never written (A2-006/A2-013).
- **Dates/timezones/TBA:** `dateTime` passthrough, else localDate+localTime converted via event timezone (default Europe/London). **`timeTBA: true` + localDate → midnight local converted to UTC with no flag** (lines 160–162): a TBA event becomes indistinguishable from a genuine midnight event, contradicting `docs/NORMALISATION.md:108–117`, which prescribes the midnight placeholder **plus `time_tba = true` plus needs_review** — the flag half is impossible because `RawEvent` has no field for it. `dateTBA`/`dateTBD`-only events are skipped with good per-event error strings via `describeTicketmasterDateSkip`, which `index.ts:117–120` does wire up. All-day: no handling (TM doesn't model it; fine).
- **Prices:** first price range only; no currency captured (schema has no currency column either — consistent for a Glasgow-only GBP product, but undocumented).
- **Multi-date/spanning events:** nothing — one `RawEvent` per API event, start only. Spanning events arrive as their start instant. Consistent with one-row-per-occurrence (A1-002) since TM emits per-occurrence, but no `end_at` is even attempted (`dates` end fields unparsed).
- **Pagination/windows** (`index.ts`): five 14-day windows × ≤5 pages × 200, 250ms sleeps, per-window try/catch, truncation warnings as non-fatal errors. Solid, testable (deterministic `startDate`), and honest about caps. `export const ticketmasterConnector` reads `process.env['TICKETMASTER_API_KEY'] ?? ''` at module load (line 158–159) — an empty-key connector that would 401 at runtime rather than fail fast; minor, noted in A2-013.
- **Fixture coverage:** 98 connector tests pass; `connector.test.ts` (857 lines) covers pagination, window math, error accumulation with stubbed fetch; `parse.test.ts` (395 lines) pins fixture-derived field values (the e2e integration test reuses them as constants). Red/green status: all green.
- **Fields exposed then dropped downstream:** end (not parsed), doors, tags, prices, free, availability — i.e. most of what makes a listing useful — all reach `external_events` and stop there (Section D).
- **`fetch.ts` boundary:** network code stays in `packages/connectors`; nothing in core fetches. ✔ (`fetch.ts:35–67` is also currently redundant — `index.ts` reimplements paged fetching inline rather than calling `fetchTicketmasterPage`; duplication noted in A2-013.)

---

## I. Ingestion orchestration and removal semantics

- **Run lifecycle:** `runEnabledConnectors` builds `IngestRunDraft`s with started/finished timestamps from an injected clock; `runSweepIntegration` persists runs, then normalises, then persists alerts. Status mapping: `parsedCount <= 0 → 'failed'`, errors>0 → `'partial'`, else `'success'` (orchestrate.ts:171–175). **A successful fetch genuinely returning zero events is recorded as a failed run** — a quiet fortnight, a tightly-filtered window, or a niche source's off-season all become failures, polluting `sources.status` decisions and the alert baseline (zero-parsed runs are excluded from the median as "failed", so the baseline never learns that zero can be normal). Finding A2-009.
- **Connector isolation:** good at fetch (per-source try/catch, missing-connector handled as failed run); broken at normalisation (Section G / A2-004).
- **`ingest_runs` counters:** fetched/parsed/upserted/errors populated; **`created_events_count` and `updated_events_count` exist in the schema (v5:486–487) and are never written** — `IngestRunDraft` has no such fields. Until A2-001 is fixed there is nothing to count (no updates ever happen), but the columns' emptiness will read as "0 events created" forever. Folded into A2-006.
- **`upserted_external_count` semantics:** orchestrate expects the injected `upsertExternalEvents` to return `{ upserted_count }` (orchestrate.ts:79–81), but `packages/shared`'s `upsertExternalEvents` returns `void` **and ignores the Supabase error entirely** (upsertExternalEvents.ts:24–57). Whatever glue adapts one to the other must invent a count and swallow failures; a failed external upsert would be recorded as a successful run with N items. INFERENCE for the glue (trigger/ not inspected); the shared function's error-swallowing is direct evidence. Part of A2-006.
- **`last_seen_at`:** refreshed on every upsert, `is_deleted` reset to false on re-sighting (upsertExternalEvents.ts:29, 37–38). Correct half of the lifecycle.
- **Removal/disappearance:** **the other half does not exist.** No code anywhere sets `is_deleted = true` (grep: the only write is the `false` literal). The tier-threshold missed-run detection, the broken-source bulk-removal safeguard, and the cancelled-vs-deleted distinction are specified in detail in `docs/INGESTION.md:123–145` and implemented nowhere. A gig cancelled and removed upstream stays published indefinitely (doubly so, since `availability` is never written either). For a "what's on" product, advertising events that no longer exist is a direct trust failure. Finding A2-006 (high).
- **Alert types:** orchestrate emits `'cold_start_zero'` (orchestrate.ts:2, 203–213); the `ingest_alerts` CHECK allows only `('count_drop', 'parse_failure', 'timeout', 'manual')` (v5:501–502). **Persisting a cold-start alert violates the constraint** — the first-ever failing source would make `persistIngestAlerts` throw at the end of every sweep. Finding A2-008.
- **Auto-publish vs gates:** `eventRow` publishes only when `confidence.score >= 60 && !needsReview && auto_publish` (dbNormalise.ts:107–110), which is consistent with the public-query `gte('confidence', 60)` boundary and the RLS published-only policy. Internally coherent. The fragility is that the threshold lives in three places (TS write path, TS read path, RLS from the A3 migration) with no shared constant — drift risk, noted in A2-013. Tier-1 + resolved venue + mapped type + URL = 75 with auto_publish ⇒ events go live with **no human review**, which is a deliberate config choice (`auto_publish` defaults off) rather than a defect.

---

## J. Public query readiness

`publicQueries.ts` validates A1-004 at the read layer:

- **Future listings / today / this week:** `dateRange` filters apply `gte/lt` on **`start_at` only** (lines 86–90). A query without a range returns *everything published*, including up to seven days of past events (archival flips visibility only after `coalesce(end_at, start_at) < now() - 7 days`). There is no future-only default.
- **Running exhibitions / date ranges:** **invisible.** An exhibition that opened in May does not match a June "today" window because only `start_at` is compared; `end_at` is never consulted in any query. This is the equal-weight problem in executable form: the arts-exhibition category effectively exists for one day per show. (Schema-side fix is Audit 1 H-3; the query helper must also change.)
- **All-day events:** no special handling; inherits the encoding ambiguity (A1-004).
- **Day boundaries:** `getTonightDateRange` and `getThisWeekendDateRange` compute boundaries in **UTC** (`setUTCHours`, `getUTCDay`, lines 212–244). During BST, "tonight" runs to 00:59 local and the weekend starts/ends an hour late; events between midnight and 1am local (i.e., a meaningful share of Glasgow club nights) fall on the wrong side of every boundary. The `timezone` column exists precisely to avoid this and is unused here.
- **Category filters:** slug → id resolution with empty-result short-circuit; fine. Hierarchical tag filtering (tags with `parent_event_type_id`) is not implemented — category filter is `event_type_id` only; the "sculpture counts as Arts/Exhibition" behaviour the tag hierarchy was built for has no query support yet. Minor, A2-013.
- **Visibility/confidence gates:** `visibility = 'published'` + `confidence >= 60` applied consistently via `applyPublicEventBoundary`; matches RLS direction. ✔
- **Venue/source attribution:** `PUBLIC_EVENT_SELECT` joins `event_types`, `venues`, `festivals` — **not `sources`** (lines 39–44). A link-first card can render the outbound `source_url`/`ticket_url`(+label) from the event row itself, so the core CTA works; but "via Ticketmaster" / "Listed by <source>" attribution by *name* requires a sources join or denormalised name that is not selected. Availability badge data is selected (`*`) but never populated (A2-006).
- **Search:** `.or()` across title/normalised_title/ticket_url_label plus venue-name subquery, with `%_,()` stripped from the term (line 178) — sensible PostgREST-injection hygiene.
- **Link-first cards overall:** workable for title/time/venue/image/CTA today; broken for price/free, availability, doors, end — all of which die in the pipeline before the read layer (Section D).

Finding: **A2-010 (medium)**.

---

## K. Repo-evidenced source/connector inventory

Only sources evidenced in code, seeds/migrations, or fixtures. (Skiddle, Eventbrite, venue scrapers etc. appear solely in docs/tasks and are excluded per the audit rules.)

| Source | Evidence | Implementation status | Connector type | Fields supported | Fields lost | Risks | Action |
|---|---|---|---|---|---|---|---|
| Ticketmaster | `packages/connectors/src/api/ticketmaster/*` (fetch/parse/index, 857+395-line test suites, `fixtures/response.json`); `sources` seed row (20260606, `enabled=false`); category map seed + 20260607 id fix | Connector implemented and green in tests; source row disabled pending E1 preflight; never run live (no evidence of live runs in repo) | api | external id/url, title, startAt (UTC-normalised incl. DST handling), doors (verbatim), venue name, segment→type, genre→tag, price min/max, free, ticket URL+label, image, availability code | timeTBA flag (destroyed at parse), end time (unparsed), everything beyond external_events per Section D | TBA-as-midnight; raw availability codes unmapped; module-load env key; theatre segment unmapped → review flood | Wire `timeTba` (M-4); add status mapping (M-3); enable only after A2-001/A2-004 fixes |
| Clyde Culture Demo Data | `supabase/seed.sql` (source `00000000-0600-…001`, `manual`, tier 1, `auto_publish: true`, `enabled=false`; synthetic venues/events) | Seed data only — no connector, events inserted directly by seed | manual (seed) | n/a (direct canonical inserts) | n/a | Demo events bypass external_events entirely — same raw-layer bypass pattern as A1-008; `auto_publish: true` on a tier-1 manual source is a footgun template if copied for real manual sources | Keep disabled; do not copy its config for production manual sources |

Two sources total. The MVP currently has **one** real ingestion path, and it is disabled.

---

## L. Findings

| ID | Severity | Effort | A1 links | Finding |
|---|---|---|---|---|
| A2-001 | **Critical** | M | A1-001 | Linked external events are never re-normalised; canonical events are frozen at first ingest |
| A2-002 | **Critical** | M | — | `packages/core` purity violated by DB-backed `dbNormalise.ts`; red boundary test already present |
| A2-003 | High | M | A1-005 | Canonical write drops product-critical fields; two divergent canonical builders coexist |
| A2-004 | High | S | — | No error handling on the canonical upsert; one failure aborts normalisation for all remaining sources and skips alert persistence |
| A2-005 | High | S | A1-003 | `RawEvent` lacks `timeTba`/`isAllDay`; TM parser converts TBA to silent midnight events |
| A2-006 | High | M | A1-005 | Removal/cancellation lifecycle unimplemented: `is_deleted` never set true, availability never mapped/written, created/updated counters never populated, external upsert swallows errors and returns no count |
| A2-007 | Medium | S | A1-006 | Dedupe parity hazards: local-zone parsing of offset-less datetimes, untrimmed-title key vs stored title, lower/strip order divergence, zero datetime validation |
| A2-008 | Medium | S | — | `cold_start_zero` alert type violates the `ingest_alerts` CHECK constraint; alert persistence will throw |
| A2-009 | Medium | S | — | Zero-parsed successful runs recorded as `failed`; false failures distort source health and alert baselines |
| A2-010 | Medium | M | A1-004 | Public queries: `start_at`-only ranges hide running exhibitions; UTC day boundaries wrong under BST; no sources join for named attribution |
| A2-011 | Medium | S | A1-005 | Three hand-maintained definitions of the raw-event shape (`connectors.RawEvent`, `core.orchestrate.RawEvent`, `shared.ExternalEventInput`) with no compile-time linkage |
| A2-012 | Medium | S | A1-011 | Docs and `packages/core/CLAUDE.md` assert unimplemented behaviour as current (merge function, festival detection, removal detection, availability mapping, time_tba convention, slug `-2` collision rule) — hazardous for agent-constrained development |
| A2-013 | Low | S | — | Sundry: doors/availability pass-through unvalidated; `validateIngestResult` uncalled in runtime path; `fetchTicketmasterPage` dead code; module-load env read; confidence threshold tripled across layers; tag-hierarchy filtering unimplemented |

**A2-001 — Canonical events frozen at first ingest** · Critical · M · links A1-001
- **Evidence:** `dbNormalise.ts:168–172` (`.is('event_id', null)` filter), 134–148 (upsert + write-back). No code path updates an `events` row by id after linking; `docs/NORMALISATION.md` ~390 documents in-place reschedule updates that do not exist.
- **Impact:** every upstream change after first sight — reschedules, cancellations, price/title/image corrections — is recorded in `external_events` and never reaches the site. A1-001's fork-on-reschedule is the *recovery* failure mode; the everyday mode is permanent staleness of all published events. Blocks safe MVP ingestion outright.
- **Recommended action:** identity-first normalisation: process all non-deleted external rows per source; update canonical by `event_id` when linked (recomputing `dedupe_key` as data, not as conflict target); reserve the dedupe upsert for unlinked rows.
- **First test:** fixture: ingest event E (start 19:00) → normalise → capture canonical id; mutate external row start to 20:00 → normalise → assert same canonical id, `start_at = 20:00`, exactly one `events` row.

**A2-002 — Core purity violation** · Critical · M
- **Evidence:** `dbNormalise.ts:17–30` (`NormaliseDbClient`), table/RPC access at 134–148/153/168–172/240–250/261–283; `core/src/index.ts` re-export; red test `packages/core/src/architecture/package-boundary.test.ts` failing with 4 violations (run output in Section A); invariant at `packages/core/CLAUDE.md:9–10`.
- **Impact:** core is not testable without a DB stub of Supabase's builder shape; the purity contract every other rule leans on (deterministic, no-setup tests) is false; the SQL-parity strategy ("tests are the contract") is undermined when the package itself hides I/O.
- **Recommended action:** move `dbNormalise.ts` (and the integration test) to a new `packages/ingestion` depending on core + shared, exactly as the red test's failure message proposes; keep `orchestrate`/`sweep` in core (already pure/DI).
- **First test:** already written — make `package-boundary.test.ts` pass.

**A2-003 — Field loss + dual canonical builders** · High · M · links A1-005
- **Evidence:** field table, Section D; `eventRow` (`dbNormalise.ts:112–132`) vs `buildCanonicalEventDraft` (`normalise.ts:206–268`, tested in `canonical.test.ts`, no runtime call site).
- **Impact:** free/price, availability, doors, end, tags unreachable from ingestion; two builders guarantee future drift (already differ on `time_tba` and visibility).
- **Recommended action:** single canonical-row builder (pure, in core) consumed by the (relocated) DB writer; extend it to the full field set in the same change as the contract definition (A1 H-6).
- **First test:** golden-master: given a fully-populated `ExternalEventRow`, builder output contains `end_at`, `doors_at`, `price_min/max`, `is_free`, `availability`, `time_tba` with correct values.

**A2-004 — Upsert errors crash multi-source normalisation** · High · S
- **Evidence:** `dbNormalise.ts:134–140` ignores `error`, dereferences possibly-null `canonicalEvent`; `sweep.ts:51–53` bare loop, no try/catch; slug collision precondition: unique `events.slug` (v5:271) + `slugFor()` (dbNormalise.ts:293–295) + unimplemented `-2` convention (v5:272–273) ⇒ two same-title same-date events at different venues collide.
- **Impact:** one malformed/colliding event silently kills normalisation for its source and all subsequent sources that run, and `persistIngestAlerts` never executes — the monitoring designed to catch exactly this is the first casualty.
- **Recommended action:** per-event try/catch with skip-and-record (the `markNormalisationSkip` mechanism already exists); per-source try/catch in the sweep loop; check `error` before dereferencing.
- **First test:** mock client whose `events` upsert rejects for event 2 of 3 → assert events 1 and 3 normalised, skip recorded for 2, and a second source still normalises.

**A2-005 — TBA destroyed at parse; contract gap** · High · S · links A1-003
- **Evidence:** `parse.ts:160–162` (timeTBA → midnight, no flag); `connector.ts:8–29` (no `timeTba`/`isAllDay`); `dbNormalise.ts:99` hardcodes `timeTba: false`; convention documented at `docs/NORMALISATION.md:108–117`.
- **Impact:** TBA gigs display as 00:00 events, sort to the top of their day, earn the dedupe midnight bucket (colliding with each other per venue/day), and skip the `needs_review`/confidence penalties the docs prescribe.
- **Recommended action:** add `timeTba?: boolean` (and `isAllDay?: boolean`) to `RawEvent` → `ExternalEventInput` → external_events columns already exist? (`time_tba` exists on `events` only; external layer needs a column or raw-derived flag — smallest: carry in the upsert to a new `time_tba_guess` column, or defer column and thread through normalisation input). Set it in `ticketmasterStartAt`'s TBA branch.
- **First test:** parse fixture event with `timeTBA: true` + localDate → `RawEvent.timeTba === true` and startAt at local midnight UTC-converted.

**A2-006 — Removal/cancellation lifecycle unimplemented** · High · M · links A1-005
- **Evidence:** `is_deleted` written only as `false` (upsertExternalEvents.ts:38; grep shows no `true` write); no missed-run logic in orchestrate/sweep; `docs/INGESTION.md:123–145` specifies the absent behaviour; availability mapping table `docs/NORMALISATION.md:62–87` unimplemented, `availability` never in `eventRow`; `created/updated_events_count` (v5:486–487) absent from `IngestRunDraft`; shared upsert returns void and ignores `error` while orchestrate expects `{upserted_count}` (orchestrate.ts:79–81).
- **Impact:** cancelled/removed events stay published indefinitely with no badge — the single most user-visible trust failure a listings site can have; run metrics under-report; external upsert failures vanish.
- **Recommended action:** implement in order: (1) availability mapping into canonical writes (depends on A2-001/003); (2) missed-run `is_deleted` per INGESTION.md thresholds; (3) propagate deletion to canonical (`availability='cancelled'` or visibility change per doc); (4) return counts/errors from shared upsert.
- **First test:** pure function `availabilityFromGuess('cancelled') === 'cancelled'`, `('onsale') === 'on_sale'`, unknown → null; then sweep-level: source returns events minus E for 3 consecutive successful runs → E's external row `is_deleted = true`.

**A2-007 — Dedupe parity hazards** · Medium · S · links A1-006
- **Evidence:** `dedupe.ts:7` local-zone `new Date`; `dbNormalise.ts:131` raw-title key vs line 78 trimmed/sliced stored title; SQL strip-then-lower (v5:680–683) vs TS lower-then-strip (normalise.ts:92–96); `validate.ts` validates no datetimes.
- **Impact:** environment-dependent and self-inconsistent keys; latent until a second connector or a naive datetime, then silent duplicates.
- **Recommended action / first test:** Section F's four tests; enforce offset-qualified datetimes in `validateIngestResult`; derive the key from the stored title value.

**A2-008 — Alert type violates DB CHECK** · Medium · S
- **Evidence:** `orchestrate.ts:2` (`AlertType = 'count_drop' | 'cold_start_zero'`) vs `ingest_alerts` CHECK (v5:501–502: count_drop, parse_failure, timeout, manual).
- **Impact:** first cold-start alert makes `persistIngestAlerts` throw every sweep until resolved — and via A2-004's missing try/catch, that exception propagates out of `runSweepIntegration`.
- **Recommended action:** align one side (migration adding `cold_start_zero`, or rename to `manual` with message). **First test:** type-level/fixture test asserting every `AlertType` member is in the schema's allowed list (encode the list in a shared enum).

**A2-009 — Zero-parsed success recorded as failure** · Medium · S
- **Evidence:** `statusForResult` (orchestrate.ts:171–175).
- **Impact:** quiet-but-healthy runs poison `sources` health and the count-drop median (zero runs excluded as failed, so genuine collapses to zero never alert as count_drop, only as repeated "failures").
- **Recommended action:** `failed` only when errors prevented completion; zero-with-no-errors → `success`, allowing the count-drop alert to do its job. **First test:** `IngestResult{fetched:0, parsed:0, errors:[]}` → status `success` + count_drop alert when median > 0.

**A2-010 — Public query gaps** · Medium · M · links A1-004
- **Evidence:** `publicQueries.ts:86–90` (start_at-only), 39–44 (no sources join), 212–244 (UTC boundaries).
- **Impact:** running exhibitions invisible mid-run; BST off-by-one-hour day windows; no named source attribution.
- **Recommended action:** range overlap predicate using `end_at` fallback (pairs with A1 H-3 index); Europe/London boundary computation; add `sources(name,slug)` to the select.
- **First test:** mock builder asserting the today-query includes an event with `start_at` in May and `end_at` in July.

**A2-011 — Triple raw-event definitions** · Medium · S · links A1-005
- **Evidence:** `connectors/src/connector.ts:8–29` (17 fields), `core/src/ingest/orchestrate.ts:23–29` (5 fields), `shared/src/db/upsertExternalEvents.ts:4–22` (17 fields, comment "structurally compatible").
- **Impact:** structural typing keeps it compiling while letting the shapes drift; core's 5-field view also misleads readers into thinking optional fields are dropped at orchestration.
- **Recommended action:** single exported contract (natural home: `shared`), imported by connectors and core. **First test:** type-assertion test (`expectTypeOf<RawEvent>().toMatchTypeOf<ExternalEventInput>()` both ways).

**A2-012 — Docs assert unimplemented behaviour** · Medium · S · links A1-011
- **Evidence:** `packages/core/CLAUDE.md:14–15, 57–67, 73–77` lists `mergeExternalEventIntoCanonicalEvent()`, `detectFestival()`/`src/festivals/festivals.ts`, and `dedupe.test.ts` merge coverage — none exist (grep + test-file inventory); `docs/NORMALISATION.md` reschedule/availability/time_tba sections; `docs/INGESTION.md` removal detection; `docs/DEDUPLICATION.md` trigram secondary pass and doors-show merge protections; slug `-2` convention (v5:272–273).
- **Impact:** in a repo that deliberately uses CLAUDE.md files to constrain agent behaviour, specs written in the present tense are read by agents as ground truth; the next session may build on functions that don't exist or skip work believing it done.
- **Recommended action:** sweep these docs adding explicit status markers (implemented / specified-not-built), or move unbuilt behaviour into task files. **First test:** n/a (documentation) — acceptance is the corrected files.

**A2-013 — Sundry small defects** · Low · S
- **Evidence:** doors/availability verbatim pass-through (`parse.ts:212–213, 233–234`); `validateIngestResult` has no runtime call site (grep); `fetchTicketmasterPage` unused by the connector (`index.ts` reimplements paging); `process.env` read at module load (`index.ts:158–159`); confidence 60 hardcoded in dbNormalise.ts:108, publicQueries.ts:53, and the A3 RLS migration; tag-hierarchy filtering absent from public queries.
- **Impact:** individually minor; collectively friction.
- **Recommended action:** fold opportunistically into the larger tasks above.

---

## M. Technical next-step candidates

All local, test-first, no external research, no Audit 0 dependency.

**M-1. Identity-first canonical updates** *(A1-001, A2-001, A2-003 partial)*
- **Goal:** linked external events propagate changes to their canonical event; dedupe upsert reserved for first link.
- **Files:** `packages/core/src/normalise/dbNormalise.ts` (or its new home per M-2), `dbNormalise.test.ts`.
- **First test:** the reschedule fixture in A2-001 above (same id, updated start_at, single row).
- **Smallest implementation:** widen the select to all non-deleted rows for the source; branch on `event_id` null/non-null; non-null path = `update … eq('id', event_id)` including recomputed `dedupe_key`.
- **Safe command:** `./node_modules/.bin/vitest run src/normalise/dbNormalise.test.ts` (in packages/core; mock client, no I/O).
- **Acceptance:** new tests green; existing 53 stay green; no schema change required.
- **Risk:** low — mock-driven; the dedupe-key unique index can reject an update if a reschedule collides with an existing key (legitimate merge case): handle by catching and recording a merge-candidate skip, deferring real merges (A1-007).

**M-2. Package boundary: extract ingestion layer** *(A2-002)*
- **Goal:** `package-boundary.test.ts` green.
- **Files:** new `packages/ingestion/` (package.json, tsconfig, vitest config), move `dbNormalise.ts` + its tests + the integration test; update `core/src/index.ts`, `trigger/` imports.
- **First test:** already exists (the red test).
- **Smallest implementation:** mechanical move + dependency edges (ingestion → core, shared); no logic change.
- **Safe command:** per-package `vitest run` for core and the new package; `tsc --noEmit` per package.
- **Acceptance:** boundary test green; all suites green; `git grep NormaliseDbClient packages/core/src` empty.
- **Risk:** low-medium — touches workspace wiring and `trigger/` imports (not inspected this audit); sequence after M-1 to avoid moving code mid-rewrite, or before it to do the rewrite in its final home — either order defensible, do not interleave.

**M-3. Field-complete canonical write + availability mapping** *(A1-005, A2-003, A2-006 part 1)*
- **Goal:** end/doors/prices/free/availability/time_tba written to canonical events.
- **Files:** `normalise.ts` (extend draft + add pure `mapAvailabilityGuess()`), `dbNormalise.ts`/successor, tests.
- **First test:** `mapAvailabilityGuess` table test (onsale→on_sale, offsale→not_on_sale, cancelled→cancelled, rescheduled→rescheduled, postponed→postponed, unknown→null) — pure, five minutes to red.
- **Smallest implementation:** extend `ExternalEventRow` reads + `eventRow` writes; one new pure mapper.
- **Safe command:** core vitest as above.
- **Acceptance:** golden-master test (A2-003) green; field table Section D "written?" column flips for the six fields.
- **Risk:** low; depends on M-1 landing first so updates actually carry the new fields.

**M-4. `timeTba` through the contract** *(A1-003, A2-005)*
- **Goal:** TBA survives parse → external → canonical.
- **Files:** `connectors/src/connector.ts`, `api/ticketmaster/parse.ts` + `parse.test.ts`, `shared/src/db/upsertExternalEvents.ts`, one small migration *(deferred — schema change needs its own approval; interim: thread via `raw`)*.
- **First test:** parse-level TBA test from A2-005.
- **Smallest implementation:** optional field + one branch assignment in `ticketmasterStartAt`'s caller.
- **Safe command:** connectors vitest.
- **Acceptance:** TBA fixture event carries the flag; non-TBA events unaffected (98 tests stay green).
- **Risk:** low at parse level; the external_events column decision (vs raw-jsonb carry) is the only design choice.

**M-5. Normalisation error isolation** *(A2-004)*
- **Goal:** one bad event/source cannot abort the sweep or alert persistence.
- **Files:** `dbNormalise.ts` (check `error`, per-event try/catch via existing `markNormalisationSkip`), `sweep.ts` (per-source try/catch), tests.
- **First test:** rejecting-upsert mock from A2-004.
- **Smallest implementation:** ~15 lines of guard code.
- **Safe command:** core vitest.
- **Acceptance:** new isolation tests green; alerts persisted even when normalisation partially fails.
- **Risk:** minimal.

**M-6. Alert/status semantics** *(A2-008, A2-009)*
- **Goal:** alert types persistable; zero-parsed honest.
- **Files:** `orchestrate.ts` + tests; either a one-line CHECK migration *(needs approval)* or remap cold_start_zero onto an allowed type.
- **First test:** AlertType-vs-allowed-list assertion; zero-parsed status test.
- **Smallest implementation:** status function change + type alignment.
- **Safe command:** core vitest.
- **Acceptance:** both tests green; existing orchestrate tests adjusted deliberately (the current behaviour is pinned by tests — expect intentional red→green edits).
- **Risk:** low; behavioural change to run statuses should be noted in docs/INGESTION.md.

**M-7. Dedupe input hygiene** *(A1-006, A2-007)*
- **Goal:** keys deterministic across environments and consistent with stored data.
- **Files:** `dedupe.ts`, `validate.ts`, `dbNormalise.ts:131`, tests.
- **First test:** `deriveDedupeKey` offset-less input → throws (or documented deterministic UTC assumption); `validateIngestResult` rejects offset-less `startAt`; key-from-stored-title test.
- **Smallest implementation:** regex offset check + use `title` (trimmed) at line 131.
- **Safe command:** core + connectors vitest.
- **Acceptance:** parity corpus (Section F) green against the TS side; SQL-side parity remains a fixture-documented contract until an approved integration run.
- **Risk:** low; changing key derivation inputs alters keys for whitespace-padded titles — acceptable pre-launch (no production data), note explicitly.

---

## N. Recommended immediate next technical task

**M-1: identity-first canonical updates** (A1-001 / A2-001).

It is the single change that converts the pipeline from write-once to maintainable: until linked external events propagate updates, every other improvement (field completeness, availability badges, removal handling, TBA flags) writes data that can never be corrected afterwards. It is local, mock-driven, test-first (the reschedule fixture is a one-file red test), requires no schema change, no external research, no Audit 0, and no refactor — M-2's package move can follow immediately after with the logic already correct. A2-004's error guards (M-5) are small enough to fold into the same session if scope allows, since both touch the same function.

---

*Audit 2 complete. Review-only; no schema, code, or data changes were made. The only file written is this report. Unit tests were executed read-only against existing fixtures after the safety checks recorded in Section A; the deliberately red architecture-boundary test was left red.*
