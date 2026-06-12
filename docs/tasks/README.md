# Engineering Backlog

This folder now contains only active or intentionally retained task briefs. Completed
and superseded files were moved under `docs/tasks/archive/` so old build prompts do not
look like current work.

Use `docs/tasks/phase-0.5/README.md` for the current stabilisation sprint. The top-level
files below are retained when they still define an unresolved contract, a future phase
gate, or detailed background that a phase task depends on.

## How To Use

1. Open the relevant task file and read it in full.
2. Verify the current repo state before treating the task as open.
3. Follow the TDD policy in `AGENTS.md` for any implementation work.
4. Update this README when a task is completed, superseded, or no longer needed.

Do not run archived prompts or tasks as-is. They are evidence, not active instructions.

## Active Top-Level Tasks

| File | Needed? | Why retained | Missing or blocker |
|---|---|---|---|
| [API-03.md](API-03.md) | Yes | Skiddle still needs a legal/commercial gate before connector work. | Approval status, allowed fields, quota limits, and SPEC/connector decision. |
| [API-04.md](API-04.md) | Yes | iCal remains a low-risk source type, but recurrence/timezone policy is unresolved. | RRULE, all-day, floating-time, cancellation, and parser test contract. |
| [API-05.md](API-05.md) | Yes | RSS policy still needs a source-contract distinction between event feeds and article feeds. | Feed-type rules, publication-date handling, required metadata, and source policy updates. |
| [API-08.md](API-08.md) | Deferred | External ID stability matters once deletion detection and repeated sweeps run. | Orphan expiry rules, hash-stability guidance, and BE-02 dependency. |
| [API-09.md](API-09.md) | Deferred | Meetup is Phase 2 only. | Current API/terms check and public-search feasibility. |
| [BE-02.md](BE-02.md) | Yes | Deleted/removed upstream records need a canonical lifecycle. | Orchestrator logic, source-specific deletion signals, and tests. |
| [BE-07.md](BE-07.md) | Later | Incremental cursors may reduce quota pressure after polling connectors expand. | Run context, cursor storage, and connector interface change. |
| [BE-12.md](BE-12.md) | Yes | `auto_create_venue` still needs deterministic slug hardening. | Migration and pgTAP/concurrency coverage. |
| [BE-16.md](BE-16.md) | Yes | Festival overrides are needed before festival detection is trusted. | Schema migration and normalisation/festival-detector tests. |
| [BE-17.md](BE-17.md) | Yes | Festival failure alert types are still absent. | `ingest_alerts.alert_type` migration and alert tests. |
| [BE-19.md](BE-19.md) | Not now | Phase 1 intentionally uses `confidence >= 60`; runtime config is a later hardening task. | `platform_config` design and RLS/test updates if the threshold becomes configurable. |
| [CC-NEW-2.md](CC-NEW-2.md) | Yes | DICE Apify pre-flight remains unresolved and feeds E3. | Actor choice, terms check, fixture shape, pricing/age field mapping. |
| [DB-02.md](DB-02.md) | Deferred | Map queries may need PostGIS, but this is not a vertical-slice blocker. | Extension/geometry migration, index choice, and public query contract. |
| [DB-05.md](DB-05.md) | Partial | Public submission gating was partly handled; Phase 2 auth/venue-claim policy remains. | Confirm current RLS against migrations, then split any venue-claim work through DB-12/SEC-11. |
| [DB-06.md](DB-06.md) | Yes | Query indexes should be audited after the current schema settled. | Rewrite stale Webflow-era assumptions and add current index migration/tests if needed. |
| [DB-09.md](DB-09.md) | Yes | `SPEC.md` still needs periodic drift checks against migrations. | Current field audit, especially source/link-only fields and any post-CC-NEW-1 drift. |
| [DB-10.md](DB-10.md) | Low priority | `seed.sql` is idempotent, but reference-schema/fixture idempotency still needs review. | Decide whether any remaining non-idempotent reference inserts are real risks. |
| [DB-11.md](DB-11.md) | Later | Multi-room aliases matter when SWG3-style connectors are prioritised. | Alias seed migration and venue-resolution tests. |
| [DB-12.md](DB-12.md) | Phase 2 | Auth model is required before admin, venue claims, and submissions expand. | ADR, roles, RLS policy migration, and tests. |
| [DOC-01.md](DOC-01.md) | Partial | Ticketmaster fixtures exist in package tests, but cross-source fixture docs do not. | Decide whether source fixtures live in package folders or `docs/fixtures/`; document the convention. |
| [SEC-02.md](SEC-02.md) | Yes | Stored-XSS handling is still needed before broader ingestion/public rendering. | Sanitisation contract, tests, and rendering expectations. |
| [SEC-03.md](SEC-03.md) | Yes | Server-side fetches need URL validation before HTML/RSS/iCal expansion. | SSRF validation helper and connector/orchestrator tests. |
| [SEC-04.md](SEC-04.md) | Phase 2 | Public submissions need flood protection before launch. | Rate limit/CAPTCHA decision and RLS/function tests. |
| [SEC-05.md](SEC-05.md) | Yes | Link-only enforcement is documented but not typed in schema. | `sources.is_link_only` or equivalent migration, normaliser enforcement, and compliance tests. |
| [SEC-06.md](SEC-06.md) | Phase 2 | GDPR retention rules are required before public submissions/venue claims. | Retention schedule, deletion/anonymisation policy, and tests. |
| [SEC-07.md](SEC-07.md) | Yes | HTML scraper legality must be checked per source before scraping. | ToS/robots log, source allow/avoid decision, and compliance notes. |
| [SEC-08.md](SEC-08.md) | Later | LLM prompt injection only applies if Tier 4 extraction is introduced. | Decide whether LLM extraction is in scope; if yes, add isolation and tests. |
| [SEC-09.md](SEC-09.md) | Phase 2 | Admin MFA depends on the auth model. | Operator onboarding policy and Supabase auth configuration. |
| [SEC-11.md](SEC-11.md) | Phase 2 | Venue claim OTP verification depends on DB-12. | OTP flow, expiry, audit logging, and RLS tests. |

## Current Sprint

See [phase-0.5/README.md](phase-0.5/README.md) for active Phase 0.5 tasks and their
completion state.

## Archive

- [archive/completed/](archive/completed/) contains tasks whose requested outcome landed
  in migrations, docs, tests, package code, or ADRs.
- [archive/superseded/](archive/superseded/) contains tasks whose approach is no longer
  the current path, usually because later ADRs or schema corrections changed the design.
