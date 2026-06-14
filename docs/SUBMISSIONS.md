# Community Submission and Moderation

**Status: target design (ADR 0005 Tranche A6).** Community submission is treated as a
**core data source**, not a Phase-2 luxury. This document describes the planned
submission and moderation model. The current implementation is partial — an
`event_submissions` table and a public-insert RLS path exist (see
`supabase/migrations/`, `docs/PUBLISHING.md`); the broader model below is **not** built.
Verify current state against the migrations before treating anything here as fact.

Live work is tracked in the GitHub issue tracker rather than duplicated here. The
public-insert gate and link-first enforcement are tracked in their respective
issues; PII / UK GDPR policy (lawful basis, retention schedule, DSAR process) is
documented in `docs/OPERATIONS.md` under "Data Protection (UK GDPR)" — that
section is the launch blocker for any public submission or claim form.

---

## Why submission is core

The all-event mission — DIY gigs, collectives, workshops, zine fairs, mutual aid events,
small exhibitions, markets — is exactly the long tail that APIs and scrapers miss. An
ingestion-only architecture covers ticketed/institutional events well but under-serves
the grassroots scene the platform exists to serve. Submission-first coverage is how
Clyde Culture becomes a genuine cultural noticeboard rather than another API aggregator.

Community-submitted content is **original to the submitter**, so link-first content
restrictions are lighter (the submitter's own words may be stored) — but a
`source_url` is still requested to support routing. Trust comes from moderation and
trusted-submitter status (ADR 0006), not from commercial source richness.

---

## What the model must support

| Requirement | Why |
|---|---|
| Submit **event** | DIY/community coverage |
| Submit **venue** | new grassroots spaces |
| Submit **organiser/collective** | new grassroots sources (`docs/ENTITIES.md`) |
| **Repeat-event helper** | weekly/monthly events without re-typing every date |
| **Claim / edit** a listing | reduce admin load; let venues/organisers self-correct |
| **Moderation queue + states** | prevent spam, bad or unsafe listings |
| **Duplicate detection at submission** | a submission may duplicate an ingested event |
| **Submission ↔ ingestion reconciliation** | a submission may *enrich* an ingested event |
| **Submitter contact** | clarification and trust |
| **Source URL** | supports link-first |
| **Trusted submitters** | known-good submitters publish faster |
| **PII / GDPR retention** | submitter emails + community PII (F3) |
| **Spam / abuse controls** | community submission introduces risk |

---

## Moderation states

Submissions flow through explicit states (aligning with the existing
`event_submissions.status` and `moderation_log`):

```
submitted → needs_review → approved → (creates / enriches a canonical event)
                        ↘ rejected (reason recorded)
                        ↘ spam (suppressed)
```

Approved submissions become canonical events through normalisation. Per
`docs/PUBLISHING.md`, an approved community event is high **trust** (human-reviewed)
even when **completeness** is modest — it must not be suppressed for lacking a ticket
URL or known venue (ADR 0006).

---

## Duplicate detection and submission↔ingestion reconciliation

A submitted event may already exist from a connector (someone submits their own gig
that is also on Skiddle). The submission path must:

1. **Check for duplicates** against canonical `events` at submission time (reuse the
   dedupe signals in `docs/DEDUPLICATION.md`).
2. **Reconcile, not twin.** If a match is found, the submission should *enrich* the
   canonical event (adding the organiser, accessibility, or correct venue the API
   lacked) via the moderation/merge path — not create a duplicate row.
3. **Respect editorial locks.** Reconciliation writes obey field-locks
   ([ADR 0007](decisions/0007-editorial-override-and-field-locking.md)).

See `docs/DEDUPLICATION.md` — "Submission ↔ ingestion reconciliation".

---

## Moderation, abuse, and quality

Community submission introduces risk that must be designed for: spam, duplicate and
commercial spam, low-quality descriptions, discriminatory/offensive content, fake
events, dangerous/illegal events, sensitive political/community events requiring
neutrality, takedown requests, and venue/organiser correction requests. Controls:

- rate limiting and a public-insert gate (F1);
- link-first/content limits at insert (F2);
- a moderation queue with reasons logged to `moderation_log`;
- trusted-submitter fast-tracking to keep moderator load down;
- a takedown/correction route for venues and organisers.

---

## PII, GDPR, and retention

Submissions carry personal data: submitter emails, and community events that can be a
person's **home address** (a gig in a flat). This is a compliance requirement that
shapes the schema **now**, not in Phase 2:

- store the minimum submitter PII needed for clarification/trust;
- define retention and deletion/anonymisation (see `docs/OPERATIONS.md` — "Data Protection (UK GDPR)");
- never expose submitter contact details publicly via RLS;
- treat home-address venues with care (display policy + takedown route).

---

## Admin workload budget

The platform targets **1–3 hours/month** of maintenance. The submission/moderation
model must fit that budget: trusted submitters and good duplicate detection keep the
queue small; moderation is one short review session per week at Phase 1 (Supabase
Studio), scaling with volume. Do not design moderation that requires daily attention.

---

## Phasing

| Item | Phase |
|---|---|
| Public submission gate + link-first insert (F1/F2) | Tranche A (backend) |
| Repeat-event helper, submit venue/organiser, reconciliation | DESIGN-NOW (prompt `23`), build with A6 |
| Claim/edit listing, trusted submitters | follows; venue claims already Phase 2 (ROADMAP M9) |
| PII/UK GDPR (lawful basis, retention, DSAR) | policy documented in `docs/OPERATIONS.md`; automation builds with submission |
| Public submission form in `apps/web` | after the backend model |

Design preflight: `docs/prompts/23`. Umbrella decision:
[ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md).
