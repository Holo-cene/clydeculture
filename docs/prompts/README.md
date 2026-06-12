# Clyde Culture Prompt Library

Reusable prompts for test-driven development of the Clyde Culture engine.
Only prompts whose outcomes have not yet landed belong here. Completed prompts
are in `docs/prompts/archive/completed/`.

## Proof-Level Reminder

| Level | What it proves | Status |
|---|---|---|
| Public display | Astro renders events from Supabase via anon key | Done (demo seed) |
| Seeded demo data | 10 events from `seed.sql` reach `visibility = 'published'` | Done |
| Connector parser | Ticketmaster + Data Thistle fixtures parse to `RawEvent[]` | Done |
| Fixture E2E | Fixture → `external_events` → canonical `events` → public query | Done |
| Live Ticketmaster | Real API key, real Glasgow events | Not established |

---

> **Re-scoped 2026-06-11.** A review found the codebase had moved past Audit 2:
> M-3 (field writes), M-4 (TBA threading), `calculateConfidence`, and
> `mapSourceCategoryToEventType` are already implemented. The earlier prescriptive
> prompts (old 12–16) baked in stale values/paths and would have regressed working
> code — they were removed. The library below is findings-driven: prompt `11`
> decides what (if anything) prompt `12` does. See `docs/LESSONS.md`.

## Phase A — Normalisation: Audit + Remediate

Run `11` first; it is the gate. `12` acts only on gaps `11` confirms — it may be a
no-op if the pipeline is already field-complete.

| File | Purpose | Sequence |
|---|---|---|
| [11-normalisation-gap-audit.md](11-normalisation-gap-audit.md) | Produce a file:line gap list; no code changes | Run first |
| [12-remediate-confirmed-normalisation-gaps.md](12-remediate-confirmed-normalisation-gaps.md) | Fix only confirmed gaps (TDD two-step, non-prescriptive) | After 11 |

## Phase B — Cross-Source Merge (C5)

Genuinely greenfield: `mergeExternalEventIntoCanonicalEvent` does not exist yet.

| File | Purpose | Sequence |
|---|---|---|
| [13a-merge-behaviour-red-tests.md](13a-merge-behaviour-red-tests.md) | Update NORMALISATION.md Step 8 + red tests | Independent of 12 |
| [13b-merge-behaviour-implementation.md](13b-merge-behaviour-implementation.md) | Implement merge logic | After 13a |

## Phase C — Removal / Cancellation Lifecycle (BE-02 / A2-006)

Confirmed unimplemented: no removal/archival handling exists in the sweep path.

| File | Purpose | Sequence |
|---|---|---|
| [14a-removal-lifecycle-red-tests.md](14a-removal-lifecycle-red-tests.md) | Red tests for cancellation + disappearance archival | Independent of 12, 13 |
| [14b-removal-lifecycle-implementation.md](14b-removal-lifecycle-implementation.md) | Implement lifecycle; wire into sweep | After 14a |

## Phase D — RSS Connector (first new source)

| File | Purpose | Sequence |
|---|---|---|
| [15-rss-source-preflight.md](15-rss-source-preflight.md) | Assess RSS feasibility for Glasgow venues; no code | After 11 |
| [16a-rss-connector-red-tests.md](16a-rss-connector-red-tests.md) | RSS connector: red tests | After 15 |
| [16b-rss-connector-implementation.md](16b-rss-connector-implementation.md) | RSS connector: implement + wire to sweep | After 16a |

## Phase E — Cultural-Graph Data Model (ADR 0005 / 0006 / 0007)

Foundational model expansion toward a **cultural graph** to house *all* Glasgow events
(DIY → festivals → cinema) and prepare for Scotland. Land the NOW items **before** the
connector build-out populates single-source / single-venue / single-category /
single-link data. Gated by prompt `17`. See
[ADR 0005](../decisions/0005-event-data-model-for-all-event-coverage.md),
[ADR 0006](../decisions/0006-confidence-trust-and-completeness.md),
[ADR 0007](../decisions/0007-editorial-override-and-field-locking.md).

**Revised priority order** (also in ADR 0005 and `ROADMAP.md` Milestone 6.5):
1 links (18) · 2 confidence split (20) · 3 field-locking (22) · 4 multi-type (19) ·
5 submission model (23) · 6 organisers/collectives (24) · 7 work/occurrence (21) ·
8 geography · 9 media · 10 entry/access · 11 shed Webflow denorm.

| File | Purpose | Sequence |
|---|---|---|
| [17-data-model-expansion-design-audit.md](17-data-model-expansion-design-audit.md) | Schema-verified build specs for the whole expansion; no code | Gate; run first |
| [18a-event-links-rls-red-tests.md](18a-event-links-rls-red-tests.md) · [18b](18b-event-links-rls-implementation.md) | A1: all source/ticket links per event + public RLS | After 17 |
| [20-grassroots-confidence-policy.md](20-grassroots-confidence-policy.md) | A3 / ADR 0006: confidence trust × completeness split | After 17; parallel with 18, 19 |
| [22a-field-locking-red-tests.md](22a-field-locking-red-tests.md) · [22b](22b-field-locking-implementation.md) | A5 / ADR 0007: field-locking — **before heavy re-normalisation (conflicts with `12`)** | After 17 |
| [19a-multi-category-red-tests.md](19a-multi-category-red-tests.md) · [19b](19b-multi-category-implementation.md) | A2: multi-category events (event↔types join) | After 17; parallel with 18, 20 |
| [23-submission-model-design.md](23-submission-model-design.md) | A6: community submission + moderation — **design only, build deferred** | After 17 |
| [24-entities-design.md](24-entities-design.md) | B2a: organisers/collectives/artists entities — **design only, build deferred** | After 17 |
| [21-work-occurrence-showings-design.md](21-work-occurrence-showings-design.md) | B1: work/occurrence (cinema showings) — **design only, build deferred** | After 17 |

*Tranche A4 (geography: neighbourhood now, `places` graph designed) and A7 (source
classes + provenance) are folded into prompt `17`'s recommended migration. Tranche B
build and Tranche C (accessibility, entry-model, faceted search — `docs/SEARCH.md`,
`docs/MEDIA_POLICY.md`) are deferred — see ADR 0005 and `ROADMAP.md` Milestones 6.5 /
7.5.*

---

## Utility Prompts

| File | Purpose |
|---|---|
| [00-repo-status-reassessment.md](00-repo-status-reassessment.md) | Reusable audit after any implementation branch |
| [01-mvp-acceptance-review.md](01-mvp-acceptance-review.md) | Verify seeded demo is still demoable |
| [06-ingestion-orchestration-review.md](06-ingestion-orchestration-review.md) | Review sweep wiring before live multi-connector ingestion |
| [99-prompt-writing-standards.md](99-prompt-writing-standards.md) | Standards for this prompt library |

---

## Archived

- `archive/completed/` — prompts whose requested outcome has landed (includes
  `02-package-boundary-cleanup.md` — M-2 complete; `packages/ingestion` exists)
- `archive/historical/` — old master prompt logs (traceability only; do not rerun)

---

## Standards

See [99-prompt-writing-standards.md](99-prompt-writing-standards.md) for rules that
apply when writing or updating prompts in this library.
