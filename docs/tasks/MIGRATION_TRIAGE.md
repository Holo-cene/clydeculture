# Backlog Migration Triage (Issue #8)

> **Purpose.** Single-shot classification of every remaining active file in
> `docs/tasks/` and `docs/prompts/` against the post-ADR-0008 work model: GitHub
> issues are the source of work-truth; `docs/` holds durable knowledge only.
>
> **Vocabulary.**
>
> - **`ISSUE`** — still-live work; migrate as a vertical-slice issue.
> - **`COVERED-BY-#n`** — already represented by an existing/created issue.
> - **`SUPERSEDED`** — approach changed by a later ADR or already landed in code;
>   archive without an issue.
> - **`DESIGN-DOC`** — design-now / build-deferred; keep as reference design or open
>   a design-only issue. Build slot opens later.
> - **`HUMAN-REVIEW`** — relevance uncertain; archive and flag for the maintainer.
>   Bias is conservative — when in doubt, do not mint a speculative issue.
>
> Every `ISSUE` row gets a real `#n` once the issue is created in the
> corresponding migration commit. Every archived file carries a pointer to its
> issue or ADR. Utility/audit prompts (`00`, `01`, `06`, `99`) are **tools**,
> not backlog — retained in place.

## Phase 0.5 — Connector preflights (E2–E7)

| File | Classification | Rationale |
|---|---|---|
| `phase-0.5/E2-skiddle-preflight.md` | `DESIGN-DOC` | Skiddle remains gated on written commercial approval (API-03); design context retained but no near-term Thread alignment — no ISSUE until approval lands. |
| `phase-0.5/E3-dice-apify-preflight.md` | `ISSUE #9` | Thread #2 (Data Thistle / Apify) work — DICE actor selection + ToS + externalId rule is the first concrete preflight needed. Consolidated with `CC-NEW-2.md`. |
| `phase-0.5/E4-eventbrite-preflight.md` | `SUPERSEDED` | ADR 0003 dropped Eventbrite from Phase 1 (ToS §5 blocks scraping; v3 API deprecated). No fresh path. |
| `phase-0.5/E5-ical-parser-preflight.md` | `DESIGN-DOC` | iCal is a future Tier-2 source; recurrence/timezone parser spec is durable design but not Thread #2. |
| `phase-0.5/E6-rss-source-policy.md` | `COVERED-BY-#29` | RSS feasibility + policy fold into the RSS preflight+connector issue (prompts 15 / 16a / 16b). |
| `phase-0.5/E7-html-scraper-preflight.md` | `DESIGN-DOC` | Per-source ToS/robots checks remain a future gate; deferred until first HTML connector is scheduled. |

## Phase 0.5 — Engine red-tests (C2–C6)

| File | Classification | Rationale |
|---|---|---|
| `phase-0.5/C2-confidence-red-tests.md` | `SUPERSEDED` | `calculateConfidence` is implemented (see `docs/LESSONS.md` re-scope note 2026-06-11); the ADR 0006 reframe is what drives any *new* tests, captured in #25. |
| `phase-0.5/C3-category-mapping-red-tests.md` | `SUPERSEDED` | `mapSourceCategoryToEventType` is implemented (see same re-scope note); any keyword-fallback gap surfaces via audit, not as a separate C3 issue. |
| `phase-0.5/C4-venue-normalisation-red-tests.md` | `ISSUE #10` | Venue-name parity between TS `normaliseVenueName()` and SQL `resolve_venue()` is a live correctness pin. |
| `phase-0.5/C5-merge-behaviour-red-tests.md` | `COVERED-BY-#11` | Merge behaviour issue (prompts 13a / 13b) — C5 is the same body of work. |
| `phase-0.5/C6-festival-detection-red-tests.md` | `ISSUE #12` | Festival detector + window-mismatch alert path is still un-tested; pairs with BE-16 (override table) and BE-17 (alert type). |

## Phase 0.5 — Submission + compliance (F1–F3, G1)

| File | Classification | Rationale |
|---|---|---|
| `phase-0.5/F1-public-submission-gate.md` | `COVERED-BY-#15` | Submission model design (prompt 23 / ADR 0005 A6) — F1's anon-INSERT gate is part of that design. |
| `phase-0.5/F2-link-only-enforcement.md` | `ISSUE #13` | Hard rule #1 enforcement (typed `sources.is_link_only` + normaliser guard). Consolidated with `SEC-05.md`. |
| `phase-0.5/F3-gdpr-retention.md` | `ISSUE #14` | Lawful basis + retention policy is a launch blocker before any public form. Consolidated with `SEC-06.md`. |
| `phase-0.5/G1-trigger-sweep-orchestration.md` | `COVERED-BY-#5` | Daily scheduled Ticketmaster sweep slice — closed. |

