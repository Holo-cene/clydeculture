# F1 — Public Event Submission Gate

## Status
Open

## Purpose
The `event_submissions` table currently has `WITH CHECK (true)` for anon INSERT, meaning anyone can insert arbitrary data directly via the Supabase anon key without rate limiting, CAPTCHA, or validation. This must be fixed before any public form is launched. This task updates the task file and documents the required implementation. The implementation itself is not part of Phase 0.5.

## Classification
- Type: docs-only (task file update only in Phase 0.5)
- Blocks: public submission form only (not Phase 1 build)
- Can run in parallel: yes (with all other tasks)
- Must run after: none
- Must run before: public submission form implementation (Phase 2)

## Files to inspect first
- `docs/tasks/SEC-04.md` — existing task file
- `docs/reference/SCHEMA_v5.sql` — `event_submissions` table and current RLS policy
- `supabase/functions/` — check if any submit-event Edge Function already exists

## Files allowed to edit
- `docs/tasks/SEC-04.md` — update with complete requirements

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any Edge Function implementations
- `supabase/` source

## Non-goals
- Do not implement the Edge Function.
- Do not remove the current `WITH CHECK (true)` policy (the migration change is Phase 2).
- Do not build any public form.

## Required steps
1. Read `docs/tasks/SEC-04.md` in full.
2. Read `docs/reference/SCHEMA_v5.sql` for `event_submissions` RLS policies.
3. Check `supabase/functions/` for any existing submit-event function.
4. Update `docs/tasks/SEC-04.md` with the complete implementation requirements:
   - Remove `WITH CHECK (true)` anon INSERT policy on `event_submissions`.
   - Replace with Edge Function `/functions/v1/submit-event` that gates insertion via:
     - CAPTCHA verification (specify provider: hCaptcha or Cloudflare Turnstile).
     - Per-IP rate limit: 5 submissions per 24 hours.
     - Field length constraints: title ≤ 500 chars, description ≤ 5,000 chars.
     - `submitter_email` format validation (RFC 5322 basic pattern).
     - HTML stripping (SEC-02).
   - Privacy notice must be displayed before the email field.
   - Retention function for rejected/old submissions (SEC-06).
5. Mark as "Not implemented — Phase 2".

## Test command / verification
No automated test — verify by git diff.

```bash
git diff docs/tasks/SEC-04.md
```

## Acceptance criteria
- [ ] `docs/tasks/SEC-04.md` contains the complete Edge Function requirements.
- [ ] CAPTCHA provider, rate limit, field constraints, and HTML stripping are all specified.
- [ ] Privacy notice requirement is documented.
- [ ] Task is marked as Phase 2 (not Phase 0.5 implementation).

## Stop condition
Stop when `docs/tasks/SEC-04.md` is updated. Do not implement. Report:
- what was updated
- whether the current `WITH CHECK (true)` policy exists in the schema
- recommended next prompt: any parallel F or D task
