# Audit 1 — Data Model

Review-only data model audit. No production changes made. No migrations implemented.

---

## A. Metadata

- **Audit 0 report:** `docs/reviews/2026-06-audit-0-repo-truth-and-safety.md` **does not exist** in the working tree (no `docs/reviews/` directory existed before this report). The commit SHA and dirty-tree status below were captured directly during this audit in lieu of Audit 0 outputs.
- **Commit SHA (HEAD):** `21a6a278d8c2ecd69b84bd64f8cd1904849dadfb`
- **Dirty-tree status:** dirty. Uncommitted changes are confined to `docs/prompts/` (modifications, deletions, archive reorganisation) and `docs/tasks/` deletions. No uncommitted changes to `supabase/migrations/` or `packages/` were observed.
- **Instruction conflict noted (per audit prompt):** `CLAUDE.md` requires “Wait for approval before editing”; this session's audit prompt supersedes that for the single report file (`docs/reviews/2026-06-audit-1-data-model.md`), which is the only file written.
- **Context correction:** the audit prompt and some prior project notes describe ADR 0001 (frontend) as open and a “20-table, Webflow-publishing” schema. Repo truth differs: `CLAUDE.md` records ADR 0001 as **accepted 2026-06-02 (Astro + Supabase direct read)**, and migration `20260603000000` drops the three Webflow publish tables and seven denormalised display columns. The live model is **17 tables**.

**Files inspected**

- `supabase/migrations/20260531000000_schema_v5_initial.sql` (922 lines)
- `supabase/migrations/20260603000000_cc_new_1_schema_corrections.sql` (300 lines)
- `supabase/migrations/20260606000000_source_category_map_seed.sql`
- `supabase/migrations/20260606001000_a3_event_tags_explicit_confidence.sql`
- `supabase/migrations/20260607000000_fix_ticketmaster_segment_ids.sql`
- `supabase/migrations/20260608000000_event_submissions_public_gate.sql`
- `packages/shared/src/types/event.ts`, `packages/shared/src/types/source.ts`, `packages/shared/src/enums/taxonomy.ts`
- `packages/connectors/src/connector.ts`
- `packages/core/src/normalise/normalise.ts`, `packages/core/src/normalise/dbNormalise.ts`
- `packages/core/src/dedupe/dedupe.ts`
- `CLAUDE.md` (project rules, ADR status)

---

## B. Current schema summary

Post-migration state (v5 baseline + CC-NEW-1 + seeds + fixes), 17 tables:

**Reference:** `event_types` (13 seeded categories), `tags` (with `parent_event_type_id` hierarchy), `source_type_category_map` (Ticketmaster segment IDs seeded, theatre gap documented).

**Sources:** `sources` (connector registry; `source_type` in api/rss/ical/html/apify/manual; tier 1–4; health fields), `ingest_runs`, `ingest_alerts`.

**Places:** `venues` (status lifecycle, auto-creation flags, accessibility text, capacity), `venue_aliases` (unique `normalised_alias`).

**Grouping:** `festivals` (nullable dates, `match_domains`/`match_title_terms`/`match_url_slugs` arrays), `event_series` (`recurrence_hint` free text, trigram index on title).

**Events:** `events` (canonical; one row per dated occurrence; `start_at` NOT NULL timestamptz, `end_at`, `doors_at`, `timezone` with IANA CHECK, `time_tba`, `is_all_day` added by CC-NEW-1; price fields with free-price CHECKs; `availability` enum + `availability_note`; `visibility` lifecycle; `confidence` + `confidence_inputs`; unique `dedupe_key`), `event_tags`, `external_events` (per-source raw rows; `raw` jsonb + extracted `*_guess` fields; `uq_external_source_id`; `last_seen_at` removal detection; FK to canonical `event_id`), `event_merge_candidates` (pair-canonicalised unique index via LEAST/GREATEST).

