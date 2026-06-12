# ADR 0008: Tracer-bullet delivery; engine-first is a quality bar

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** Clyde Culture core

## Context

The documented build approach was engine-first and horizontal: `ROADMAP.md` opens
*"the engine ships before the frontend"* and sequences milestones as layers (all
connectors → all normalisation → frontend last). The only "vertical slice" that existed
— `docs/mvp-proof-of-concept.md` — was **seeded demo data** proving the display path; no
real event had ever flowed source → DB → public page. Recent scoping (ADR 0005
cultural-graph + the prompt-library Phase A–E) reinforced horizontal-first by putting
data-model work *before* the connector build-out.

This front-loads breadth and foundations before any real value reaches a user, defers
the riskiest unknowns (live ingestion, deployment, scheduling, the publish gate, real
display constraints) to the end, and provides no early real-world feedback loop. The
repo also already has an agent-orchestration runtime (`.sandcastle/`) with no work-unit
layer feeding it.

## Options considered

1. **Keep engine-first/horizontal.** Familiar; matches the existing ROADMAP. But the
   first real event reaches a user very late, and the scariest end-to-end risks are
   proven last. Rejected.
2. **Tracer-bullet / vertical slices.** Build the thinnest *complete* thread first — one
   real source, live, through the real pipeline, onto a deployed public page shown to
   real people — then thicken with vertical feature slices. Chosen.

## Decision

Deliver Clyde Culture as **tracer bullets / vertical feature slices**, not horizontal
layers. **"Engine-first" is retained as a quality bar** (Supabase is the source of
truth and the backend must be correct) **— it is no longer a sequencing rule.**
"The engine ships before the frontend" is superseded.

- **Thread #1 (the MVP / tracer bullet) = Ticketmaster**, the only Tier-1 source both
  built and publicly displayable (ADR 0004 settles its display rights). All live Glasgow
  Ticketmaster events flow through the existing pipeline onto the existing deployed Astro
  site (demo seed replaced by real data), with a daily scheduled sweep, shared with a
  small named feedback audience.
- **Thread #2 = Data Thistle** — the most valuable source (breadth + cinema), taken on
  *second* because it carries the public-display licence flip and the work/occurrence
  ("one film, many showings") model.
- Every subsequent capability ships as a **Feature** — a vertical slice through the full
  pipeline to the deployed site — prioritised by user value, not by layer.
- Detail and the slice breakdown live in the PRD (published to the GitHub issue tracker
  via `to-prd`/`to-issues`); GitHub issues are the work-unit layer that feeds
  `.sandcastle`.

## Consequences

- **Supersedes** the horizontal framing in `ROADMAP.md` (now reference, not the live
  plan) and re-orders ADR 0005: the cultural-graph tranches and the prompt library
  (prompts 11–24) become a backlog of *future feature slices*, **not** preconditions for
  the first ship. `CLAUDE.md`'s "engine-first" is reframed as a quality bar.
- The scariest unknowns (live ingestion, deploy, scheduling, the publish gate, real
  display + attribution) are proven first, on the cleanest source.
- A real, un-marketed deployed page exists early for a genuine feedback loop.
- Work is expressed as `ready-for-agent` vertical-slice GitHub issues consumed by the
  `.sandcastle` runtime — the orchestration loop the horizontal docs lacked.
- See ADR 0001 (Astro frontend), ADR 0003 (source strategy), ADR 0004 (Ticketmaster
  display), ADR 0005 (cultural-graph; now sequenced after the tracer bullet).
