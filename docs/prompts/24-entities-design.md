# 24 — Cultural Entities (Organisers / Collectives / Artists) — Design Preflight (ADR 0005 B2)

## Purpose

Design the people-and-organisation layer: organisers, promoters, collectives, artists,
companies, festivals, venue groups — plus aliasing and event relationships — so the site
supports "everything this promoter/collective is doing" and "every gig featuring X".
For Glasgow DIY, **organisers/collectives come before artists** (B2a before B2b).

**Design only. Build deferred.** Produces an accepted design and build plan; does **not**
write migrations or code.

---

## Skill / Agent

Spawn an **Explore** subagent to read the schema (esp. `venue_aliases`/`resolve_venue`
as the aliasing pattern) and the target doc. Read-only.

## Parallelization

After prompt `17`. Independent of the other Phase E prompts. Build follows; entity pages
in `apps/web` follow the build.

---

## Context

No entity tables exist (verified: no `cultural_entities`/`entity_aliases`/
`event_entities`). The target model is `docs/ENTITIES.md`. Link-first applies: store a
name + canonical link for grouping, **not** scraped biographies. Names drift
("432 Presents" / "432presents") so aliasing is essential — mirror the existing
`venue_aliases` + `resolve_venue` pattern.

> Verify current schema/columns against the migrations; phrase anything unverified as a
> target/design concern, not current state.

---

## Files to Inspect

- `docs/ENTITIES.md` — the target model
- `supabase/migrations/*` — `venues`, `venue_aliases`, `resolve_venue`, `auto_create_venue`
  (the aliasing/auto-create pattern to mirror)
- `packages/core/src/normalise/normalise.ts` — where entity extraction would attach
- `docs/NORMALISATION.md` (entity extraction section), `docs/DATA_MODEL.md`

---

## Task Instructions

1. Specify `cultural_entities` (id, name, slug, `entity_type` =
   artist/performer/organiser/promoter/collective/company/festival/venue_group,
   website_url, instagram_url, source_confidence, status).

2. Specify `entity_aliases` (mirror `venue_aliases`) and an entity-resolution function
   (mirror `resolve_venue`); decide auto-create policy (cautious; `pending` + review).

3. Specify `event_entities` (event_id, entity_id, role =
   organiser/promoter/performer/speaker/host/curator, billing_order, confidence), and
   how relationships attach at work vs occurrence level (ADR 0005 B1).

4. Specify entity confidence + alias policy, and editorial canonical/duplicate handling
   (locks — ADR 0007).

5. Specify entity pages (`/organisers/…`, `/collectives/…`, `/artists/…`, `/festivals/…`,
   `/series/…`) and their public read (RLS for published events only).

6. Confirm the **B2a (organisers/collectives) before B2b (artists/lineups)** split and
   note the Bandsintown enrichment as B2b.

7. Produce a **build plan** sequenced as future red/impl prompts. Do not write them.

8. Record the accepted design into `docs/ENTITIES.md` and `docs/DATA_MODEL.md`.

---

## Non-Goals

- Do not write migrations, code, or `apps/web` pages.
- Do not store biographies, press copy, or non-permitted media (link-first / MEDIA_POLICY).
- Do not build artist/lineup ingestion (B2b) ahead of organisers (B2a).

---

## Validation Commands

None — design/inspection only.

---

## Required Output Format

Entity shape; aliasing + resolution; `event_entities` (roles, work-vs-occurrence);
confidence/alias policy; entity pages + RLS; B2a-before-B2b; build plan; docs to update.

---

## Acceptance Criteria

- [ ] `cultural_entities` + `entity_aliases` + `event_entities` shapes specified
- [ ] Aliasing/resolution mirrors `venue_aliases`/`resolve_venue`; auto-create policy set
- [ ] Roles + work-vs-occurrence attachment specified; locks respected
- [ ] Entity pages + published-only RLS specified
- [ ] B2a-before-B2b confirmed; Bandsintown noted as B2b
- [ ] Build plan sequenced (build deferred); `docs/ENTITIES.md` updated
- [ ] No code, schema, or test changes; unverified claims phrased as design concerns