**Community:** `event_submissions` (column-level anon INSERT grant, status-gated RLS), `venue_claims`, `moderation_log`.

**Functions:** `normalise_title`, `compute_dedupe_key` (UTC-bucketed after BE-09 fix), `resolve_venue` / `auto_create_venue` (normalisation aligned in CC-NEW-1), `validate_event_consistency` (reduced post-Webflow), `archive_past_events`, `trigger_set_updated_at`.

**TypeScript:** `RawEvent` connector contract (`packages/connectors/src/connector.ts:8–29`), `ExternalEventRow` / `CanonicalEvent` (`packages/shared/src/types/event.ts`), `ExternalEventDraft` / `CanonicalEventDraft` and confidence model (`packages/core/src/normalise/normalise.ts:51–89`), TS dedupe (`packages/core/src/dedupe/dedupe.ts`).

---

## C. Event modelling assessment

**One-off events:** well supported. Title/venue/type/price/links/image all present; venue resolution via alias table with auto-creation fallback is a genuinely good fit for grassroots listings where venue names are inconsistent.

**Multi-day events:** representable (`start_at` + nullable `end_at` + `is_all_day`), but query-side support is thin — see Section D and finding A1-004.

**Exhibitions with date ranges:** representable, but the model treats `start_at` as the sort/listing key (`idx_events_published_date`, schema v5 line 390). An exhibition running June–August sorts by its opening date and has no efficient “on display today” access path. `archive_past_events` correctly uses `coalesce(end_at, start_at)` (v5 line 834), so ranges don't archive early — the gap is discovery, not retention.

**Recurring events / theatre / film / comedy multi-occurrence:** the implicit model is **one canonical row per occurrence**, grouped by `event_series`. This is a defensible flat design (it matches how Ticketmaster/Skiddle emit data), but it is *implicit*: nothing in the schema or docs inspected states it, `event_series.recurrence_hint` is free text with no expansion semantics, and the normalisation pipeline never populates `series_id` (dbNormalise.ts eventRow, lines ~113–132, omits it; `series_id_guess` exists on `external_events` but not in `ExternalEventDraft`). A weekly club night submitted manually has no recurrence mechanism at all — every week is a separate submission. Finding A1-002.

**Festivals with sub-events:** one level of hierarchy (`events.festival_id`), match arrays on `festivals` for detection, nullable dates for pre-announcement entries. Adequate for MVP. INFERENCE: no schema-level date-window validation exists for festival matching (no constraint or function references the match arrays); the previously flagged false-positive risk (e.g. “Celtic Connections” title terms matching a year-round event) is unmitigated at the data layer and lands entirely on application code. Finding A1-009.

**Ticketed/free:** good. `is_free`, `price_min/max`, `price_display` for “PWYC”, plus CC-NEW-1 CHECKs preventing `is_free` with positive prices (migration 20260603, lines 147–153). `ticket_url` + `ticket_url_label` supports link-first CTAs.

**Manual submissions:** see Section F.

**Merge representation:** `event_merge_candidates` records pairs and a `status` of merged/rejected, but `events` has no `merged_into_event_id` (or equivalent). After a merge, the losing row is presumably set `visibility='hidden'` with no pointer to the survivor — INFERENCE from absence. This loses provenance and prevents slug/URL redirects. Finding A1-007.

---

## D. Time modelling assessment

**Storage model:** all instants are `timestamptz` (UTC on disk) with a per-event IANA `timezone` column defaulting to `Europe/London`, validated by the clever `now() at time zone timezone` CHECK (migration 20260603, lines 168–173). This is the correct architecture for BST/GMT: UTC storage + named zone for display. The BE-09 fix (`date_trunc` `at time zone 'UTC'`, migration 20260603 lines 73–89) removed the BST hash-instability in `compute_dedupe_key`. Solid.

