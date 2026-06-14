# ADR 0006: Confidence as trust × completeness

- **Status:** accepted
- **Date:** 2026-06-11
- **Deciders:** Clyde Culture core

## Context

Today confidence is a single 0–100 integer. The base score comes from the source tier
(Tier 1 = 50 … Tier 4 = 20) plus additive inputs for having a start time, a resolved
venue, a classified type, a multi-word title, a URL, and cross-source corroboration
(`docs/NORMALISATION.md` Step 4). The public gate is `confidence >= 60`
(`docs/PUBLISHING.md`).

This single score collapses two genuinely different questions:

1. **Is this event real?** (trust) — do we believe the listing is a true, non-spam
   event from a source we trust?
2. **Is it complete enough to display well?** (completeness) — does it have the fields
   a good listing needs (time, venue, type, link)?

Because the two are merged, a *real* grassroots event can be suppressed for being
*under-described* rather than untrustworthy. Worked from the live scoring table: a
Tier-3 scraped DIY gig (base 30) with a start time (+10) and a URL (+5) and a sensible
title (+5), but at a newly auto-created venue (venue_resolved = 0) and with a fallback
category (type_classified = 0), scores 50 and is hidden — even though we have no doubt
it is a real gig. That outcome is in direct tension with hard rule #7 ("a free zine
fair sits at the same visual and editorial weight as a ticketed opera").

The mission is all-event coverage including DIY, community, markets, and free informal
happenings — exactly the events that are real but sparsely described, often with no
ticket URL, no known venue, and an informal title.

## Options considered

1. **Lower the single threshold globally.** Simple, but publishes genuinely
   low-trust/spam records alongside grassroots ones — it lowers the bar for everything.
   Rejected.
2. **Special-case grassroots sources with a floor on the single score.** A patch; still
   conflates the two questions and needs ever-growing exceptions. Rejected (this was the
   earlier "grassroots policy" framing in ADR 0005 A3; it is superseded by this ADR).
3. **Split confidence into two signals — trust and completeness — and gate on both.**
   Chosen.

## Decision

Model confidence as **two separate signals**:

- **Trust** — "is this event real?" Derived from source tier/class, source trust level,
  corroboration, and moderation/submission provenance. A trusted partner, a known venue
  feed, or a reviewed community submission can be high-trust regardless of field richness.
- **Completeness** — "is it complete enough to display?" Derived from presence/quality of
  the displayable fields (start time, venue, type, link, etc.). This is a quality signal,
  not a trust signal.

**Minimum viable public event.** An event is eligible for public display when it clears
a **trust** bar **and** a **minimum completeness** bar. The minimum viable public event
is the smallest set of fields needed to be useful and honest to a reader — at least: a
title, a start date/time (or an explicit date-only / TBA state), a link
(`externalUrl`), and a location signal (a venue, a place, or an explicit "location TBA"
/ online). Crucially, **lacking a ticket URL, an image, a known/resolved venue, or
commercial source richness must not by itself suppress a real event.**

Public display must not suppress real grassroots events for being under-described. Where
a real event is below the completeness bar, prefer surfacing it with a clear "details to
be confirmed" treatment over hiding it, subject to the minimum viable public event above.

## Consequences

- **`calculateConfidence`** (`packages/core/src/normalise/normalise.ts`) is reworked to
  produce two signals (or a trust score plus a completeness score) rather than one
  blended number. `confidence_inputs` records both breakdowns.
- **The publishing boundary** (`docs/PUBLISHING.md`, the `events` RLS policy) changes
  from a single `confidence >= 60` to a trust-and-minimum-completeness gate.
  `docs/NORMALISATION.md` Step 4 is updated to match; this ADR supersedes the
  single-score framing there and the grassroots-floor idea in ADR 0005 A3.
- **Easier:** real DIY/community/free events stop being filtered out for being sparse;
  trust and quality can be tuned independently; partner/community/editor sources
  (`docs/INGESTION.md`) carry trust without needing commercial field richness.
- **Harder / to watch:** two signals are more to reason about than one; the
  completeness bar must stay low enough to include grassroots events but high enough to
  avoid useless listings.
- **Non-goals / not in this docs-only change:** no code, schema, RLS, or tests are
  changed here. The split is specified for implementation via the prompt library
  (`docs/prompts/20`). The exact trust/completeness weights are derived during
  implementation from the live scoring, not fixed in this ADR.

See ADR 0005 (umbrella data-model decision) and ADR 0007 (editorial override &
field-locking, which interacts with trust via human review).
