# Clyde Culture

Glasgow's shared cultural noticeboard: a link-first index that aggregates "what's on"
from APIs, feeds, and scrapers and routes back out to the original source. This glossary
fixes the canonical vocabulary for the project. It is a glossary, not a spec.

## Language

### Build approach

**Tracer Bullet**:
The MVP. One *real* event taken live, end-to-end, through the actual pipeline —
real source → `external_events` → normalise → published `events` → deployed public
page — and shown to real people. The thinnest complete thread, built first, then
thickened.
_Avoid_: MVP (ambiguous — say which slice), proof of concept.

**Demo Slice**:
The existing `docs/mvp-proof-of-concept.md` artifact: seeded demo data rendered by the
Astro site. It proves the *display* path only; it never exercises live ingestion. It is
**not** the Tracer Bullet.
_Avoid_: MVP, vertical slice (the demo slice is not a real end-to-end slice).

**Engine-first**:
A quality bar — the backend is the source of truth and must be correct — **not** a
sequencing rule. It does not mean "build all backend layers before any user sees a real
event." (Supersedes the ROADMAP framing "the engine ships before the frontend.")
_Avoid_: backend-first, engine-before-frontend (as a sequencing instruction).

**Thread**:
A vertical slice of delivery that cuts through every layer end-to-end (real source →
pipeline → published → deployed → feedback). Threads are numbered by sequence; **Thread
#1 is the Tracer Bullet**. Each is demoable/verifiable on its own.
_Avoid_: layer, phase, milestone (those imply horizontal).

**Feature**:
A Thread delivered after the Tracer Bullet — a vertical slice that adds user-visible
value through the full pipeline to the deployed site. Prioritised by user value, not by
architectural layer. Expressed as `ready-for-agent` GitHub issues.
_Avoid_: epic-of-tasks, horizontal workstream.

**Feature-driven development**:
Building by Threads/Features — each a shippable, integrated vertical slice — rather than
by architectural layer. Engine quality is enforced per-slice (tests, link-first, RLS),
not by building the whole engine first.
_Avoid_: layer-driven, phase-driven development.
