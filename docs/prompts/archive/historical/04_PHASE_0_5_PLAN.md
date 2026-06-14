# Phase 0.5 — Stabilisation Sprint Master Plan

> **Purpose:** Planning document for the Phase 0.5 stabilisation sprint.
> Produced from the R1–R6 pre-build review (2026-06-03).
> Supersedes ad-hoc task references for this sprint.
> Archive when Phase 0.5 is complete and all items below are ticked off.

---

## Operating context

You are working on the Clyde Culture repository — a Glasgow community events aggregator.

A Phase 0 readiness review (docs/prompts/02_PROMPTS_REVIEW.md) identified that Phase 1
development should not start as one large implementation pass. The project needs a short
Phase 0.5 stabilisation sprint first, focused on contract alignment, schema/type consistency,
red tests, and connector pre-flight tasks.

---

## Operating rules (apply to every task in this plan)

- Do not build production connector logic yet.
- Do not build the full normalisation pipeline yet.
- Work task-by-task.
- Use test-driven development per `docs/DEVELOPMENT_WORKFLOW.md` and `CLAUDE.md`.
- For each implementation task: first add or update the failing test, then stop and report
  the test file and expected failure.
- Wait for the instruction: "Now implement the smallest production code needed to pass this
  test. Run the test and report the result."
- Keep changes small and reviewable. One task = one commit (or one PR).
- Do not bundle unrelated tasks into one PR.
- Do not invent missing contracts. If a contract is unclear, create or update the relevant
  docs/task file first.

---

## Canonical source-of-truth decisions

Apply these decisions in every task that touches the relevant area.

1. `docs/NORMALISATION.md` is the canonical source of truth for normalisation behaviour.
   If BE-03, BE-13, or any other task file contradicts it, the task file is wrong.
2. The SQL schema (`docs/reference/SCHEMA_v5.sql`) is the canonical source of truth for
   table fields, column names, and enum-like constraint values.
3. TypeScript shared types must match the database schema, not older docs.
4. `EventCategory` (or its replacement) must match the 13 SQL `event_types.slug` values
   exactly, or be replaced by a string-literal type derived from those slugs. The current
   8-value enum is wrong and must not be used.
5. `Source` must match the `sources` table. Use `enabled`, not `isActive`. Do not use
   `baseUrl` unless the DB actually has that column.
6. `SourceType` must include `'apify'` everywhere and be kept in sync with the DB CHECK
   constraint. Stale notes saying "add apify later" must be removed.
7. `RawEvent` must include all fields needed to populate `external_events`, including price,
   ticket URL, image, availability, end time, and doors time.
8. The fuzzy dedupe threshold for Phase 1 is `0.35`, unless a later task explicitly changes it.
9. Link-only sources must not store copied descriptions, summaries, or image URLs in
   canonical events.
10. Do not build public submission, venue claim, or Phase 2 community features during
    this sprint.

---

## Task Group A — Schema correction gate

These are prerequisites for all normalisation and connector work. Nothing downstream starts
before CC-NEW-1 is written and applied.

### A1 — Write and apply the CC-NEW-1 migration

**Task file:** `docs/tasks/CC-NEW-1.md` (update in place)
**Deliverable:** A precise, executable migration with safety pre-checks and acceptance tests.

Required changes in the migration:

1. `compute_dedupe_key()` must use `AT TIME ZONE 'UTC'` in the `date_trunc` call.
2. A collision pre-check DO block must run before `UPDATE events SET dedupe_key = ...`.
   Raise an exception if any two events would produce the same new key. Do not silently
   proceed.
3. Drop Webflow-era publishing tables: `publish_job_items`, `publish_jobs`, `publish_mappings`
   (and their trigger).
4. Drop Webflow-era columns from `events`: `event_type_label`, `venue_name_display`,
   `venue_slug_display`, `festival_name_display`, `festival_slug_display`, `tags_display`,
   `location_display`.
5. Replace or drop `validate_event_consistency()` so it does not reference any dropped column.
   The replacement must retain the `is_free / price_display` check and the
   `image_url = ''` check.
   Also add two CHECK constraints to the `events` table directly (DB-R2-08):
   - `CHECK (NOT (is_free = true AND price_min > 0))`
   - `CHECK (NOT (is_free = true AND price_max > 0))`
6. Replace the public `events` RLS policy with:
   `using (visibility = 'published' and confidence >= 60)`.
7. Add `'apify'` to the `sources.source_type` CHECK constraint.
8. Add `'cold_start_zero'` to the `ingest_alerts.alert_type` CHECK constraint.
9. Add `events.timezone` IANA validation (two-step `NOT VALID` + `VALIDATE CONSTRAINT`).
10. Align `resolve_venue()` normalisation to match TypeScript `normaliseVenueName()`:
    strip non-alphanumeric/non-space characters, collapse whitespace, lowercase.