## API tasks (03 / 04 / 05 / 08 / 09)

| File | Classification | Rationale |
|---|---|---|
| `API-03.md` | `SUPERSEDED` | Skiddle approval is upstream of any code; preflight retained via E2 design-doc. |
| `API-04.md` | `DESIGN-DOC` | iCal parser contract is durable design — covered by E5. |
| `API-05.md` | `COVERED-BY-#29` | RSS event-vs-article policy folds into the RSS preflight + connector issue. |
| `API-08.md` | `COVERED-BY-#16` | Orphan expiry depends on BE-02 removal lifecycle; same issue. |
| `API-09.md` | `SUPERSEDED` | Meetup is Phase-2-only; GraphQL feasibility is not a near-Thread concern. |

## BE tasks (02 / 07 / 12 / 16 / 17 / 19)

| File | Classification | Rationale |
|---|---|---|
| `BE-02.md` | `ISSUE #16` | Removal/cancellation lifecycle — covered by prompts 14a/14b. Consolidated with API-08. |
| `BE-07.md` | `HUMAN-REVIEW` | Incremental-sync cursor is a "Later" hardening — quota concern not yet realised on Ticketmaster-only Thread #1. |
| `BE-12.md` | `ISSUE #17` | `auto_create_venue` slug loop is a live schema correctness bug. |
| `BE-16.md` | `COVERED-BY-#12` | Folded into the festival detection issue (with C6). |
| `BE-17.md` | `COVERED-BY-#12` | Folded into the festival detection issue (with C6). |
| `BE-19.md` | `ISSUE #18` | Confidence threshold externalisation — referenced in `PUBLISHING.md`; needed before tier-specific bars. |

## DB tasks (02 / 05 / 06 / 09 / 10 / 11 / 12)