**Doors vs show time:** `doors_at` exists on both `events` (v5 line 301) and `external_events` (line 425), explicitly modelled on Ticketmaster's `doorOpenTime`. Two gaps: (1) no sanity CHECK (`doors_at <= start_at`); (2) the normalisation pipeline never writes it to canonical events — `ExternalEventDraft` (normalise.ts:51–67) and the `eventRow` in dbNormalise.ts have no doors field, so the column is currently unreachable from ingestion. Finding A1-005. Doors-vs-show also interacts with dedupe: two sources advertising the same gig at 18:30 (doors) and 19:30 (show) bucket into different hours and produce different dedupe keys — a *systematic* cross-source dedupe miss for exactly the live-music events the platform centres on. Finding A1-007.

**Unknown/uncertain times:** `time_tba` exists, but `start_at` is NOT NULL — a TBA event must carry a fabricated timestamp, and no sentinel convention (midnight local? noon?) is documented in schema comments or the inspected docs. Worse, the fabricated time feeds `compute_dedupe_key`/`deriveDedupeKey`: when the real time is later announced, the key changes, and the `onConflict: 'dedupe_key'` upsert (dbNormalise.ts ~line 134) creates a **second canonical event** rather than updating the first. The same applies to `availability='postponed'` with “new date TBA” — the stale `start_at` must be kept (NOT NULL) and any correction forks the row. Findings A1-001, A1-003.

**All-day events:** `is_all_day` (CC-NEW-1) stored against a `timestamptz` is lossy. “All day on 14 June” encoded as `2026-06-14T00:00:00Z` renders as 13 June 23:00 BST→ wrong; encoded as midnight Europe/London it is `2026-06-13T23:00:00Z` and any UTC-side date extraction (including the dedupe hour bucket) lands on the wrong calendar day. All-day events are calendar-date facts and need a date representation or a documented encoding convention. Finding A1-004.

**End times:** nullable `end_at`, no CHECK `end_at >= start_at`. Low risk, cheap to add.

---

## E. Source attribution and dedupe modelling

**Raw/external/canonical separation:** structurally sound for connector-driven sources. `external_events.raw` preserves the full upstream payload; extracted `*_guess` fields form the pre-normalisation layer; `event_id` links to canonical; `(source_id, external_id)` uniqueness and `last_seen_at` removal detection are both present and indexed. `primary_source_id` on `events` plus `external_events` back-links give multi-source attribution (all contributing sources for one canonical event are queryable via `external_events.event_id`). This satisfies link-first/attribution-first at the data layer.

**Two material weaknesses:**

1. **`dedupe_key` is both identity and content hash.** It is derived from mutable fields (venue, hour-bucketed start, normalised title) yet is the unique upsert target. Any reschedule, time correction, title edit, or venue re-resolution silently mints a new canonical row while the old one stays `published` with stale information — the exact failure the `availability='rescheduled'` state was designed to surface. The durable identity already exists (`external_events.event_id`); the upsert path just doesn't use it. Finding A1-001 (the most important finding in this audit).

2. **Dual dedupe implementations.** SQL `compute_dedupe_key` and TS `deriveDedupeKey` must stay bit-identical or cross-path duplicates appear. Divergence vectors today: SQL `normalise_title` uses POSIX `[[:alnum:]]` (locale-dependent for accented/non-Latin characters) vs TS `Unicode p{L}/p{N}` Unicode classes; and TS `new Date(startAt)` interprets an offset-less ISO string in the *runtime's local zone* (dedupe.ts:7), making the hour bucket environment-dependent if any connector ever emits a naive datetime. `RawEvent.startAt` is typed merely as “ISO 8601” (connector.ts:14) with no offset requirement. Finding A1-006.

**Hour-bucket brittleness:** identical events at 19:55 vs 20:05 (or doors vs show, above) miss. `event_merge_candidates` exists as the fuzzy backstop, which is the right shape — but without a survivor pointer on `events` the merge outcome is unrepresentable. Finding A1-007.

---

## F. Manual and grassroots coverage fit