11. Add `events.is_all_day boolean NOT NULL DEFAULT false` (for iCal VALUE=DATE events).
12. Update `venue_aliases` RLS policy to restrict public read to aliases for active/temporary
    venues only.

**Acceptance criteria:**
- `pnpm db:reset` applies both migrations cleanly.
- SQL assertion: `compute_dedupe_key(uuid, '2026-07-15T21:00:00+01:00', 'test')` equals
  `compute_dedupe_key(uuid, '2026-07-15T20:00:00Z', 'test')`.
- A collision pre-check exists before the backfill UPDATE.
- `validate_event_consistency()` does not reference `event_type_label`,
  `venue_name_display`, or `festival_name_display`.
- An anon query for `SELECT * FROM events WHERE visibility = 'published' AND confidence = 55`
  returns zero rows.
- `sources.source_type` CHECK includes `'apify'`.
- `events.is_all_day` column exists.
- Migration has been line-by-line validated against
  `supabase/migrations/20260531000000_schema_v5_initial.sql` to confirm all referenced
  object names (triggers, columns, functions) actually exist in the baseline.
  (DB-R2-11: the CC-NEW-1 draft references `on_publish_mapping_change` but the actual
  trigger is `set_updated_at` — DROP TABLE handles it implicitly, but every name must
  be checked.)

---

### A2 — Add internal RLS deny tests

**Task file:** `supabase/tests/rls_internal_tables_test.sql` (new)
**Depends on:** A1

Confirm the default-deny posture on internal tables. Using pgTAP or a test Supabase client,
assert that the anon role returns zero rows from:

- `sources`
- `external_events`
- `ingest_runs`
- `ingest_alerts`
- `event_merge_candidates`
- `moderation_log`
- `venue_claims`

Also assert that `event_submissions` anon INSERT currently does not accept arbitrary payloads
with `WITH CHECK (true)` (this will fail until F1 is applied — flag but do not block A2).

**Acceptance criteria:**
- Running the test suite against a local DB confirms zero rows returned to anon for all
  seven tables.
- CI step added or noted for future addition.

---

## Task Group B — Type and schema alignment

These can mostly run in parallel. All must complete before core implementation work begins.

### B1 — Align `EventCategory` with SQL `event_types` slugs

**Files:** `packages/shared/src/enums/taxonomy.ts`, add type test
**Current problem:** 8-value enum (`Music`, `Arts`, …) matches none of the 13 SQL slugs.

Canonical SQL slugs:
```
live_music  club_night  comedy  theatre  arts_exhibition
workshop  talk_lecture  film  family  sport
community_meetup  food_drink  other
```

Instruction:
First write or update a test that fails because the current enum values do not match the SQL
taxonomy. Stop after the test.

**Acceptance criteria:**
- TypeScript event type values match SQL slugs exactly.
- No old values such as `Music`, `Arts`, `Talk`, or `Festival` remain as canonical type values.
- Any broader UI grouping must be represented separately, not as the canonical event type.
- `mapSourceCategoryToEventType()` returns a value from this list.

---

### B2 — Align `Source` interface with the `sources` table

**Files:** `packages/shared/src/types/source.ts`, `docs/tasks/CC-NEW-2.md`
**Current problem:** `isActive` (DB has `enabled`), `baseUrl` (no such column).

Required fields to include (from `docs/reference/SCHEMA_v5.sql`):
`id`, `name`, `slug`, `source_type`, `tier`, `config`, `status`, `enabled`,
`last_run_at`, `last_success_at`, `last_error_at`, `last_error`, `created_at`, `updated_at`.

Instruction:
First write or update a type-level or runtime shape test that proves the current interface
does not match the DB schema. Stop after the test.

**Acceptance criteria:**
- `Source` matches the `sources` table.
- CC-NEW-2 and any source seed SQL use `enabled`, not `is_active`.
- No source task references non-existent `base_url` / `baseUrl` unless schema adds the column.

---

### B3 — Align `SourceType` everywhere

**Files:** `packages/connectors/src/connector.ts`, `packages/connectors/CLAUDE.md`,
add sync test
**Current problem:** `connector.ts` still lacks `'apify'`. Two definitions of `SourceType` exist.

Phase 1 canonical values: `api | rss | ical | html | apify | manual`

Instruction:
First write or update a test/assertion that fails if TypeScript `SourceType` and the DB CHECK
constraint diverge. Stop after the test.

**Acceptance criteria:**
- `'apify'` exists in `connector.ts`.
- Stale notes saying "add apify later" removed from `packages/connectors/CLAUDE.md`.
- Either one canonical TypeScript definition exists, or a test mechanically keeps both in sync.

---

### B4 — Expand `RawEvent` to match `external_events`

**Files:** `packages/connectors/src/connector.ts`, `packages/connectors/CLAUDE.md`,
`docs/CONNECTOR_GUIDE.md`, `packages/connectors/src/connector.test.ts`
**Current problem:** 7 fields missing from `RawEvent`; connectors cannot output pricing,
availability, ticket URL, or image.

