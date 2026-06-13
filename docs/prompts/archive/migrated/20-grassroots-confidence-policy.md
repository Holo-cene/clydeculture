> **ARCHIVED 2026-06-13.** Migrated to issue #25 (ADR 0006 confidence trust × completeness split). See `docs/tasks/MIGRATION_TRIAGE.md`.

# 20 — Confidence: Trust × Completeness Split (ADR 0006)

## Purpose

Implement the confidence reframe in
[ADR 0006](../decisions/0006-confidence-trust-and-completeness.md): split the single
0–100 score into a **trust** signal ("is this event real?") and a **completeness**
signal ("is it complete enough to display?"), and change the public gate to a *trust
bar* AND a *minimum-completeness bar* (the "minimum viable public event"). The outcome
is the grassroots protection: a real free/DIY/community event is **not** suppressed for
lacking a ticket URL, image, or known venue — protecting hard rule #7 ("a free zine fair
sits at the same visual and editorial weight as a ticketed opera").

This is a scoring + gate change. Follow the TDD two-step: write the failing test for the
agreed split, then implement.

---

## Skill

Use `/implement-test-first` for Step 1. Use `/run-checks` + `/code-review low` for Step 2.

## Parallelization

After prompt `17` (which identifies, from the live scoring, exactly which profiles fall
below 60). Independent of `18`, `19`, `21`.

---

## Context

`calculateConfidence` (`packages/core/src/normalise/normalise.ts`) and the public
boundary (`confidence >= 60` in `packages/shared/src/db/publicQueries.ts`) together
decide what the public sees. Prompt `17`'s audit shows concrete profiles that score
below 60 — typically Tier-3 scraped events at auto-created/unresolved venues with a
fallback type and no ticket URL: precisely the grassroots gigs and community events the
platform most wants to surface.

Approved submissions already write `confidence = 100` (ROADMAP Milestone 5), so the
community-submission path is partly protected. The gap is **ingested** grassroots
events from scrapers/feeds.

> Do not invent the weights from this prompt. Use the profiles and scores prompt `17`
> derived from the live code, and the split defined in ADR 0006. Confirm with the
> maintainer if ambiguous before encoding (CLAUDE.md: stop and propose the contract
> rather than guess).

The design (ADR 0006):
- **Trust** = "is this event real?" — from source class/trust (`api/feed/scrape/partner/
  community/editor`), corroboration, and moderation/submission provenance. A reviewed
  community submission or a known feed is high-trust regardless of field richness.
- **Completeness** = "ready to display?" — from displayable-field presence/quality
  (start time, venue/place, type, link). Lacking a ticket URL / image / known venue must
  **not** by itself suppress a real event.
- **Gate** = trust bar AND minimum-completeness bar (the "minimum viable public event":
  title + start/date-or-TBA + `externalUrl` + a location signal). `needs_review` still
  catches genuinely low-signal records; the global bar is not lowered.

---

## Files to Inspect

- Prompt `17`'s grassroots-gate findings (the below-60 profiles)
- `packages/core/src/normalise/normalise.ts` — `calculateConfidence`, `ConfidenceInputs`
- `packages/shared/src/db/publicQueries.ts` — the `confidence >= 60` boundary
- `docs/NORMALISATION.md` Step 4 — the confidence spec (update if the rule changes)
- `docs/PUBLISHING.md` — the publish gate description
- `supabase/migrations/*` — any DB-side default/threshold (e.g. seed `sources.config`)

---

## Task Instructions

### Step 1 — Red test (no production code)

1. Encode the agreed policy as failing tests in
   `packages/core/src/normalise/calculateConfidence.test.ts` (and a publish-boundary
   test in `packages/shared` if the gate itself changes). For example, per the policy:
   - a free, unticketed community event no longer scores below 60 solely for lacking a
     ticket URL, **and**
   - a genuinely low-signal record (no date, junk title) still scores below 60 / sets
     `needs_review` — the bar is not lowered globally.
2. Derive expected scores from the live formula + the policy, not from this prompt.
3. Run; confirm failures. Pause and report.

### Step 2 — Implementation

4. Make the smallest change to `calculateConfidence` (and/or the documented gate) to
   satisfy the policy. Keep `needs_review` and the low-signal floor intact.
5. Run:
   ```bash
   pnpm --filter @clydeculture/core test
   pnpm --filter @clydeculture/shared test
   pnpm test && pnpm typecheck && pnpm lint
   ```
6. Update `docs/NORMALISATION.md` Step 4 and `docs/PUBLISHING.md` to match the new rule,
   and add a `docs/DECISIONS_LOG.md` entry stating the policy and its rationale (hard
   rule #7).

---

## Non-Goals

- Do not globally lower the `confidence >= 60` threshold (that would publish junk).
- Do not weaken `needs_review` for genuinely low-signal records.
- Do not change tier base scores arbitrarily — change only what the policy requires.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/core test
pnpm --filter @clydeculture/shared test
pnpm test && pnpm typecheck && pnpm lint
```

---

## Acceptance Criteria

- [ ] Policy chosen with the maintainer (or the obvious recommendation from prompt `17`), recorded in `docs/DECISIONS_LOG.md`
- [ ] Tests show grassroots/free/unticketed events clear the gate per the policy
- [ ] Tests show genuinely low-signal records still fall below / set `needs_review`
- [ ] The global threshold is not lowered
- [ ] `docs/NORMALISATION.md` Step 4 + `docs/PUBLISHING.md` updated to match
- [ ] No previously passing test regressed
