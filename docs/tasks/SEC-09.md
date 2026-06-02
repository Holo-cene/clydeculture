# SEC-09: Admin MFA and operator onboarding — extend DB-12 auth ADR requirements

**Priority:** P2
**Area:** Security, Ops
**Status:** Open
**Depends on:** DB-12 (Phase 2 auth model ADR)

## Why this matters

DB-12 defines the auth model ADR and will document how admins/operators authenticate.
However, DB-12's scope (as written) does not explicitly require MFA. For a platform
where operators have write access to the moderation queue and can approve/reject
community submissions that then become public events, a compromised operator account
without MFA means an attacker can:

- Approve spam or malicious submissions to the public site
- Reject legitimate venue claims
- Read all `submitter_email` values from the submissions table
- Set `visibility = 'published'` on any draft event, bypassing the confidence check

Currently, all admin access is via the Supabase service role key (direct SQL). When
DB-12 introduces Supabase Auth for operators, MFA must be a hard requirement from day
one — retrofitting it after the platform is live is disruptive and operators may resist.

This task extends the DB-12 ADR requirements with explicit MFA language and defines the
operator onboarding process in enough detail that an agent implementing DB-12 produces
an MFA-enforced auth model.

---

## Prompt

You are building Clyde Culture. Read `docs/tasks/DB-12.md` in full, then read
`docs/reference/SCHEMA_v5.sql` (RLS section and community tables), `docs/OPERATIONS.md`
(Moderation Queue section), and `docs/decisions/0003-auth-model.md` if it exists.

**Your task** is to extend the DB-12 ADR prompt and acceptance criteria to make MFA a
hard requirement, and to document the operator onboarding process in `docs/OPERATIONS.md`.
If ADR 0003 already exists (DB-12 has been resolved), implement the changes directly.

---

### Step 1 — If DB-12 is not yet complete: update `docs/tasks/DB-12.md`

Add the following requirements to the **Step 1 — Write the ADR** section of DB-12:

After question 2 ("How are admin/operator roles assigned?"), add:

> **5. MFA requirement:** The ADR must require multi-factor authentication (TOTP or
> hardware key) for all operator accounts. State:
> - Whether MFA is enforced via Supabase Auth settings (Dashboard → Auth → MFA) or
>   checked at the RLS policy layer (`auth.jwt() -> 'amr'` claim).
> - The process for revoking access when an operator leaves (disable account +
>   session invalidation).
> - That no operator account may be created without MFA enabled before first login.

Also add to the **Acceptance criteria** of DB-12:

> - [ ] ADR explicitly states MFA is required for all operator accounts
> - [ ] ADR describes the mechanism for enforcing MFA (Supabase Auth setting or JWT `amr` check)
> - [ ] ADR defines the account revocation process

---

### Step 2 — Add Operator Access Management section to `docs/OPERATIONS.md`

Add a new **Operator Access Management** section after the Secrets Management section:

```markdown
## Operator Access Management

Clyde Culture has two access tiers:

| Tier | Access | How granted |
|---|---|---|
| Service role | Full DB access, bypasses RLS | Supabase project key — restricted to Edge Functions and scripts |
| Operator | Moderation queue (read/write), venue claim review | Supabase Auth account with operator role claim and MFA required |

### Creating an operator account

1. Create a Supabase Auth user via the dashboard (Authentication → Users → Invite).
2. Set the operator role claim:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "operator"}'::jsonb
   where email = '<operator@email.com>';
   ```
3. Instruct the operator to enable TOTP MFA on first login (Authentication → MFA in
   their account settings). **MFA is mandatory and must be enabled before any moderation
   work begins.**
4. Verify MFA is active:
   ```sql
   select id, email, raw_app_meta_data
   from auth.users
   where email = '<operator@email.com>';
   -- mfa_factors should show at least one verified TOTP factor
   ```

### Revoking operator access

1. Disable the account via the Supabase dashboard (Authentication → Users → Disable).
2. Invalidate active sessions:
   ```sql
   delete from auth.sessions where user_id = '<user_uuid>';
   ```
3. Log the revocation in `moderation_log` with `action = 'created'`, `reason = 'Operator account revoked'`.

### MFA enforcement

Supabase Auth MFA enforcement can be enabled project-wide under:
Dashboard → Authentication → Policies → "Require multi-factor authentication".

When enabled, any session without a verified MFA factor is rejected before reaching
RLS policies — no JWT claim checks are needed in policy code.
```

---

### Step 3 — If ADR 0003 already exists: amend it

If `docs/decisions/0003-auth-model.md` already exists from DB-12, add an "MFA
requirement" subsection to the Decision section stating that MFA is mandatory for
operator accounts, with the enforcement mechanism.

---

## Acceptance criteria

- [ ] `docs/tasks/DB-12.md` acceptance criteria includes MFA requirement (if DB-12 is open)
- [ ] `docs/OPERATIONS.md` has an Operator Access Management section
- [ ] Section documents the three-step operator creation process with the `raw_app_meta_data` UPDATE
- [ ] Section documents the account revocation process including session invalidation
- [ ] Section states MFA is mandatory before any moderation work
- [ ] Section references Supabase Auth MFA enforcement setting
- [ ] If ADR 0003 exists, it references MFA enforcement