Required `RawEvent` fields (complete list):
```
externalId       externalUrl      title           startAt
endAt            doorsAt          venueName        eventTypeGuess
tagsGuess        priceMinGuess    priceMaxGuess    isFreeGuess
ticketUrlGuess   ticketUrlLabelGuess  imageUrlGuess  availabilityGuess
raw
```

Instruction:
First update connector contract tests so mock connector fixtures can carry all these fields.
Do not implement connector logic. Stop after the test update.

**Acceptance criteria:**
- No `_guess` field exists in `external_events` without a corresponding `RawEvent` field.
- CONNECTOR_GUIDE.md `RawEvent` skeleton example is updated.
- Existing connector tests still pass after the interface change.

---

### B5 — Seed `source_type_category_map`

**Files:** `supabase/migrations/YYYYMMDD_source_category_map_seed.sql` (new),
`docs/tasks/BE-03.md` (update status)
**Depends on:** B1 (seed uses the correct slugs)
**Current problem:** No migration populates this table; all classification falls to
keyword guessing; Ticketmaster auto-publish floods moderation queue.

Instruction:
Create a seed migration with at minimum the Ticketmaster classification IDs documented
in `docs/tasks/BE-03.md`. After the seed is applied, `mapSourceCategoryToEventType()`
should correctly classify live music, club nights, comedy, and theatre from Ticketmaster
category IDs without keyword fallback.

Do not write the TypeScript implementation yet — just the seed data and a SQL assertion.

**Acceptance criteria:**
- Seed migration applies cleanly after CC-NEW-1.
- A SQL query against `source_type_category_map` returns at least 5 Ticketmaster rows.
- BE-03 is updated to "partially closed" with the doc-creation part marked done and the
  seed migration sub-task marked complete.

---

## Task Group C — Core utility tests (red tests only)

Write failing tests first. Do not implement production code until each test is reviewed
and the "Now implement" prompt is given.

### C1 — Implement `validate.ts` test-first

**Files:** `packages/connectors/src/connector.test.ts` (already has tests, verify they're
complete), `packages/connectors/src/validate.ts` (new — write after test review)
**Current problem:** `connector.test.ts` imports from `./validate.js` which does not exist.
All connector tests are broken.

Instruction:
Review the existing connector tests and confirm the expected behaviours cover:
- rejecting missing `externalUrl`
- rejecting non-HTTPS URLs
- accepting valid HTTPS URLs
- collecting errors without crashing the run

Add any missing red tests. Stop after test review and gap assessment.

**Acceptance criteria after implementation:**
- `packages/connectors/src/validate.ts` exports `validateIngestResult` and `isValidHttpsUrl`.
- All connector tests pass.
- `index.ts` exports both functions.

---

### C2 — Pin confidence scoring with red tests

**Files:** `packages/core/src/normalise/calculateConfidence.test.ts` (new),
`packages/shared/src/types/confidence.ts` (new type),
`docs/tasks/BE-03.md`, `docs/tasks/BE-13.md` (update to reference NORMALISATION.md)
**Depends on:** B1 (tests use correct event type values)

Instruction:
First write `calculateConfidence.test.ts` using only `docs/NORMALISATION.md` Step 4 as the
specification. Stop after the red test.

Test must cover:
- Tier 1 base score
- Each additive input (+10 has_start_at, +10 venue_resolved, +10 type_classified,
  +5 title_quality, +5 has_url, +10 corroborated)
- Full-data Tier 1 event reaches ≥ 80
- Missing `start_at` produces < 60 (does not auto-publish)
- Minimal data (title only) ≤ 40
- `confidence_inputs` JSONB keys match `ConfidenceInputs` type

**Acceptance criteria:**
- One formula. One `ConfidenceInputs` type.
- BE-03 and BE-13 do not contradict NORMALISATION.md.

---

### C3 — Pin category mapping with red tests

**Files:** `packages/core/src/normalise/mapSourceCategoryToEventType.test.ts` (new)
**Depends on:** B1 (correct slugs), B5 (seed data exists for assertions)

Instruction:
Write `mapSourceCategoryToEventType.test.ts`. Stop after the red test.

Must cover:
- direct lookup from `source_type_category_map` for a Ticketmaster classification ID
- keyword fallback for an unmapped category
- unknown category → `'other'`
- case-insensitive matching
- Returns SQL slug values, not old enum values

---

### C4 — Pin venue normalisation consistency

**Files:** `packages/core/src/normalise/normalise.test.ts` (update with venue tests),
`docs/NORMALISATION.md` (add SQL/TS equivalence note if missing)

