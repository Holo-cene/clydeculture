> **ARCHIVED 2026-06-13.** Migrated to issue #15 (ADR 0005 A6: submission model design — design-only). See `docs/tasks/MIGRATION_TRIAGE.md`.

# 23 — Community Submission & Moderation Model — Design Preflight (ADR 0005 A6)

## Purpose

Design the community submission and moderation model — treated as a **core source**,
not a Phase-2 luxury. Specify the shape for submit event/venue/organiser, the
repeat-event helper, submission↔ingestion reconciliation, moderation states, and
submitter PII/GDPR — so the long tail (DIY gigs, collectives, workshops, zine fairs,
markets) is covered.

**Design only. Build deferred** to the submission milestone. This prompt produces an
accepted design and build plan; it does **not** write migrations or code.

---

## Skill / Agent

Spawn an **Explore** subagent to read the current submission path, schema, and the
existing task briefs. Read-only.

## Parallelization

After prompt `17`. Independent of the other Phase E prompts. Feeds the submission build
prompts (future) and `apps/web` submission form.

---

## Context

A partial submission path exists: an `event_submissions` table and a public-insert RLS
policy (verify in `supabase/migrations/` and `docs/PUBLISHING.md`). The broader model is
not built. Reference — do **not** duplicate — the existing task briefs:
`docs/tasks/phase-0.5/F1-public-submission-gate.md`,
`F2-link-only-enforcement.md`, `F3-gdpr-retention.md`. The target model is in
`docs/SUBMISSIONS.md`.

Key design forces:
- Community content is original to the submitter (lighter link-first content limits),
  but a `source_url` is still requested.
- An approved submission is high **trust** (ADR 0006) even when completeness is modest —
  it must not be suppressed for lacking a ticket URL/known venue.
- A submission may **duplicate or enrich** an ingested event — reconcile, don't twin
  (`docs/DEDUPLICATION.md`).
- Submitter emails + community PII (home-address venues) carry GDPR obligations now.
- The platform targets **1–3 hr/month** moderation — design for trusted submitters and
  good duplicate detection, not daily attention.

> Verify all current schema/columns against the migrations; phrase anything unverified
> as a target/design concern, not current state.

---

## Files to Inspect

- `docs/SUBMISSIONS.md` — the target model
- `docs/tasks/phase-0.5/F1-public-submission-gate.md`, `F2-link-only-enforcement.md`, `F3-gdpr-retention.md`
- `supabase/migrations/*` — `event_submissions`, its RLS, `moderation_log`
- `docs/PUBLISHING.md` (submission insert), `docs/DEDUPLICATION.md` (reconciliation),
  `docs/DATA_MODEL.md` (community tables)

---

## Task Instructions

1. Specify the submission tables/extensions for: submit **event**, submit **venue**,
   submit **organiser** (`docs/ENTITIES.md`), with the minimum submitter PII needed.

2. Specify the **repeat-event helper** (how a weekly/monthly event is submitted once and
   expands to occurrences — interacts with ADR 0005 B1 work/occurrence).

3. Specify **moderation states** (submitted → needs_review → approved/rejected/spam),
   the queue, trusted-submitter fast-tracking, and `moderation_log` use.

4. Specify **submission↔ingestion reconciliation**: dedupe at submission against
   canonical `events`; on match, enrich (respecting field-locks, ADR 0007) rather than
   create a twin.

5. Specify **claim/edit** for venues/organisers (relate to Phase 2 venue claims),
   **spam/abuse** controls, and **takedown/correction** routes.

6. Specify **PII/GDPR retention** (ref F3): minimum data, retention/deletion, never
   exposing submitter contact via RLS, home-address handling.

7. State the **admin workload budget** assumptions (1–3 hr/month) the design must meet.

8. Produce a **build plan** sequenced as future red/impl prompts. Do not write them.

9. Record the accepted design into `docs/SUBMISSIONS.md` and `docs/DATA_MODEL.md`.

---

## Non-Goals

- Do not write migrations, code, or the `apps/web` form.
- Do not duplicate F1/F2/F3 — reference them.
- Do not weaken link-first for non-submission sources.

---

## Validation Commands

None — design/inspection only.

---

## Required Output Format

Submission shape; repeat helper; moderation states; reconciliation; claim/edit + spam +
takedown; PII/GDPR; admin-budget fit; build plan (future prompts); docs to update.

---

## Acceptance Criteria

- [ ] Submission shape covers event/venue/organiser + minimum PII
- [ ] Repeat-event helper specified (ties to B1 occurrences)
- [ ] Moderation states + reconciliation (enrich-not-twin, respects locks) specified
- [ ] PII/GDPR retention specified (refs F3); no public exposure of submitter contact
- [ ] Admin 1–3 hr/month fit addressed
- [ ] Build plan sequenced (build deferred); `docs/SUBMISSIONS.md` updated
- [ ] No code, schema, or test changes; unverified claims phrased as design concerns