**Community submissions:** `event_submissions` exists with a well-hardened public boundary (column-level grant + status-gated RLS + non-blank title CHECK, migration 20260608). Moderation linkage (`status`, `reviewed_by`, `event_id`) is sound.

**Field gaps vs the grassroots brief:** a submitter cannot declare an event **free** or state a price (no `is_free`/`price_display`), attach an image, give doors time, or mark all-day — yet free/PWYC pricing is precisely the load-bearing fact for DIY gigs, markets and community events, and the brand commits to free events carrying equal weight. There is also no `submitter_name`/`organisation` field, so the “Listed by X” neutral-provenance pattern has nothing to render from; `submitter_email` alone cannot be displayed. Finding A1-008.

**Manual path bypasses the raw layer.** `sources.source_type` includes `'manual'`, but approving a submission (presumably) writes straight to `events` — no `external_events` row is created, so manual events have no raw record, no `last_seen_at`, and no `(source_id, external_id)` identity. INFERENCE from structure: nothing in the schema connects `event_submissions` to `external_events`. Consequence: a manual event and a later-scraped copy of the same event can only collide via `dedupe_key` exact match (hour-bucket fragile, per A1-007), and the provenance chain for manual events is thinner than for scraped ones on an attribution-first platform. Finding A1-008.

**CSV imports / partner feeds:** no dedicated structures, and none are needed — a CSV import is a `manual`-type (or `ical`/`rss`) source whose connector emits `RawEvent`s into `external_events` with content-hash `external_id`s. The connector contract (connector.ts) accommodates this today. Recommend documenting this as *the* route for bulk manual data, which also resolves the raw-layer bypass above for everything except one-off form submissions.

---

## G. MVP minimum model

The smallest model that serves the stated product (link-first index, established + grassroots, no ranking):

**Keep (10 tables):** `events`, `venues`, `venue_aliases`, `sources`, `external_events`, `event_types`, `event_tags` + `tags`, `ingest_runs`, `event_submissions`.