Instruction:
Add tests for venue name normalisation that confirm TypeScript output matches expected
SQL output for:
- `"St Luke's"` → `"st lukes"`
- `"SWG3 (Glasgow)"` → `"swg3 glasgow"`
- `"  The Old Hairdresser's  "` → `"the old hairdressers"`
- `"Mono   Bar"` → `"mono bar"`

Stop after the test update.

**Acceptance criteria:**
- These exact pairs are also valid for `resolve_venue()` SQL after CC-NEW-1 aligns it.
- Connectors must pass raw venue names to the normaliser; pre-normalised names break the alias lookup.

---

### C5 — Pin merge behaviour with red tests

**Files:** `docs/NORMALISATION.md` (update Step 8 with field-level merge table first),
`packages/core/src/dedupe/mergeExternalEventIntoCanonicalEvent.test.ts` (new)
**Depends on:** D2 (reschedule path must be documented before merge tests can reference it)

Instruction:
First update `docs/NORMALISATION.md` Step 8 with a field-level merge priority table.
The table must cover every canonical `events` field and specify:
- whether better source tier wins regardless of null
- whether incoming non-null wins over existing null
- whether same-tier latest fetch wins
- whether null can overwrite non-null
- special handling for `availability`, `price`, `image`, `ticket_url`, `description`,
  `summary`, `doors_at`, `source_url`

Then write `mergeExternalEventIntoCanonicalEvent.test.ts`. Stop after docs update + red test.

**Acceptance criteria:**
- Merge behaviour can be implemented from the table alone.
- Tests cover: better-tier overwrite, same-tier recency, null preservation,
  availability update, `needs_review` flag when rescheduled.

---

### C7 — Document `time_tba` placeholder convention and UTC conversion requirement

**Files:** `docs/NORMALISATION.md` (Step 1 additions)
**Current gap:** `start_at` is `NOT NULL` in the schema but NORMALISATION.md says "if
`start_at` is null, `time_tba = true`" — a direct contradiction. Connectors that cannot
extract a start time must insert *something*; that something is undocumented. A midnight
placeholder will silently collide with genuine midnight events. (DB-R2-16)

Instruction:
Update `docs/NORMALISATION.md` Step 1 with two missing specs:

**a) UTC conversion requirement:**
Connectors are responsible for converting extracted times to UTC before populating
`start_at`. Never store a local time string as if it were UTC. The IANA timezone used
for conversion must come from `sources.config.timezone` if set, or `'Europe/London'` as
the default.

**b) `time_tba` placeholder convention:**
When a connector cannot extract a start time, it should:
- Set `time_tba = true`
- Set `start_at` to `date_trunc('day', <event_date_in_local_tz> AT TIME ZONE 'Europe/London')`
  — midnight of the event day in local time, converted to UTC
- This convention is documented and deterministic, but the resulting `dedupe_key` may
  collide with a genuine midnight event. Document this as a known limitation.

**c) `image_url` validation (gap DB-R2-07):**
Add to NORMALISATION.md Step 1: `imageUrlGuess` is stored as `image_url` only if it is a
valid absolute HTTPS URL (same check as `isValidHttpsUrl()`). Any non-empty string that
fails this check must be set to null before the canonical event is written. This prevents
`has_image = true` for relative paths, `"N/A"`, `"https://"`, or other malformed values
from scrapers.

Do not implement yet.

**Acceptance criteria:**
- NORMALISATION.md Step 1 specifies the UTC conversion requirement, the midnight
  placeholder convention, and the image_url HTTPS validation requirement.
- No connector can legitimately leave `start_at` populated with a naive local timestamp.
- No connector can produce `has_image = true` for a non-HTTPS or malformed `image_url`.

---

### C6 — Pin festival detection with red tests

**Files:** `packages/core/src/festivals/festivals.test.ts` (already exists or create new),
`docs/FESTIVALS.md` (verify contract is precise enough)

Instruction:
First check whether `docs/FESTIVALS.md` specifies the detection algorithm precisely enough
to implement without guessing. If it doesn't, add the missing detail before writing tests.

Then write red tests covering:
- festival detection from explicit source/category signal
- festival detection from known festival name mapping
- date-window validation — event within window attaches
- event outside the window does not attach
- priority when multiple festivals might match (closest date window wins, or most
  matches wins — specify which)
- `is_festival_event` must follow `festival_id`, not the other way around

Stop after docs check and red test.

**Acceptance criteria (gap DB-R2-06):**
- Tests explicitly cover: an event whose `start_at` falls outside the festival date
  window must NOT have `festival_id` set in the canonical record. There is no DB-level
  guard (application-code-only). The test is the only enforcement mechanism, so it
  must exist.

---

## Task Group D — Deduplication and lifecycle contracts

These are documentation-only tasks (no code). All can run in parallel.

### D1 — Specify fuzzy-match threshold

**Files:** `docs/DEDUPLICATION.md`

