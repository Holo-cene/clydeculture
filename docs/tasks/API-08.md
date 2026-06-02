# API-08: External ID stability — document hash instability and implement orphan expiry

**Priority:** P2  
**Area:** Ingestion / Schema  
**Status:** Open  
**Depends on:** BE-02

## Why this matters

Two classes of `external_events` records can become permanently orphaned due to ID
instability, and neither is handled in the current spec:

**1 — HTML hash-based IDs and reschedules.** The content hash formula for HTML connectors
is `sha256(venueName | startDate | title)`. If a venue reschedules an event, `startDate`
changes and the hash changes. The old `external_events` row (with the original date) is
never marked `is_deleted` — `mark_stale_deleted()` (BE-02) will eventually flag it as
absent, but only after the next run. More importantly, the new `external_events` row
creates a second canonical `events` record (draft) for the same event, now with the
rescheduled date — but the original is not automatically hidden or merged.

**2 — RSS GUID instability.** Some CMS configurations generate URL-based GUIDs. A CMS
migration, URL slug change, or Substack domain change invalidates all existing GUIDs.
Every `external_events` row from that source is marked deleted (after the next run's
`mark_stale_deleted()`) and re-ingested as new — inflating the canonical events table
with duplicates until the merge candidates queue is processed.

Neither scenario has a defined response or mitigation in the docs.

---

## Prompt

You are building Clyde Culture. Read `docs/DEDUPLICATION.md`, `docs/CONNECTOR_GUIDE.md`
Section 4 (externalId), `docs/INGESTION.md`, `docs/DATA_MODEL.md`, and `CLAUDE.md`
before proceeding.

**Your task** is to document these two instability scenarios and add a staleness expiry
mechanism for orphaned `external_events` rows.

**Step 1 — Write the External ID Stability Guide:**

Create `docs/EXTERNAL_ID_STABILITY.md` covering:

1. **ID stability per source type:** what is stable, what is fragile, and why.
   | Source type | ID source | Stable? | Failure modes |
   |---|---|---|---|
   | API | upstream event ID | High | Provider deprecates or re-keys events |
   | RSS | item.guid | Medium | URL-based GUIDs change on CMS migration |
   | iCal | event UID | High | Some plugins regenerate UIDs on each export |
   | HTML | content hash | Low | Any title change, date change, or venue name change invalidates hash |

2. **Reschedule handling for HTML sources.** When an event is rescheduled:
   - The old `external_events` row will be absent from the next run → `mark_stale_deleted()`
     sets `is_deleted = true` → `propagate_deletion()` archives the canonical event if no
     other source carries it.
   - The new row (new hash) is treated as a new event → a draft canonical record is created.
   - A human moderator must: approve the new draft, then merge or delete the archived
     original. Document this as the expected workflow.
   - Long-term mitigation: a future "reschedule detection" pass could fuzzy-match a
     newly created draft (same venue + title, adjacent date) against recently archived events.

3. **RSS GUID instability mitigation:**
   - The fallback `sha256(link | title)` is also vulnerable to URL changes, providing
     no additional stability over the GUID.
   - For known Substack sources: Substack GUIDs are the post URL with a path segment.
     They are stable unless the newsletter changes its Substack subdomain.
   - Document that connector builders should test GUID stability by comparing two
     consecutive fetches of the same feed and verifying all GUIDs match.

**Step 2 — Add a staleness expiry job spec to `docs/INGESTION.md`:**

Add a section "Orphan expiry" after the existing deletion detection section:

> An `external_events` row is considered orphaned when `is_deleted = true` and
> `last_seen_at` is more than N days ago (recommended: 30 days). Orphaned rows with
> no linked canonical event (`event_id IS NULL`) may be deleted during a weekly cleanup
> job. Orphaned rows that link to a canonical event must not be deleted — they are the
> provenance record. The cleanup job only deletes unlinked orphans.

**Step 3 — Add a cleanup migration:**

Create `supabase/migrations/20260602000002_orphan_expiry.sql`:

```sql
-- Weekly cleanup function: deletes unlinked orphaned external_events rows.
-- Only deletes rows where is_deleted = true AND event_id IS NULL
-- AND last_seen_at < now() - interval '30 days'.
-- Linked rows (event_id IS NOT NULL) are never deleted by this function.
create or replace function expire_orphaned_external_events(
  p_older_than_days integer default 30
) returns integer as $$
declare
  v_deleted_count integer;
begin
  delete from external_events
  where is_deleted = true
    and event_id is null
    and last_seen_at < now() - (p_older_than_days || ' days')::interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;
```

**Step 4 — Update `docs/CONNECTOR_GUIDE.md` Section 4:**

After the hash fallback examples, add a stability warning:

> **Hash stability warning.** Content hashes for HTML connectors are fragile: any change
> to title text, date format, or venue name string creates a new hash and orphans the old
> `external_events` row. For scrapers, this is expected — an orphaned row is eventually
> cleaned up by `expire_orphaned_external_events()`. For event reschedules specifically,
> a moderator must manually review the resulting duplicate draft.

---

## Acceptance criteria

- [ ] `docs/EXTERNAL_ID_STABILITY.md` exists covering all four source types
- [ ] The guide documents reschedule handling workflow for HTML hash sources
- [ ] The guide documents RSS GUID instability and the stability test
- [ ] `docs/INGESTION.md` has an "Orphan expiry" section
- [ ] Migration `supabase/migrations/20260602000002_orphan_expiry.sql` exists with
  `expire_orphaned_external_events()` implemented
- [ ] The function only deletes unlinked orphans (`event_id IS NULL`)
- [ ] The function never deletes rows with `event_id IS NOT NULL`
- [ ] `docs/CONNECTOR_GUIDE.md` Section 4 has the hash stability warning