**Defer without risk:** `festivals`/`event_series` (nullable FKs already; ship with them unused), `source_type_category_map` (already seeded — keep, it's load-bearing for Ticketmaster typing), `ingest_alerts`, `event_merge_candidates` (add when a second source ships and cross-source duplicates actually exist), `venue_claims`, `moderation_log`.

**But three corrections belong in MVP, not after it,** because they affect row identity and are painful to retrofit: (1) decouple canonical identity from `dedupe_key` (A1-001); (2) document/encode the TBA and all-day time conventions (A1-003/004); (3) add free/price + attribution-name fields to `event_submissions` before the public form ships (A1-008). Everything else can wait.

---

## H. Likely migrations (not implemented)

1. **Identity decoupling:** stop using `onConflict: 'dedupe_key'` as the canonical write path; resolve via `external_events.event_id` first, treat `dedupe_key` as a *match hint*. Schema side: either relax `idx_events_dedupe_unique` to a non-unique index, or keep it and recompute/migrate keys only through a controlled merge routine. Add `events.merged_into_event_id uuid references events(id)`.
2. **Reschedule support:** `events.original_start_at timestamptz` (or a small `event_revisions` audit of date changes) so `availability='rescheduled'` can show “moved from X”.
3. **Date-range discovery:** GiST index on `tstzrange(start_at, coalesce(end_at, start_at), '[]')` (or generated range column) to make “what's on today” include running exhibitions; plus `local_start_date date` (generated from `start_at` at `timezone`) for all-day/calendar semantics.
4. **Time-convention CHECKs:** `end_at >= start_at`, `doors_at <= start_at`; comment-level documentation of the `time_tba` sentinel.
5. **Submissions enrichment:** `is_free boolean`, `price_display text`, `image_url text`, `doors_at`, `is_all_day`, `submitter_name text` / `organisation text` on `event_submissions` (extend the column grant and RLS check accordingly).
6. **Type drift elimination:** generate TS row types from the live schema (e.g. `supabase gen types typescript`) and retire hand-written `CanonicalEvent`/`ExternalEventRow`, which already disagree with the DB (see A1-005).
7. **Manual provenance:** convention (no DDL) or trigger to create an `external_events` row (source = manual, `external_id` = submission id) when a submission is approved.

---

## I. Findings

| ID | Severity | Effort | Finding |
|---|---|---|---|
| A1-001 | **Critical** | M | Mutable-field dedupe key is the canonical upsert identity |
| A1-002 | High | M | No explicit occurrence/recurrence model |
| A1-003 | High | S | `start_at NOT NULL` vs TBA/postponed times; no sentinel convention |
| A1-004 | High | M | All-day/date-range events: lossy encoding, no range access path |
| A1-005 | High | M | Normalisation contract drops schema fields; TS types drift from DB |
| A1-006 | Medium | S | Dual dedupe/normalisation implementations can diverge |
| A1-007 | Medium | M | Hour-bucket dedupe brittle; no merge-survivor representation |
| A1-008 | High | S | Submission field gaps (free/price, image, attribution name); manual path bypasses raw layer |
| A1-009 | Low | S | Festival match arrays lack date-window validation |
| A1-010 | Low | S | Stale schema header inventory; slug regeneration on upsert |
| A1-011 | Info | — | Audit 0 missing; prompt/CLAUDE.md supersession noted |

**A1-001 — Dedupe key as mutable identity** · Severity: Critical · Effort: M
- **Evidence:** `supabase/migrations/20260531000000_schema_v5_initial.sql:370–377` (`dedupe_key not null`, unique index); `packages/core/src/normalise/dbNormalise.ts` (~line 134) `upsert(eventRow, { onConflict: 'dedupe_key' })`; key inputs are venue, hour-bucketed `start_at`, normalised title (`packages/core/src/dedupe/dedupe.ts:4–16`).
- **Impact:** any reschedule, time correction (incl. TBA→confirmed), title edit, or venue re-resolution changes the key; the upsert creates a duplicate canonical event and the original remains published with stale data. Undermines the `rescheduled`/`postponed` availability states and produces visible duplicates on the site.
- **Recommended action:** resolve canonical identity via `external_events.event_id` linkage before any dedupe-key upsert; demote `dedupe_key` to a match hint (H-1, H-2).

**A1-002 — No occurrence/recurrence model** · Severity: High · Effort: M
- **Evidence:** `events.start_at` single instant (v5:296); `event_series.recurrence_hint text` (v5:251) with no semantics; `series_id` never written by pipeline (`dbNormalise.ts` eventRow omits it); no occurrence table. INFERENCE: one-row-per-occurrence is implied but undocumented.
- **Impact:** theatre runs/film showtimes work only because upstream APIs emit per-occurrence items; manual recurring events (weekly club nights, monthly markets) require re-entry per occurrence; series grouping on listing pages has no data.
- **Recommended action:** document one-row-per-occurrence + series-grouping as the official model for MVP; defer an `event_occurrences` table; wire `series_id` population into normalisation (Audit 2 scope).

**A1-003 — TBA/postponed times vs NOT NULL start** · Severity: High · Effort: S
- **Evidence:** `start_at timestamptz not null` (v5:296); `time_tba boolean` (v5:303); `availability='postponed'` comment “date may be TBA” (v5:335). No sentinel convention in schema comments.
- **Impact:** fabricated timestamps feed dedupe (→ A1-001 forks on correction), sorting, and display; postponed-no-date events carry misleading dates.
- **Recommended action:** document a sentinel (e.g. midnight local + `time_tba=true`, excluded from dedupe hour bucket) or make the bucket date-only when `time_tba` (H-4; coordinate with A1-001 fix).

**A1-004 — All-day and date-range semantics** · Severity: High · Effort: M
- **Evidence:** `is_all_day` added with no date column (migration 20260603:161–162); listing index `idx_events_published_date` on `start_at` only (v5:390); no range index; `archive_past_events` uses `coalesce(end_at, start_at)` (v5:834).
- **Impact:** BST/GMT date-shift for all-day events depending on midnight encoding; long-running exhibitions invisible to “on today” queries without full scans; sorting buries exhibitions after opening day — a direct equal-weight (brand) problem for the art-exhibition category.
- **Recommended action:** generated `local_start_date`/`local_end_date` (at `timezone`) + GiST `tstzrange` index; define all-day encoding convention (H-3).

**A1-005 — Pipeline contract drops schema fields; TS/DB type drift** · Severity: High · Effort: M
- **Evidence:** `ExternalEventDraft` (`normalise.ts:51–67`) lacks `endAt`, `doorsAt`, prices, `isFree`, `availability`, `tags`, `seriesId`; `eventRow` in `dbNormalise.ts` (~113–132) writes none of `end_at`, `doors_at`, `is_all_day`, `time_tba`, price fields, `availability`, `festival_id`, `series_id`, and hardcodes `summary: null, description: null`; `CanonicalEvent` (`types/event.ts:28–45`) claims to mirror `events` but omits ~15 columns incl. `is_all_day`, `doors_at`, `availability`, prices; `ExternalEventRow` omits `ticket_url_label_guess`, `series_id_guess`.
- **Impact:** doors time, end time, pricing, free flag and availability — all schema-supported and all product-critical — are unreachable from ingestion; the “missing normalisation contract” blocker is confirmed at type level.
- **Recommended action:** define the raw→canonical field contract explicitly; generate DB types (H-6). Full pipeline assessment is Audit 2 scope.

**A1-006 — Dual dedupe/normalisation implementations** · Severity: Medium · Effort: S
- **Evidence:** SQL `compute_dedupe_key`/`normalise_title` (v5:677–705, amended 20260603:73–89) vs TS `deriveDedupeKey`/`normaliseTitle` (`dedupe.ts`, `normalise.ts:91–101`); SQL POSIX `[[:alnum:]]` vs TS `Unicode p{L}/p{N}`; TS `new Date(startAt)` is local-zone for offset-less strings (`dedupe.ts:7`); `RawEvent.startAt` comment requires only “ISO 8601” (`connector.ts:14`), not offset-qualified.
- **Impact:** silent cross-path duplicate creation for titles with non-ASCII characters or connectors emitting naive datetimes; environment-dependent keys between local dev and Trigger.dev workers.
- **Recommended action:** pick one authority (suggest: TS only, or SQL only via RPC); add a parity test fixture incl. accented titles; require offset-qualified ISO strings in the connector contract.

**A1-007 — Hour-bucket brittleness; no merge survivor** · Severity: Medium · Effort: M
- **Evidence:** hour bucket in both key functions; doors vs show times across sources (v5:298–301 comments); `event_merge_candidates` has `status='merged'` but `events` has no `merged_into_event_id` (INFERENCE from absence, v5:267–374, 517–541).
- **Impact:** systematic cross-source dedupe misses for live music (doors/show offsets straddle hours); merge resolutions unrepresentable → no redirects, lost provenance.
- **Recommended action:** rely on `event_merge_candidates` + trigram similarity as the real cross-source matcher (date-scoped, not hour-scoped); add survivor pointer (H-1).

**A1-008 — Grassroots submission gaps; manual raw-layer bypass** · Severity: High · Effort: S
- **Evidence:** `event_submissions` columns (v5:603–621) and the public column grant (20260608:16–28) contain no `is_free`/price, image, doors, all-day, or submitter display-name/organisation fields; no structural link from submissions to `external_events` (INFERENCE from absence).
- **Impact:** free/PWYC — the defining fact of DIY events — cannot be submitted; “Listed by X” attribution has no data source; manual events lack raw provenance on an attribution-first platform.
- **Recommended action:** H-5 (fields + grant/RLS update) before the public form launches; H-7 for provenance.

**A1-009 — Festival date-window validation absent** · Severity: Low · Effort: S
- **Evidence:** `festivals.match_*` arrays and nullable dates with comment “Date window check only applies when both are set” (v5:228–235); no constraint/function in any migration references the match arrays (INFERENCE).
- **Impact:** title-term matching without a date window risks tagging year-round events into festival programmes; the documented SPEC gap remains open at the data layer.
- **Recommended action:** keep enforcement in application code but add the rule to the normalisation contract; consider a `validate_festival_match()` helper when festival detection is built.

**A1-010 — Stale header inventory; slug instability** · Severity: Low · Effort: S
- **Evidence:** v5 header inventory claims 20 tables incl. Webflow set (v5:884–912) vs 17 post-CC-NEW-1; `slugFor(title, startAt)` regenerated inside the upsert row (`dbNormalise.ts` eventRow) — a title/date change rewrites the published slug.
- **Impact:** doc/readers misled (the v5 file says “verbatim copy — do not edit”, so correct elsewhere); URL churn breaks shared links — material for a link-first product.
- **Recommended action:** note the live inventory in `docs/DATA_MODEL.md`; treat `slug` as write-once after first publish.

**A1-011 — Audit 0 missing / instruction supersession** · Severity: Info
- **Evidence:** `docs/reviews/` did not exist at audit time; `CLAUDE.md` approval-gate superseded for this report file only, per audit prompt.
- **Impact:** metadata captured directly (Section A); no chain-of-custody from a prior audit.
- **Recommended action:** run/backfill Audit 0 so later audits share a pinned SHA.

---

## J. Handoff notes for Audit 2 (normalisation/connectors)

Inspect, in this order:

1. `packages/core/src/normalise/dbNormalise.ts` — `normaliseExternalEventsForSource()`, `resolveVenue()`, `resolveEventType()`, the `eventRow` construction and `onConflict: 'dedupe_key'` upsert (A1-001/005 ground zero).
2. `packages/core/src/normalise/normalise.ts` — `calculateConfidence()`, `mapSourceCategoryToEventType()` fallback-to-`other` behaviour, `normaliseImageUrl()`, the `ExternalEventDraft`/`CanonicalEventDraft` contracts.
3. `packages/core/src/dedupe/dedupe.ts` — `deriveDedupeKey()` parity with SQL `compute_dedupe_key` (A1-006); date parsing of offset-less strings.
4. `packages/core/src/ingest/orchestrate.ts` and `sweep.ts` — run lifecycle, `last_seen_at` updates, removal/`is_deleted` handling, `ingest_runs` counters.
5. `packages/connectors/src/connector.ts` and `validate.ts` — `RawEvent` contract enforcement; whether `startAt` offsets are validated (A1-006).
6. `packages/connectors/src/api/ticketmaster/{fetch,parse,index}.ts` — `doorOpenTime` handling, `dates.status.code` → `availability_guess`, multi-date/spanning events, segment-ID usage vs the 20260607 fix.
7. `packages/shared/src/db/upsertExternalEvents.ts` and `publicQueries.ts` — external upsert semantics vs `uq_external_source_id`; whether public queries can serve date-range/exhibition lookups (A1-004).
8. Docs to cross-check claims against code: `docs/NORMALISATION.md`, `docs/INGESTION.md`, `docs/CONNECTOR_GUIDE.md`, `docs/DEDUPLICATION.md`, `docs/reference/SCHEMA_v5.sql`.

Open questions for Audit 2: where (if anywhere) `series_id_guess`, `festival_id`, `availability_guess`, `doors_at` and prices are consumed; whether `auto_publish` config interacts safely with the RLS `confidence >= 60` gate; whether the sweep marks Ticketmaster removals as `cancelled` (availability) or merely `is_deleted`.

---

*Audit 1 complete. Review-only; no schema, code, or data changes were made. The only file written is this report.*