Update `docs/DEDUPLICATION.md` to state:
- threshold = `0.35`
- rationale: low enough to catch "Sub Club: Optimo" / "Optimo at Sub Club", high
  enough not to flood queue with different-event pairs
- whether it is global or per-source (global for Phase 1)
- how duplicate `event_merge_candidates` rows are prevented
  (unique constraint on `(event_id_a, event_id_b)`)
- expected false-positive and false-negative trade-off

Do not implement fuzzy matching yet.

**Acceptance criteria:**
- An agent can implement `find_fuzzy_merge_candidates()` without inventing a threshold.
- DEDUPLICATION.md worked examples are consistent with 0.35.

---

### D2 — Specify rescheduled event handling

**Files:** `docs/NORMALISATION.md` (Step 8 update path), `docs/DEDUPLICATION.md`

Update with the full reschedule/update path covering:
- `external_events` row already has `event_id` set
- incoming `dedupe_key` differs from the existing canonical event's key
- safe path: update the canonical event's `dedupe_key`, `start_at`, `availability` in place
- unsafe path: new key collides with a different canonical event → flag `needs_review = true`
  and surface as a merge candidate
- old canonical row must not remain `visibility = 'published'` as a ghost duplicate
- `availability = 'rescheduled'` must set `needs_review = true`

**Acceptance criteria:**
- A future test can assert: one event ingested → rescheduled → re-ingested → one canonical event,
  not two published rows.

---

### D3 — Define upstream removal/cancellation propagation

**Files:** `docs/INGESTION.md`, `docs/PUBLISHING.md`

Define clearly:
- `N missed runs` per tier:
  - Tier 1 API: 3 consecutive missed successful runs
  - Tier 2 RSS/iCal/Apify: 3 consecutive missed successful runs
  - Tier 3 HTML: 5 missed successful runs (Tier 3 sources are more volatile)
- When `external_events.is_deleted = true` is set
- When canonical `events.visibility` transitions to `'hidden'`
- Multi-source scenario: event hidden only when **all** linked external events are deleted
  or cancelled, unless a high-trust (Tier 1) source explicitly sends `availability =
  'cancelled'` — in that case, hide regardless
- How `ingest_alerts` should report sustained drops vs. single-run anomalies

**Acceptance criteria:**
- No "N missed runs" placeholder remains anywhere in docs.
- Lifecycle propagation is implementable as a Trigger.dev sweep subtask.
- Multi-source cancellation behaviour has a documented decision.

---

### D4 — Specify doors-vs-show-time dedupe policy

**Files:** `docs/DEDUPLICATION.md`

Document the policy for events where one source uses doors time and another uses show time,
typically resulting in adjacent-hour same-venue same-title events:

- Specify: are they auto-merged or always sent to human review?
- Specify: which time field takes precedence in the canonical event (`start_at` vs `doors_at`)?
- Define the fuzzy candidate logic for adjacent-hour pairs at the same venue.

Recommended decision: send to merge candidate queue (human review), do not auto-merge,
because merging on time ambiguity is high-risk for Glasgow live music. Document rationale.

**Acceptance criteria:**
- DEDUPLICATION.md has a "Doors vs show time" section.
- The policy is implementable without further guessing.

---

### D6 — Document `auto_create_venue()` race condition under parallel Trigger.dev tasks

**Files:** `docs/NORMALISATION.md` (Step 2 note), `docs/DEDUPLICATION.md` (or a new ops note)
**Current gap:** `auto_create_venue()` uses `random()` for slug collision resolution and has
a documented race condition in the schema. Under sequential single-connector normalisation
this was acceptable. Under Trigger.dev where each connector runs as a separate parallel task,
two connectors that encounter the same unknown venue simultaneously will each call
`auto_create_venue()` and create two separate `venues` rows with different UUIDs and different
random slugs. This produces two different `dedupe_key` values for the same event and generates
merge candidates for every event at that venue indefinitely. (BE-R1-12)

Instruction:
Update `docs/NORMALISATION.md` Step 2 with a "Concurrency note":

- The race condition is real under Trigger.dev parallel connector tasks.
- **Phase 1 mitigation:** use a Postgres advisory lock on `hashtext(normalised_venue_name)`
  inside `auto_create_venue()` to serialise concurrent venue creation for the same name.
  This is a one-function migration change; include it in CC-NEW-1 or a follow-on migration.
- Alternatively, document that Phase 1 connectors run sequentially within a single sweep
  invocation (fan-out by task ID, not concurrent execution) — if true, state this in the
  Trigger.dev task design so an agent does not inadvertently introduce parallelism.
- Also replace `random()` slug suffix with a deterministic sequential counter suffix
  (same pattern as `events.slug`), so venue stubs are reproducible.

Do not implement yet.

**Acceptance criteria:**
- NORMALISATION.md Step 2 documents the concurrency risk and the chosen mitigation.
- `auto_create_venue()` either uses an advisory lock or the sweep design guarantees sequential
  per-venue execution. The decision is explicit, not implicit.

