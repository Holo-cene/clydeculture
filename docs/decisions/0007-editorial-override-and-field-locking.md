# ADR 0007: Editorial override and field-locking

- **Status:** accepted
- **Date:** 2026-06-11
- **Deciders:** Clyde Culture core

## Context

Clyde Culture ingests from messy sources — weak HTML, inconsistent promoter pages,
recurring club nights with drifting titles, markets with changing stallholder info,
festivals with dozens of sub-events. A human operator will inevitably need to correct
records: fix a mangled title, pin the right venue, mark the canonical record among
duplicates, set the correct category.

The ingestion pipeline re-normalises linked events on every sweep. The accepted
identity-first canonical-update behaviour (the "M-1" work; `docs/prompts/12`,
`docs/DEDUPLICATION.md` — "Reschedule", `docs/NORMALISATION.md` Step 8) means a sweep
will **overwrite** a canonical event's fields from the latest source data. Today there
is **no mechanism for a human correction to survive that overwrite** — verified against
the schema and migrations: there is no field-lock, override, or per-field provenance
column on `events`. So an operator who fixes "the old hairdressers" → "The Old
Hairdresser's" will see it silently reverted on the next sweep.

This makes human correction painful exactly where the all-event mission needs it most
(grassroots, recurring, festival, weak-source data). It is **urgent**: the longer
heavy re-normalisation work proceeds without it, the more human effort it quietly
destroys.

## Options considered

1. **No overrides; operators edit the source or wait for the source to fix itself.**
   Unworkable for community/grassroots data where the source is an Instagram post.
   Rejected.
2. **Whole-record lock (freeze an event from all updates).** Simple but blunt — a frozen
   event also stops receiving legitimate updates (a genuine reschedule, a sold-out
   badge). Rejected.
3. **Field-level locks / overrides that normalisation and merge must respect.** An
   operator locks specific fields; everything else keeps updating from sources. Chosen.

## Decision

Introduce **editorial overrides with field-level locking**:

- An operator can set an **override value** and/or a **lock** on specific fields of a
  canonical event (a `field_overrides` structure — exact shape decided at
  implementation; e.g. a JSONB map of locked fields on `events`, or a side table).
- **Normalisation, merge, and re-ingestion MUST respect locked fields.** A sweep may
  update unlocked fields freely; it MUST NOT overwrite a locked field's value.
- Lockable decisions include, at least: **title, venue, date/time, category/type,
  source priority, canonical survivor (which event is the canonical one among
  duplicates), and duplicate/merge decisions.** Marking a canonical survivor and
  rejecting a bad duplicate are themselves override decisions that must persist.
- Locks are recorded with provenance (who/when) via the existing `moderation_log`
  pattern so corrections are auditable.

**Relationship to identity-first re-normalisation.** This is the explicit guard on the
M-1 re-normalisation path. Field-locking MUST be implemented **before** heavy
sweep/re-normalisation work runs at scale, or human corrections will be clobbered.
Where the two interact, the lock wins: re-normalisation computes the new value, then
skips assignment for any locked field (and may surface a "source diverged from locked
value" review signal rather than overwriting).

## Consequences

- **The normaliser/merge** (`packages/ingestion/src/normalise/dbNormalise.ts`,
  `packages/core/src/normalise/normalise.ts` merge logic) gains a lock check before
  writing each field; `docs/NORMALISATION.md` and `docs/INGESTION.md` document the
  respect-locks rule.
- **Deduplication** (`docs/DEDUPLICATION.md`) gains an editorial canonical-survivor and
  duplicate-rejection decision that overrides automatic merge candidates, and pairs with
  the survivor-pointer gap (A1-007).
- **Easier:** humans can fix messy grassroots/recurring/festival data once and trust it
  sticks; the platform can lean on light human curation without fighting the pipeline.
- **Harder / to watch:** the pipeline must check locks on every write; a "source now
  disagrees with a locked field" state needs a review surface so locks don't hide real
  upstream changes (e.g. a genuine venue move).
- **Non-goals / not in this docs-only change:** no schema, code, RLS, or tests change
  here. The mechanism is specified for implementation via the prompt library
  (`docs/prompts/22a`, `docs/prompts/22b`). The exact storage shape (`events.field_overrides`
  JSONB vs a side table) is decided at implementation.

See ADR 0005 (umbrella data-model decision), ADR 0006 (trust × completeness; human
review raises trust), and the survivor-pointer gap noted in the data-model audit
(A1-007).
