> **ARCHIVED 2026-06-13.** Migrated to issue #22 (SSRF validation on source_url). See `docs/tasks/MIGRATION_TRIAGE.md`.

# SEC-03: SSRF — validate source_url before any server-side fetch

**Priority:** P2
**Area:** Security, Ingestion
**Status:** Open
**Depends on:** BE-03 (normalisation contract)

## Why this matters

`event_submissions.source_url` is a user-supplied URL stored as plain text with no
server-side validation. If the normalisation pipeline or any future enrichment step
performs a server-side HTTP fetch against this URL (e.g. to preview the source page,
resolve a redirect, or enrich ticket data), an attacker can submit a URL pointing to
internal infrastructure:

- `http://169.254.169.254/latest/meta-data/` — AWS/GCP instance metadata
- `http://localhost:54321/` — local Supabase REST API (in dev)
- `http://10.0.0.1/` — internal network hosts

The result is a Server-Side Request Forgery (SSRF) that can leak cloud credentials,
internal service responses, or Supabase API keys, depending on the execution environment.

Even if no enrichment fetch currently exists, the field will be used for outbound requests
in Phase 2 (the spec mentions enriching ticket links). Validating at the point of
ingestion prevents the risk from being introduced silently later.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (event_submissions
table), `docs/DATA_MODEL.md` (Community section), and `docs/INGESTION.md` (Normalisation
section) before proceeding.

**Your task** is to create a URL validation utility and apply it wherever user-supplied
URLs are processed server-side.

---

### Step 1 — Create `packages/core/src/validate-url.ts`

```ts
import { URL } from "url";

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,   // link-local / instance metadata
  /^::1$/,         // IPv6 loopback
  /^fc00:/,        // IPv6 unique local
  /^fe80:/,        // IPv6 link-local
];

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Validates a user-supplied URL for safe server-side use.
 *
 * Rejects:
 *   - Non-http/https schemes (file://, ftp://, etc.)
 *   - Private / loopback IP addresses (SSRF prevention)
 *   - Bare IP addresses without a hostname
 *   - Extremely long URLs (>2000 chars)
 *
 * Does NOT perform DNS resolution. A hostname that resolves to a private IP
 * at request time is not caught here — use a fetch-level guard or egress
 * firewall for DNS rebinding protection in production.
 */
export function validateExternalUrl(raw: string | null | undefined): UrlValidationResult {
  if (!raw) return { ok: false, reason: "URL is empty" };
  if (raw.length > 2000) return { ok: false, reason: "URL exceeds 2000 characters" };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `Scheme '${parsed.protocol}' is not allowed` };
  }

  const hostname = parsed.hostname;

  // Reject bare IP addresses in non-test environments
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isIpv6 = hostname.startsWith("[");

  if (isIpv4 || isIpv6) {
    const rawIp = isIpv6 ? hostname.slice(1, -1) : hostname;
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(rawIp)) {
        return { ok: false, reason: "Private or loopback IP addresses are not allowed" };
      }
    }
  }

  if (hostname === "localhost") {
    return { ok: false, reason: "localhost is not allowed" };
  }

  return { ok: true, url: parsed };
}
```

---

### Step 2 — Apply validation in the normalisation pipeline

In the normalisation step that processes `event_submissions`, before writing
`events.source_url` from `event_submissions.source_url`, call `validateExternalUrl`:

```ts
import { validateExternalUrl } from "./validate-url";

// When processing a submission:
const urlResult = validateExternalUrl(submission.source_url);
const safeSourceUrl = urlResult.ok ? urlResult.url.toString() : null;
// If invalid, log to confidence_inputs and set needs_review = true on the event.
if (!urlResult.ok && submission.source_url) {
  confidenceInputs.push({ field: "source_url", issue: urlResult.reason });
  event.needs_review = true;
}
```

Apply the same validation to any enrichment code that fetches `source_url` or
`external_url` server-side, before the HTTP request is made.

---

### Step 3 — Update `docs/DATA_MODEL.md`

In the Community → event_submissions section, add a note under `source_url`:

> `source_url` is validated with `validateExternalUrl()` in `packages/core/src/validate-url.ts`
> before any server-side use. Invalid or private-IP URLs are set to `null` and the
> event is flagged `needs_review = true`.

---

## Acceptance criteria

- [ ] `packages/core/src/validate-url.ts` exists with `validateExternalUrl`
- [ ] `validateExternalUrl('http://169.254.169.254/latest/meta-data/')` returns `ok: false`
- [ ] `validateExternalUrl('http://localhost:3000/admin')` returns `ok: false`
- [ ] `validateExternalUrl('http://192.168.1.1/')` returns `ok: false`
- [ ] `validateExternalUrl('file:///etc/passwd')` returns `ok: false`
- [ ] `validateExternalUrl('https://swg3.co.uk/events/funk-night')` returns `ok: true`
- [ ] `validateExternalUrl(null)` returns `ok: false`
- [ ] Normalisation pipeline validates `source_url` before writing to `events.source_url`
- [ ] An invalid `source_url` results in `source_url = null` and `needs_review = true` on the canonical event
- [ ] `docs/DATA_MODEL.md` references the validation function