---

### D5 — Document multi-room venue dedupe limitation

**Files:** `docs/DEDUPLICATION.md`

Document the known limitation: multi-room venues (SWG3 Tech Room, SWG3 Warehouse 23) share
a single `venue_id`, causing `dedupe_key` collisions for simultaneous events with similar
titles.

Specify the Phase 1 decision (one of):
- Accept as a known limitation; document SWG3 multi-room events will occasionally merge;
  rely on `needs_review = true` to surface them.
- Model sub-venues as child venue rows with `parent_venue_id` (more schema, deferred).
- Add `room_name` text field to `events` and include it as an optional component of
  `compute_dedupe_key` when non-null (smallest change, most accurate).

Mark the chosen option clearly. If deferred, park it as a Phase 1.5 task.

**Acceptance criteria:**
- DEDUPLICATION.md documents the edge case and the chosen approach.
- A task exists if any schema change is required.

---

## Task Group E — Connector pre-flights

Spike tasks only. No connector code. Each is independent and can run in parallel.

### E1 — Ticketmaster pre-flight

**Task file:** `docs/tasks/API-02.md` (update), `packages/connectors/src/api/ticketmaster/SPEC.md` (new), `packages/connectors/src/api/ticketmaster/fixtures/response.json` (new)

Must resolve:
- Glasgow geo-filter format (geohash `geoPoint` vs `latlong` + `countryCode`)
- `radius` and `unit` parameters for ~10km around city centre
- Deep paging cap (maximum 1,000 results per query) — document the 14-day rolling window
  strategy to stay within this
- Daily quota (5,000 calls) — model worst-case daily call count for Phase 1 sources
- Attribution requirements verbatim from ToS (required "Buy Tickets" button or equivalent)
- Image URL display permission and caching TTL
- Capture a real multi-event response fixture for Glasgow

**Blocks:** Ticketmaster connector build.

---

### E2 — Skiddle pre-flight

**Task file:** `docs/tasks/API-03.md` (update with sent-email date + fallback)

Must resolve:
- Send written approval request to dev@skiddle.com (document date sent)
- Non-compete clause risk assessment
- Concrete fallback strategy if refused (Gigs in Scotland? Songkick? Accept coverage gap?)

Decision: Do not wait indefinitely. Set a 2-week reply window. After 2 weeks with no
approval, escalate to fallback.

**Blocks:** Skiddle connector build.

---

### E3 — DICE.fm Apify pre-flight

**Task file:** `docs/tasks/CC-NEW-2.md` (complete per existing spec), output to
`packages/connectors/src/apify/dice/SPEC.md`

Must resolve:
- Selected Apify actor (name, URL, pinned version, maintenance status)
- Actor output schema mapped to `RawEvent` (all fields including stable `externalId`)
- Glasgow-only filtering confirmed
- ToS / robots.txt for dice.fm confirmed
- Fallback if no suitable actor exists (scope custom actor vs. accept coverage gap)

**Decision:** Never use Apify dataset item ID as `externalId`. Use upstream event ID if
available; otherwise content hash of `title | startAt | venueName`.

**Blocks:** DICE.fm connector build.

---

### E4 — Eventbrite pre-flight

**New task file:** `docs/tasks/EVENTBRITE-PREFLIGHT.md` (new), output to
`docs/connectors/eventbrite/COMPLIANCE.md`

Must resolve:
- Eventbrite ToS §5: "you agree not to scrape, crawl, or spider any page" — does this
  block the Apify actor approach?
- If scraping is prohibited: assess org-scoped API polling as alternative (API-01 Option C)
- If no viable path: document the decision to defer Eventbrite to Phase 2 / accept gap
- Actor selection (if ToS permits)

**Blocks:** Eventbrite connector. If ToS blocks, this decision removes Eventbrite from Phase 1.

---

### E5 — iCal pre-flight and parser spec

**Task file:** `docs/tasks/API-04.md` (update with is_all_day decision + schema note)

Must resolve:
- RRULE expansion: 90-day cap, UTC output for each occurrence
- Floating-time DTSTART: interpret as `Europe/London` local time, convert to UTC
- TZID-qualified DTSTART: convert to UTC using named IANA zone
- UTC DTSTART: store as-is
- VALUE=DATE (all-day) DTSTART: set `start_at = start-of-day UTC` and `is_all_day = true`
- RRULE for indefinitely-recurring events: cap at 90 days

**Decision:** Add `events.is_all_day boolean NOT NULL DEFAULT false` in CC-NEW-1. Map
iCal VALUE=DATE to `is_all_day = true`. Frontend must not display `00:00` for all-day events.

**Blocks:** Mono and Flying Duck iCal connectors.

---

### E6 — RSS source policy

**Task file:** `docs/tasks/API-05.md` (update), new `docs/RSS_SOURCE_POLICY.md` or
section in `docs/CONNECTOR_GUIDE.md`

