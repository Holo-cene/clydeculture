> **ARCHIVED 2026-06-13.** Retained as DESIGN-DOC — Public-submission rate limit / CAPTCHA depends on submission form (Phase 2). See `docs/tasks/MIGRATION_TRIAGE.md`.

# SEC-04: Submission flood — rate limiting and CAPTCHA for public event submissions

**Priority:** P2
**Area:** Security, Ops
**Status:** Open
**Depends on:** BE-01 (runtime decision), DB-05

## Why this matters

The `event_submissions` RLS policy is `FOR INSERT WITH CHECK (true)` — structurally
hardened in DB-05 but with no rate limit. A single IP can submit tens of thousands of
events per hour directly to the Supabase REST endpoint. Every submission lands in the
moderation queue, which is reviewed manually. A flood of automated spam submissions
makes the queue unusable, increases Supabase row/bandwidth usage, and degrades moderator
confidence in the queue.

DB-05 explicitly notes: "These WITH CHECK conditions are a first line of defence ...
They do not replace CAPTCHA or rate limiting, which must be implemented in the Edge
Function or form handler." This task implements that defence.

The public form must go through an Edge Function, not directly to the Supabase REST API,
so that rate limiting and CAPTCHA verification can be applied server-side before the DB
insert.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (event_submissions
table and its RLS policy), `docs/OPERATIONS.md` (Secrets Management and Scheduled
Ingestion sections), `docs/tasks/DB-05.md`, and `docs/ARCHITECTURE.md` before proceeding.

**Your task** is to create a Supabase Edge Function that acts as the submission endpoint,
implementing CAPTCHA verification and per-IP rate limiting before inserting into
`event_submissions`.

---

### Step 1 — Create `supabase/functions/submit-event/index.ts`

The function must:
1. Accept `POST` only. Return 405 for other methods.
2. Verify a Cloudflare Turnstile CAPTCHA token (sent as `captchaToken` in the request
   body). Use the Turnstile secret key from `Deno.env.get("TURNSTILE_SECRET_KEY")`.
3. Enforce a per-IP rate limit: maximum 5 submissions per IP per 24-hour window. Track
   counts in a lightweight in-memory map (acceptable for Phase 1 single-instance Edge
   Function; document that this resets on cold start).
4. Validate required fields: `title` (non-empty, ≤ 300 chars), `start_at` (valid ISO
   8601, in the future), `submitter_email` (valid email format if provided).
5. Insert into `event_submissions` using the **service role client** (the Edge Function
   runs server-side; the anon client cannot insert after DB-05's stricter policy).
6. Return `201 Created` with `{ id: <uuid> }` on success.
7. Return `400` with a structured error on validation failure.
8. Return `429` with `Retry-After: 86400` when rate limit is exceeded.
9. Never return the `submitter_email` in any response body.

```ts
// supabase/functions/submit-event/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// In-memory rate limit store (resets on cold start — acceptable for Phase 1)
const ipSubmissions = new Map<string, { count: number; resetAt: number }>();

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return false; // fail closed if secret not configured
  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limiting
  const now = Date.now();
  const entry = ipSubmissions.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Retry-After": "86400", "Content-Type": "application/json" },
      });
    }
    entry.count++;
  } else {
    ipSubmissions.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  // CAPTCHA verification
  const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : "";
  const captchaOk = await verifyTurnstile(captchaToken, ip);
  if (!captchaOk) {
    return new Response(JSON.stringify({ error: "CAPTCHA verification failed" }), { status: 400 });
  }

  // Field validation
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length < 3 || title.length > 300) {
    return new Response(JSON.stringify({ error: "title must be 3–300 characters" }), { status: 400 });
  }
  const startAt = typeof body.start_at === "string" ? new Date(body.start_at) : null;
  if (!startAt || isNaN(startAt.getTime()) || startAt < new Date()) {
    return new Response(JSON.stringify({ error: "start_at must be a future date" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .from("event_submissions")
    .insert({
      title,
      description: typeof body.description === "string" ? body.description.slice(0, 2000) : null,
      start_at: startAt.toISOString(),
      venue_name: typeof body.venue_name === "string" ? body.venue_name.slice(0, 200) : null,
      event_type_slug: typeof body.event_type_slug === "string" ? body.event_type_slug : null,
      source_url: typeof body.source_url === "string" ? body.source_url.slice(0, 500) : null,
      submitter_email: typeof body.submitter_email === "string" ? body.submitter_email : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Submission insert error:", error.message);
    return new Response(JSON.stringify({ error: "Submission failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: data.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
});
```

---

### Step 2 — Set required Edge Function secrets

Document in `docs/OPERATIONS.md` (Secrets Management section) that the following
secrets must be set for the submit-event function:

```
supabase secrets set TURNSTILE_SECRET_KEY=<your-key>
```

Obtain a Cloudflare Turnstile site key + secret key pair from
`https://www.cloudflare.com/products/turnstile/` (free tier is sufficient). The
site key is used in the frontend form; the secret key is used in this function.

---

### Step 3 — Update `docs/OPERATIONS.md`

In the Secrets Management section, add `TURNSTILE_SECRET_KEY` to the third-party API
keys list. Note that Turnstile is the CAPTCHA provider for the public submission form.

---

## Acceptance criteria

- [ ] `supabase/functions/submit-event/index.ts` exists
- [ ] `POST` with no CAPTCHA token returns `400`
- [ ] `POST` with valid body from the same IP 6 times in a session returns `429` on the 6th attempt
- [ ] `POST` with `title = ''` returns `400`
- [ ] `POST` with `start_at` in the past returns `400`
- [ ] `POST` with a valid body and a valid CAPTCHA token returns `201` with `{ id: <uuid> }`
- [ ] Response body never includes `submitter_email`
- [ ] `docs/OPERATIONS.md` documents `TURNSTILE_SECRET_KEY` and how to obtain it
- [ ] The public frontend form sends requests to `/functions/v1/submit-event`, not to the Supabase REST API directly