| File | Classification | Rationale |
|---|---|---|
| `DB-02.md` | `HUMAN-REVIEW` | PostGIS is a venue-map feature dependency; not a vertical-slice blocker. Open to maintainer judgement. |
| `DB-05.md` | `COVERED-BY-#15` | RLS for `event_submissions` + `venue_claims` folds into ADR 0005 A6 (#15) design. |
| `DB-06.md` | `ISSUE #19` | Compound indexes for venue/festival/moderation queries are a live operator-perf concern. |
| `DB-09.md` | `ISSUE #20` | `SPEC.md` field drift against migrations is a live agent/contributor footgun. Small, mechanical. |
| `DB-10.md` | `HUMAN-REVIEW` | Idempotent seed is a low-priority hardening; `seed.sql` is already idempotent. |
| `DB-11.md` | `HUMAN-REVIEW` | Multi-room SWG3 strategy is upstream of SWG3 scheduling — not near-term. |
| `DB-12.md` | `DESIGN-DOC` | Phase 2 auth model — design slot, build deferred. |

## SEC tasks (02 / 03 / 04 / 05 / 06 / 07 / 08 / 09 / 11)

| File | Classification | Rationale |
|---|---|---|
| `SEC-02.md` | `ISSUE #21` | Stored-XSS sanitisation contract for submission → canonical events is live before any public form ships. |
| `SEC-03.md` | `ISSUE #22` | SSRF validation on `source_url` is required before any enrichment fetch or RSS/iCal/HTML expansion. |
| `SEC-04.md` | `DESIGN-DOC` | Public-submission rate limit / CAPTCHA depends on the submission form (Phase 2). |
| `SEC-05.md` | `COVERED-BY-#13` | Folded into the link-only enforcement issue (with F2). |
| `SEC-06.md` | `COVERED-BY-#14` | Folded into the GDPR retention issue (with F3). |
| `SEC-07.md` | `COVERED-BY-E7` | HTML legality fold into the HTML scraper preflight design-doc (E7). |
| `SEC-08.md` | `SUPERSEDED` | Tier 4 LLM extraction is not in scope; no sandboxing work without that decision. |
| `SEC-09.md` | `DESIGN-DOC` | Admin MFA depends on Phase 2 auth model (DB-12 design). |
| `SEC-11.md` | `DESIGN-DOC` | Venue claim OTP depends on Phase 2 auth model. |

## Top-level orphans (CC-NEW-2, DOC-01)

| File | Classification | Rationale |
|---|---|---|
| `CC-NEW-2.md` | `COVERED-BY-#9` | DICE.fm Apify preflight — folded into the E3 issue. |
| `DOC-01.md` | `HUMAN-REVIEW` | Per-source fixture directory convention — partially landed in `packages/core` tests; convention decision left for maintainer. |

## Cultural-graph prompts (11–24)

| File | Classification | Rationale |
|---|---|---|
| `11-normalisation-gap-audit.md` | `SUPERSEDED` | Audit prompt — its output is the gap list, which has already driven the post-Audit-2 state. Archive after migration; do not re-run. |
| `12-remediate-confirmed-normalisation-gaps.md` | `SUPERSEDED` | Findings-driven remediate prompt — no open gaps drive ongoing work; venue parity covered by #10. |
| `13a-merge-behaviour-red-tests.md` | `ISSUE #11` | Merge behaviour (red tests) — consolidated with C5 into one merge-behaviour issue. |
| `13b-merge-behaviour-implementation.md` | `COVERED-BY-#11` | Step-2 of the merge-behaviour issue; kept as implementation reference. |
| `14a-removal-lifecycle-red-tests.md` | `ISSUE #16` | Removal lifecycle (red tests) — consolidated with BE-02 + API-08. |
| `14b-removal-lifecycle-implementation.md` | `COVERED-BY-#16` | Step-2 of the removal-lifecycle issue. |
| `15-rss-source-preflight.md` | `ISSUE #29` | RSS preflight — consolidated with E6 + API-05 into one RSS issue. |
| `16a-rss-connector-red-tests.md` | `COVERED-BY-#29` | RSS connector red tests — same issue as 15. |
| `16b-rss-connector-implementation.md` | `COVERED-BY-#29` | RSS connector implementation — same issue as 15. |
| `17-data-model-expansion-design-audit.md` | `DESIGN-DOC` | ADR 0005 gate-prompt; kept as reference design. Not a build slot. |
| `18a-event-links-rls-red-tests.md` | `ISSUE #23` | NOW tranche A1 (event_links + public RLS) — paired with 18b. |
| `18b-event-links-rls-implementation.md` | `COVERED-BY-#23` | Step-2 of the event-links issue. |
| `19a-multi-category-red-tests.md` | `ISSUE #24` | NOW tranche A2 (event ↔ event_types join). |
| `19b-multi-category-implementation.md` | `COVERED-BY-#24` | Step-2 of the multi-category issue. |
| `20-grassroots-confidence-policy.md` | `ISSUE #25` | NOW tranche A3 / ADR 0006 (trust × completeness split). |
| `21-work-occurrence-showings-design.md` | `ISSUE #27` (design-only) | DESIGN-NOW tranche B1 (work/occurrence) — design-only issue, build deferred. |
| `22a-field-locking-red-tests.md` | `ISSUE #26` | NOW tranche A5 / ADR 0007 (field-locking — urgent before heavy re-normalisation). |
| `22b-field-locking-implementation.md` | `COVERED-BY-#26` | Step-2 of the field-locking issue. |
| `23-submission-model-design.md` | `ISSUE #15` (design-only) | DESIGN-NOW tranche A6 (submission model) — design-only issue. |
| `24-entities-design.md` | `ISSUE #28` (design-only) | DESIGN-NOW tranche B2a (organisers/collectives/artists). |

## Utility prompts (retained — not backlog)

`00-repo-status-reassessment.md`, `01-mvp-acceptance-review.md`,
`06-ingestion-orchestration-review.md`, `99-prompt-writing-standards.md` —
these are tools used during reviews/audits, not work items. Retained in
`docs/prompts/` as-is.

## End state

After all migration commits land:

1. `docs/tasks/` and `docs/tasks/phase-0.5/` contain only their READMEs (which
   point at the issue tracker and the archive).
2. `docs/prompts/` contains only utility prompts and the standards file; every
   migrated prompt lives under `docs/prompts/archive/`.
3. `docs/agents/domain.md` no longer says "the legacy backlog is being migrated"
   — it says the migration is done.
4. Every archived file carries a one-line pointer to its issue (`#n`) or to the
   ADR that superseded it.