Must resolve:
- Type A (structured event feed) vs Type B (editorial/newsletter) classification
- `sources.config.rssType` field (or equivalent)
- Confidence cap for Type B newsletters: ≤ 30
- Whether newsletter posts create draft event records or only external source links
- `startAt` absent handling for newsletter items

**Blocks:** Glasgow Art Map and venue Substack RSS connectors.

---

### E7 — HTML scraper pre-flight

**Task file:** `docs/tasks/API-06.md` (update), output to
`docs/connectors/html-preflight.md` (new)

For each Phase 1 HTML source (SWG3, St Luke's, Mono, The Flying Duck):
- `robots.txt` — document relevant Allow/Disallow for the events page path
- ToS — direct quote on automated access; prohibit = hard block
- JavaScript rendering — static HTML or requires JS (Cheerio vs Playwright)
- Trigger.dev + Playwright compatibility confirmation (does the cloud worker support Chromium?)
- Field-completeness alerting proposal: flag runs where > X% of records have null `title`
  or `start_at`

**Blocks:** All Phase 1 HTML connectors.

---

## Task Group F — Security and public-feature gates

Document only during this sprint. Do not implement unless explicitly asked.

### F1 — Public event submission gate

**Task file:** `docs/tasks/SEC-04.md` (update)

Required before any public form launches:
- Remove `WITH CHECK (true)` anon INSERT policy on `event_submissions`
- Replace with Edge Function (`/functions/v1/submit-event`) that gates insert via:
  - CAPTCHA verification
  - Per-IP rate limit (e.g. 5 per 24h)
  - Field length constraints (title ≤ 500 chars, description ≤ 5000 chars)
  - `submitter_email` format validation
  - HTML stripping (SEC-02)
- Privacy notice displayed before the email field
- Retention function for rejected/old submissions (SEC-06)

**Blocks:** Public submission form only (not Phase 1 build).

---

### F2 — Link-only enforcement

**Task file:** `docs/tasks/SEC-05.md` (update)

Required before any RA/Instagram connector:
- Migration adds `sources.is_link_only boolean NOT NULL DEFAULT false`
- Normaliser reads typed column (not JSONB key lookup)
- Normaliser enforces `summary = null`, `description = null`, `image_url = null`
  for `is_link_only = true` sources
- Test: a link-only source connector returning `summary = "..."` produces a canonical
  event with `summary = null`

**Blocks:** RA and Instagram connectors only.

---

### F3 — GDPR / retention

**Task file:** `docs/tasks/SEC-06.md` (update), `docs/OPERATIONS.md` (add section)

Required before any public form collecting email:
- Document lawful basis (likely legitimate interests)
- `delete_rejected_submissions()` retention migration
- Trigger.dev task calls retention function after daily sweep
- DSAR process documented in OPERATIONS.md
- Privacy notice link confirmed for all forms

**Blocks:** Public form deployment only.

---

## Task Group G — Orchestration

### G1 — Define and implement Trigger.dev sweep orchestration

**Task file:** New `docs/tasks/INF-03-SWEEP.md` (new, or update `docs/tasks/INF-01.md`)
**Depends on:** B2, B3, B4 (stable Source, SourceType, RawEvent types)

Scope:
1. Read all `sources WHERE enabled = true` from Supabase
2. For each source: instantiate the matching connector by slug
3. Call `connector.run()` — wrap in try/catch, never throw
4. Write `ingest_runs` row (status, fetched_count, parsed_count, errors_count)
5. Upsert `external_events` rows (by `source_id, external_id`); update `last_seen_at`
6. Apply break detection: compare `parsed_count` to 14-day rolling median
   - If first run (< 14-day history) and `parsed_count = 0`: emit `cold_start_zero` alert
   - If `parsed_count < 0.30 * median`: emit `count_drop` alert
7. Continue to next source if one connector fails
8. Update `sources.last_run_at` and `sources.last_success_at` / `sources.last_error_at`

Instruction per TDD policy:
First write `trigger/tasks/orchestrate.test.ts` covering:
- one connector fails, others continue
- `ingest_runs` row written with correct counts
- `last_seen_at` updated on existing external event
- cold-start zero-result alert emitted
- count-drop alert emitted when parsedCount < 0.30 * median

Stop after the red tests.

**Acceptance criteria:**
- Sweep task is not a stub; it runs all enabled connectors
- `ingest_runs` has one row per connector per run
- `last_seen_at` is updated on re-ingest
- Trigger.dev cron schedule is set in `trigger.config.ts`

---

## Task Group H — Stale task cleanup

Documentation fixes only. All are quick and can run in parallel.

### H1 — Clean stale task files

**Files:**
- `docs/tasks/INF-01.md` — remove Steps 5 and 6 (creating `packages/ingestion` and
  `packages/publishing`). Add a step for `trigger/` scaffolding with `trigger.config.ts`.
  Update acceptance criteria.
- `docs/tasks/CC-NEW-2.md` — fix `is_active` → `enabled`, remove `base_url`,
  confirm field names match `sources` table.
- `packages/connectors/CLAUDE.md` — remove stale "add apify later" note
  (already done; verify it's gone).
- `docs/tasks/BE-03.md` — mark doc-creation part as done; scope only to seed migration.
- `docs/tasks/BE-13.md` — mark as superseded by NORMALISATION.md; scope only to
  creating `ConfidenceInputs` type in `packages/shared`.
- `package.json` root scripts — verify no script references removed packages.

**Acceptance criteria:**
- No task file instructs creation of `packages/ingestion` or `packages/publishing`.
- No task SQL uses `is_active` or `base_url` for the `sources` table.
- BE-03 and BE-13 are consistent with NORMALISATION.md.

---

## R6 remaining items — classify before Sprint 1

Before Sprint 1 begins, classify each item below as:
- **A** — blocks connector/normaliser code
- **B** — blocks public frontend launch
- **C** — blocks specific connector only
- **D** — Phase 1.5 / Phase 2 hardening

| Item | Suggested class |
|---|---|
| `archive_past_events()` invocation schedule (Trigger.dev task) | A — stale events will be served |
| `external_events` archival / cleanup policy | D |
| Service role key rotation runbook in OPERATIONS.md | D |
| Ticketmaster image/attribution public display gate (SEC-10) | B |
| Supabase `auto_create_venue()` SECURITY DEFINER + restricted EXECUTE | D |
| `moderation_log` append-only trigger | D |
| Anon key browser-exposure threat model (OPERATIONS.md) | B |
| `event_submissions` stored XSS sanitisation (SEC-02) | B |
| SSRF validation for `source_url` (SEC-03) | B |
| Venue claim OTP verification (SEC-11) | D — Phase 2 |
| GIN index on `external_events.tags_guess[]` (DB-R2-13) | D — diagnostic queries only, not blocking |

---

## Recommended execution waves

### Wave 0 — Planning (this document)
Use this prompt. Claude produces the task breakdown, dependency order, and agent assignment
plan. No code. Review and approve the list before any implementation.

### Wave 1 — Contract stabilisation (run small parallel agents)
- A1 migration plan update
- B1, B2, B3, B4, B5 type/schema alignment
- D1, D2, D3, D4, D5 lifecycle/dedup docs
- H1 stale task cleanup

### Wave 2 — Red tests
- C1, C2, C3, C4, C5, C6 (one agent per test file, all in parallel)
- G1 red tests for sweep orchestration

### Wave 3 — Minimal implementation
Only after red tests are reviewed: "Now implement the smallest production code needed."
Order: C1 → C4 → C2 → C3 → C5 → C6 → G1

### Wave 4 — Connector pre-flights (parallel)
E1–E7 run simultaneously as research/spike agents.

### Wave 5 — First connector
Start with the lowest-risk confirmed connector. Likely Ticketmaster (after E1 resolves),
or a fixture/iCal connector if the parser spec (E5) is clearer.

---

## Definition of done for Phase 0.5

Phase 0.5 is complete when:

- [ ] A1: CC-NEW-1 migration written, `pnpm db:reset` passes, BST/UTC assertion passes
- [ ] A2: Internal RLS deny tests pass against local Supabase
- [ ] B1: `EventCategory` matches 13 SQL slugs
- [ ] B2: `Source` interface matches `sources` table
- [ ] B3: `SourceType` includes `'apify'` in all locations
- [ ] B4: `RawEvent` includes all 17 fields
- [ ] B5: `source_type_category_map` seed migration exists and applies
- [ ] C1: `validate.ts` exists, connector tests pass
- [ ] C2: `calculateConfidence.test.ts` (red) written, one canonical formula
- [ ] C3: `mapSourceCategoryToEventType.test.ts` (red) written
- [ ] C4: venue normalisation tests pass (SQL/TS equivalence verified)
- [ ] C5: `mergeExternalEventIntoCanonicalEvent.test.ts` (red) written, merge table in docs
- [ ] C6: `festivals.test.ts` (red) written
- [ ] D1: fuzzy-match threshold 0.35 in DEDUPLICATION.md
- [ ] D2: rescheduled event handling specified in NORMALISATION.md
- [ ] D3: upstream removal/cancellation N-runs per tier defined
- [ ] D4: doors-vs-show-time policy documented
- [ ] D5: multi-room venue limitation documented or parked
- [ ] E1–E7: pre-flight spikes run (some may return blocking findings)
- [ ] F1–F3: task files updated (not implemented)
- [ ] G1: sweep orchestration red tests written
- [ ] H1: stale task files cleaned

When all boxes are ticked, Phase 1 connector and normaliser implementation can begin.
