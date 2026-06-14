> **ARCHIVED 2026-06-13.** Retained as DESIGN-DOC — Venue claim OTP depends on Phase 2 auth model. See `docs/tasks/MIGRATION_TRIAGE.md`.

# SEC-11: Venue claim proof — replace text assertion with email OTP verification (Phase 2)

**Priority:** P3 (Phase 2)
**Area:** Security, Schema
**Status:** Open
**Depends on:** DB-12 (auth model ADR), DB-05 (venue_claims INSERT policy)

## Why this matters

`venue_claims.proof` is a free-text column. SPEC.md §12 says: "The claim requires proof
(for example, an email from the venue domain or a role confirmation)." A claimant can
submit `proof = "I am the manager of SWG3"` with no verification. A domain email
assertion (`proof = "my email is bookings@swg3.co.uk"`) is spoofable — anyone can type
any email address.

An approved venue claim grants write access to that venue's profile row (access control
defined in DB-12). If that access allows updating `venues.website`, `venues.description`,
or `venues.hero_image_url`, a malicious actor who spoofs a claim could:

- Redirect the venue's website link to a phishing page
- Inject content into the venue description (stored XSS risk if rendered unsanitised)
- Replace the venue hero image with inappropriate content

The mitigation is a verification loop: send a one-time code (OTP) to the email address
the claimant asserts, confirm the code before accepting the claim. This proves they have
access to that inbox.

This is Phase 2 scope (venue claims are Phase 2). The schema change is small; the
verification flow requires an email sending capability (already needed for break
detection alerts — `ALERT_EMAIL`).

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (venue_claims table),
`docs/DATA_MODEL.md` (Community section — venue_claims), `docs/OPERATIONS.md` (Moderation
Queue — Venue claims section, and Secrets Management section), `docs/tasks/DB-12.md`,
and `docs/tasks/DB-05.md` before proceeding.

**Your task** is to add OTP email verification to the venue claim flow. This extends the
`venue_claims` table and adds an Edge Function for OTP issuance and verification.

---

### Step 1 — Create migration `supabase/migrations/20260601000035_venue_claim_otp.sql`

```sql
-- 🔵 PHASE 2
-- Add OTP verification fields to venue_claims.
-- A claim is not reviewable until the email OTP is verified.
alter table venue_claims
  add column if not exists verification_token    text,      -- bcrypt hash of the OTP
  add column if not exists verification_sent_at  timestamptz,
  add column if not exists email_verified        boolean    not null default false,
  add column if not exists verified_at           timestamptz;

comment on column venue_claims.verification_token is
  'bcrypt hash of the OTP sent to claimant_email. Null after verification completes.';
comment on column venue_claims.email_verified is
  'True only after the claimant successfully submitted the correct OTP. '
  'Claims with email_verified = false are not presented to the moderation queue.';
```

Update the moderation queue query in `docs/OPERATIONS.md` to include the filter:

```sql
-- venue_claims moderation queue — only email-verified claims
select id, venue_id, claimant_email, proof, created_at
from venue_claims
where status = 'pending'
  and email_verified = true
order by created_at;
```

---

### Step 2 — Create `supabase/functions/claim-venue/index.ts`

A two-endpoint Edge Function:

**`POST /functions/v1/claim-venue`** — Submit a claim and trigger OTP email:

1. Validate `venue_id` exists, `claimant_email` is a valid email.
2. Check the venue's `claimable = true` and `status IN ('active', 'temporary')`.
3. Generate a 6-digit OTP (`Math.floor(100000 + Math.random() * 900000).toString()`).
4. Hash the OTP with bcrypt (use `npm:bcryptjs`, cost factor 10).
5. Insert into `venue_claims` with `email_verified = false`, `verification_token = hash`,
   `verification_sent_at = now()`.
6. Send the OTP to `claimant_email` via the same email service used for break detection
   alerts. Subject: "Verify your Clyde Culture venue claim". Body: "Your verification
   code is: XXXXXX. It expires in 30 minutes."
7. Return `{ id: <claim_uuid>, message: "Check your email for a verification code" }`.

**`POST /functions/v1/claim-venue/verify`** — Verify the OTP:

1. Accept `{ claim_id: string, otp: string }`.
2. Fetch the claim row; check it exists, `email_verified = false`, and
   `verification_sent_at > now() - interval '30 minutes'`.
3. Compare `otp` against `verification_token` using bcrypt.compare.
4. On match: set `email_verified = true`, `verified_at = now()`, clear
   `verification_token` (set to null).
5. Return `{ verified: true }` on success or `{ verified: false, error: "..." }` on
   failure. After 5 failed attempts, set the claim status to `rejected` (prevent brute
   force).

---

### Step 3 — Update `docs/OPERATIONS.md` Venue claims section

Replace:

> A claimant submits proof (a confirmation email from the venue domain, a role title,
> or similar). The operator reviews the `proof` field, approves or rejects, ...

With:

> A claimant submits a claim via the `/functions/v1/claim-venue` endpoint with their
> email address. The system sends a 6-digit OTP to that email, which the claimant
> confirms at `/functions/v1/claim-venue/verify`. Only email-verified claims
> (`email_verified = true`) appear in the moderation queue. The operator then reviews
> the claim, confirms the claimant has a genuine connection to the venue (the `proof`
> field is still available for free-text notes), and approves or rejects.
>
> The OTP process proves the claimant has access to the email inbox they asserted. It
> does not verify that the inbox is a venue-domain address. Moderators should still
> check whether the email domain matches the venue's known contact address.

---

## Acceptance criteria

- [ ] Migration adds `verification_token`, `verification_sent_at`, `email_verified`, `verified_at` to `venue_claims`
- [ ] `email_verified` defaults to `false`
- [ ] Edge Function `claim-venue` exists with both POST endpoints
- [ ] OTP is hashed before storage (bcrypt or equivalent)
- [ ] OTP verification enforces 30-minute expiry
- [ ] After 5 failed OTP attempts, claim is rejected
- [ ] `verification_token` is set to null after successful verification
- [ ] Moderation queue query in `docs/OPERATIONS.md` filters by `email_verified = true`
- [ ] `docs/OPERATIONS.md` describes the OTP verification flow
