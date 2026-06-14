> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY issue #14 (GDPR retention). See `docs/tasks/MIGRATION_TRIAGE.md`.

# SEC-06: UK GDPR — submission PII retention policy and lawful basis documentation

**Priority:** P2
**Area:** Security, Compliance, Schema
**Status:** Open
**Depends on:** DB-05

## Why this matters

`event_submissions.submitter_email` and `venue_claims.claimant_email` are personal data
under UK GDPR. Neither the schema nor any document defines:

1. **Lawful basis** for processing — required by UK GDPR Article 6. For community
   submissions, the most defensible basis is "legitimate interests" (operating the
   moderation queue) or "contract" (the submission form creates a lightweight service
   relationship). This must be stated in a privacy notice and documented internally.

2. **Retention policy** — UK GDPR requires data not be kept longer than necessary.
   Rejected submissions with `submitter_email` currently remain in the database
   indefinitely. There is no cleanup function equivalent to `archive_past_events()`.

3. **Data subject request (DSAR) handling** — a submitter's right to erasure
   (UK GDPR Article 17) requires a process to locate and delete their personal data
   across `event_submissions` (and potentially `events` if the submission was approved).
   No process is defined.

`moderation_log` is append-only by design, but `performed_by` is a UUID that could
link to a Supabase Auth user (personal data). Right-to-erasure handling for admin
users in `moderation_log` needs a defined policy.

This task is scoped to the schema changes and internal documentation. A public-facing
privacy policy is outside scope (it depends on legal advice and the live domain).

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (event_submissions,
venue_claims, moderation_log tables), `docs/DATA_MODEL.md` (Community section and
Helper Functions section), `docs/OPERATIONS.md` (Moderation Queue section), and
`CLAUDE.md` before proceeding.

**Your task** is to add a PII retention function and document the GDPR compliance
posture.

---

### Step 1 — Create migration `supabase/migrations/20260601000032_pii_retention.sql`

Add a `delete_rejected_submissions()` function that removes rejected community
submissions after a 90-day retention window:

```sql
-- 🔵 PHASE 2 — run when community submission form goes live
create or replace function delete_rejected_submissions()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from event_submissions
  where status = 'rejected'
    and created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

comment on function delete_rejected_submissions() is
  'UK GDPR retention: deletes rejected submissions (including submitter_email) '
  'after 90 days. Called by the scheduled ingestion job or pg_cron. '
  'Approved submissions are retained indefinitely (linked to a canonical event). '
  'Pending submissions are not deleted — they are awaiting moderation. '
  'Right-to-erasure (DSAR) requests must be handled manually via the DSAR process '
  'in docs/OPERATIONS.md.';
```

Add an equivalent function for venue claims:

```sql
create or replace function delete_rejected_venue_claims()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from venue_claims
  where status = 'rejected'
    and created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;
```

---

### Step 2 — Schedule retention cleanup in the ingestion orchestrator

In the Trigger.dev sweep task (`trigger/`), after the daily ingestion sweep,
call both retention functions:

```ts
// Daily PII retention cleanup — runs after all connectors complete
await supabase.rpc("delete_rejected_submissions");
await supabase.rpc("delete_rejected_venue_claims");
```

Log the return values to the application logger as `info` level:
`Retention cleanup: deleted N rejected submissions, M rejected venue claims`.

---

### Step 3 — Add GDPR section to `docs/OPERATIONS.md`

Add a new section **Data Protection** after the Backup and Restore section:

```markdown
## Data Protection (UK GDPR)

### Personal data in this system

| Table | PII fields | Lawful basis | Retention |
|---|---|---|---|
| `event_submissions` | `submitter_email` | Legitimate interests (moderation queue operation) | 90 days after rejection; indefinitely if approved (linked to canonical event) |
| `venue_claims` | `claimant_email` | Legitimate interests (venue directory accuracy) | 90 days after rejection; indefinitely if approved |
| `moderation_log` | `performed_by` (auth user UUID) | Legitimate interests (audit trail) | Indefinitely (append-only audit log; UUIDs not directly identifying) |

`submitter_email` and `claimant_email` are optional. The platform does not require them
to process a submission. Submitters are informed (at form level) that their email may be
used to follow up on their submission.

### Retention automation

`delete_rejected_submissions()` and `delete_rejected_venue_claims()` run daily as part
of the ingestion job and delete rows older than 90 days where `status = 'rejected'`.
Pending and approved rows are not deleted automatically.

### Data subject access / right-to-erasure requests

To handle a right-to-erasure request:

1. Search `event_submissions` and `venue_claims` for the email address.
2. Delete matching rows regardless of status, unless an approved submission has an
   associated canonical event (in which case, remove `submitter_email` only via UPDATE
   — the event itself is not deleted as it is editorial content, not personal data).
3. Log the erasure action in `moderation_log` with `action = 'created'` and a `reason`
   of `'DSAR erasure request'`.

Contact: hello@jamiecoop.com (platform operator).
```

---

## Acceptance criteria

- [ ] Migration adds `delete_rejected_submissions()` and `delete_rejected_venue_claims()` functions
- [ ] `delete_rejected_submissions()` deletes rows with `status = 'rejected'` and `created_at < now() - 90 days`
- [ ] `delete_rejected_submissions()` does not delete pending or approved rows
- [ ] Ingestion orchestrator calls both retention functions after the daily connector sweep
- [ ] `docs/OPERATIONS.md` has a Data Protection section with the PII table, retention policy, and DSAR process
- [ ] `docs/DATA_MODEL.md` Community section notes the 90-day retention policy for rejected submissions
