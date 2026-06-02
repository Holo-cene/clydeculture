# SEC-05: Link-only source enforcement — add schema flag and normalisation guard

**Priority:** P1 (Blocker)
**Area:** Security, Schema, Connectors
**Status:** Open
**Depends on:** —

## Why this matters

The link-first and "link-only sources" rules are stated only in prose (CLAUDE.md,
SPEC.md §6, CONNECTOR_GUIDE.md §5): "Do not store descriptions or images from Resident
Advisor or Instagram." There is nothing in the schema or normalisation code that enforces
this. A connector developer — or an AI agent building a new connector — can store a full
`description` and `image_url` from Resident Advisor by passing them through `RawEvent`
without any constraint catching the violation.

`external_events.raw` will always store the full upstream payload for debugging, which
is correct. The risk is that `events.description` and `events.image_url` get populated
from a link-only source during normalisation. Once in the `events` table, those values
can be exposed to the frontend or stored indefinitely.

This is a pre-build blocker because connectors are being built now and the normalisation
pipeline needs to know, per source, what it is permitted to copy.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (sources table),
`docs/DATA_MODEL.md` (Connector Registry section), `docs/INGESTION.md` (Normalisation
section), `docs/CONNECTOR_GUIDE.md` (§5 the link-first rule), `docs/reference/SPEC.md`
(§6 "Sources to avoid or treat as link-only"), and `CLAUDE.md` ("Link-first" hard rule)
before proceeding.

**Your task** is to add an `is_link_only` flag to the `sources` table and enforce it in
the normalisation pipeline so that `events.description` and `events.image_url` are never
populated from a link-only source.

---

### Step 1 — Create migration `supabase/migrations/20260601000031_sources_link_only.sql`

```sql
-- Add is_link_only flag to sources.
-- When true, the normalisation pipeline must not copy description or image_url
-- from external_events to the canonical events record.
-- raw jsonb is always stored regardless (for debugging / reparse).
alter table sources
  add column if not exists is_link_only boolean not null default false;

comment on column sources.is_link_only is
  'When true, connectors for this source must not store description or image_url in canonical events. '
  'Raw payloads are still stored in external_events.raw. '
  'Set for Resident Advisor, Instagram, and any source whose ToS prohibits content storage.';
```

No index needed — this column is read during normalisation, not queried for filtering.

---

### Step 2 — Seed the flag for known link-only sources

In `supabase/migrations/20260601000031_sources_link_only.sql`, add an UPDATE after the
ALTER TABLE for any sources already seeded:

```sql
-- Mark known link-only sources. Add to this list as new connectors are registered.
-- Cross-reference: docs/reference/SPEC.md §6 "Sources to avoid or treat as link-only"
update sources set is_link_only = true
  where slug in ('resident-advisor', 'instagram');
```

If the source seed migration does not yet include these sources, add a comment stating:

```sql
-- NOTE: Resident Advisor and Instagram slugs must be set is_link_only = true
-- when their source rows are inserted. See docs/tasks/SEC-05.md.
```

---

### Step 3 — Enforce in the normalisation pipeline

In `packages/core/src/normalise.ts` (the normalisation module), when mapping from an
`external_events` row to an `events` record, fetch the `sources.is_link_only` flag for
the source being processed (this should already be available from the sources registry
the orchestrator holds in memory).

Apply the guard:

```ts
// Enforce link-only: never copy description or image_url from restricted sources
const description = source.is_link_only
  ? null
  : sanitise.stripHtml(externalEvent.description);

const imageUrl = source.is_link_only
  ? null
  : externalEvent.image_url_guess ?? null;

// Log to confidence_inputs when a field is suppressed
if (source.is_link_only && (externalEvent.description || externalEvent.image_url_guess)) {
  confidenceInputs.push({
    field: "link_only_suppression",
    suppressed: ["description", "image_url"].filter(
      (f) => f === "description" ? !!externalEvent.description : !!externalEvent.image_url_guess
    ),
  });
}
```

---

### Step 4 — Update `docs/CONNECTOR_GUIDE.md`

In **§7 Register in the sources table**, add a row to the INSERT example:

```sql
INSERT INTO sources (slug, source_type, tier, config, enabled, is_link_only)
VALUES (
  'resident-advisor',
  'html',
  3,
  '{}',
  false,
  true   -- link-only: do not store description or image_url
);
```

In **§5 The link-first rule**, after "Do not store: full event descriptions..." add:

> The `sources.is_link_only` flag enforces this at the normalisation layer: when the
> flag is `true`, `events.description` and `events.image_url` are set to `null`
> regardless of what the connector returned. Registering a link-only source without
> setting this flag is a policy violation.

---

### Step 5 — Update `docs/DATA_MODEL.md`

In the Connector Registry → sources section, add `is_link_only` to the column table:

| Column | Type | Notes |
|---|---|---|
| `is_link_only` | boolean | When true, normalisation suppresses `description` and `image_url` on the canonical event. Set for RA, Instagram, and similar. |

---

## Acceptance criteria

- [ ] Migration adds `is_link_only boolean not null default false` to `sources`
- [ ] `resident-advisor` source row has `is_link_only = true` (in seed or migration)
- [ ] Normalisation pipeline reads `sources.is_link_only` and sets `events.description = null` and `events.image_url = null` when true
- [ ] A test: connector returns `description = 'Full RA copy'` for a link-only source; canonical event has `description = null`
- [ ] A test: connector returns `description = 'Short summary'` for a non-link-only source; canonical event has `description = 'Short summary'`
- [ ] `docs/CONNECTOR_GUIDE.md` §5 and §7 reference the flag
- [ ] `docs/DATA_MODEL.md` sources table includes `is_link_only`
