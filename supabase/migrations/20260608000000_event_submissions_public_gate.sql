-- ============================================================================
-- Migration: 20260608000000_event_submissions_public_gate
-- Tighten the public event_submissions INSERT boundary before the public form.
-- ============================================================================

alter table event_submissions
  add constraint event_submissions_title_not_blank
  check (length(btrim(title)) > 0);

drop policy if exists "Public insert submissions" on event_submissions;

-- Remove the table-level INSERT grant and replace it with a column grant for
-- public submission fields only. Review/moderation linkage fields stay service
-- role only.
revoke insert on event_submissions from anon;
grant insert (
  id,
  title,
  description,
  start_at,
  end_at,
  venue_name,
  venue_id,
  event_type_slug,
  tags,
  source_url,
  submitter_email
) on event_submissions to anon;

create policy "Public insert submissions" on event_submissions
  for insert
  to anon
  with check (
    length(btrim(title)) > 0
    and start_at is not null
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and event_id is null
  );
