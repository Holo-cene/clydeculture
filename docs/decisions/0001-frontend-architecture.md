# ADR 0001: Frontend architecture

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** Jamie

## Context

The engine (ingestion → Supabase → publishing) is frontend-agnostic. The chosen
toolchain (Claude Code) supports a coded frontend natively. Webflow CMS has known
constraints for this data shape: no joins (hence the 13 denormalised fields in the
v5 schema), CMS item caps (~10k on the standard plan), and API rate limits the sync
job must work around. A Webflow site also means managing two sources of truth in
practice (Supabase + Webflow CMS state) even though Supabase is canonical.

The platform is read-heavy and SEO-critical — event listings, venue pages, festival
pages, "tonight" and "this weekend" views. This maps directly to a static-first
architecture with server-side rendering for dynamic sections.

## Options considered

1. **Webflow CMS.** Fast to ship visually; requires a Supabase → Webflow sync job,
   13 denormalised fields on `events`, and ongoing rate-limit management; bounded by
   CMS item caps; creates a second source of truth. Ruled out: constraints outweigh
   the speed advantage given coding toolchain.

2. **Coded Astro + Supabase direct.** Static-first, server islands for dynamic
   sections; no sync job; no CMS item caps; frontend reads Supabase directly via the
   anon key scoped by RLS; Supabase is the only source of truth. Build is faster to
   maintain long-term and avoids Webflow's structural constraints.

3. **Coded Next.js + Supabase direct.** Same data access model as Option 2 but more
   framework overhead (App Router, React Server Components) for a content-focused
   site with minimal interactivity. Ruled out: Astro is a better fit for this traffic
   pattern.

4. **MakerKit (Next.js + Supabase + auth/billing starter).** B2B-SaaS-shaped
   (orgs, teams, RBAC) — more than MVP needs. Deferred: revisit only if Phase 2
   membership portal requires it.

## Decision

**Astro + Supabase direct read, anon key scoped by RLS.**

Astro's static-first model with server islands is the right fit for a read-heavy,
SEO-critical events platform. No sync job. Supabase is the only source of truth.
The anon key is safe in the browser because RLS enforces `visibility = 'published'`
at the database layer.

## Consequences

**Schema surgery required before building `apps/web`.** The v5 schema was designed
with a Webflow path in mind. A migration must:

- **Drop from `events`:** `event_type_label`, `venue_name_display`,
  `venue_slug_display`, `festival_name_display`, `festival_slug_display`,
  `tags_display`, `location_display`. These 7 fields exist solely to give the
  Webflow sync job a flat document to push. The Astro frontend derives these via
  joins at query time.

- **Retain on `events`:** `is_festival_event`, `is_sold_out`, `has_image`
  (generated booleans — useful for partial indexes regardless of frontend),
  `availability_note`, `ticket_url_label`, `age_restriction`, `is_online`
  (these are genuine event attributes, not denormalisation artifacts).

- **Drop tables:** `publish_mappings`, `publish_jobs`, `publish_job_items`. No sync
  job means no sync audit trail. The trigger on `publish_mappings` must also be
  dropped.

- **Add `source_type = 'apify'`** to the `sources.source_type` CHECK constraint
  (required by ADR 0003 scraping strategy).

**`packages/publishing` is removed.** There is no sync adapter. Supabase query
helpers (typed wrappers around the Supabase client for `getPublishedEvents`,
`getVenue`, `getFestival`) can live in `packages/shared` if shared between the
Astro app and any future API surface.

**RLS policies are load-bearing.** The anon key is exposed in the Astro server
environment and potentially in client-side fetches for dynamic sections. The public
read policies on `events`, `venues`, `event_types`, `tags`, `festivals`, and
`event_series` must be correct before any Astro route is deployed. `SEC-01` (anon
key blast-radius documentation) is now a build prerequisite, not a pre-launch task.
The service role key must never appear in `apps/web` code.

**`apps/web` is an Astro application.** Do not populate it until the schema
migration (dropping Webflow fields) has been applied and the v5 schema is stable.
