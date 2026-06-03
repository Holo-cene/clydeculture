# CC-NEW-3: Resolve confidence threshold contradiction

**Priority:** P0  
**Area:** Schema / Documentation  
**Status:** ✅ Resolved (Sprint 0, 2026-06-03)  
**Closed by:** D1 decision — Option A chosen

---

## The contradiction that was resolved

Two documents disagreed on where `confidence >= 60` lives:

- `docs/PUBLISHING.md` showed it hardcoded in an RLS policy:
  `using (visibility = 'published' and confidence >= 60)`
- `docs/NORMALISATION.md` (Step 4) said: "The publishing threshold (currently 60)
  is stored in `sources.config` at the platform level and is applied by the publishing
  query, not hardcoded in normalisation code."

A SQL RLS policy cannot dynamically read a JSONB value from a `sources.config` row at
policy evaluation time. These two descriptions were architecturally incompatible.

---

## Decision: Option A — Hardcode in RLS

**Rationale:** The threshold will not change until real connector data validates it.
Changing it via migration is intentional — it is a policy decision, not a runtime config
knob, and the migration provides the paper trail. BE-19 tracks the future externalisation
to `platform_config` with per-source overrides. Adding schema objects (platform_config
table, stable function) solely to resolve a documentation contradiction was premature for
Phase 1.

**SQL fragment (for inclusion in CC-NEW-1 migration):**

```sql
-- Public read policy on events — enforces both conditions atomically at the DB layer.
-- The threshold 60 is a Phase 1 literal. To change it, alter the policy in a migration.
-- See BE-19 for the future platform_config externalisation.
create policy "Public read events"
  on events for select
  to anon
  using (visibility = 'published' and confidence >= 60);
```

---

## Outcome

Both documents now agree on Option A:

- `docs/PUBLISHING.md` — RLS policy section shows the literal `60` with a note that
  changing it requires a migration (intentional change-control). BE-19 referenced for
  future externalisation.
- `docs/NORMALISATION.md` Step 4 — corrected to say the threshold is `60`, hardcoded
  as a literal in the RLS policy, not stored in `sources.config`.

**Additional finding:** `docs/reference/SCHEMA_v5.sql` line ~863 has the "Public read
events" policy written as `using (visibility = 'published')` without the `confidence >= 60`
clause. The CC-NEW-1 migration must add it.
