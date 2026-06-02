# SEC-02: Stored XSS — define and enforce sanitisation point for user-submitted text

**Priority:** P2
**Area:** Security, Ingestion
**Status:** Open
**Depends on:** BE-03 (normalisation contract)

## Why this matters

`event_submissions.title` and `event_submissions.description` accept free text from the
public form with no server-side sanitisation defined. When a submission is approved and
converted to a canonical event, those values are copied into `events.title` and
`events.description`. If either field contains an HTML tag or JavaScript payload and a
moderator or admin UI renders the value as raw HTML (common in a Supabase Studio
table editor, a custom admin panel, or a future Webflow-rendered description), the
payload executes in the moderator's or visitor's browser.

The normalisation pipeline (`packages/core`) is the correct sanitisation point — it
processes `external_events` and `event_submissions` before writing to `events`. The DB
layer already has length guards (DB-05) but no content sanitisation. Both are needed.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SCHEMA_v5.sql` (event_submissions
and events table definitions), `docs/DATA_MODEL.md` (the events/external_events
relationship section), `docs/INGESTION.md` (the Normalisation section), and
`docs/tasks/DB-05.md` (which added length guards to the insert policy) before proceeding.

**Your task** is to add text sanitisation to the normalisation pipeline for user-supplied
text fields, and document the sanitisation contract.

---

### Step 1 — Install `sanitize-html` in `packages/core`

```
pnpm --filter @clydeculture/core add sanitize-html
pnpm --filter @clydeculture/core add -D @types/sanitize-html
```

---

### Step 2 — Create `packages/core/src/sanitise.ts`

```ts
import sanitizeHtml from "sanitize-html";

/**
 * Strips all HTML tags from a string. Returns the plain-text content.
 * Used to sanitise user-supplied title and description fields before writing
 * to the canonical events table. Prevents stored XSS via submitted text.
 */
export function stripHtml(value: string | null | undefined): string | null {
  if (value == null) return null;
  const stripped = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
  return stripped.trim() || null;
}

/**
 * Sanitises a short summary field — no HTML, max 500 characters.
 */
export function sanitiseSummary(value: string | null | undefined): string | null {
  const stripped = stripHtml(value);
  if (stripped == null) return null;
  return stripped.slice(0, 500);
}

/**
 * Sanitises a title field — no HTML, max 300 characters.
 */
export function sanitiseTitle(value: string | null | undefined): string | null {
  const stripped = stripHtml(value);
  if (stripped == null) return null;
  return stripped.slice(0, 300).trim() || null;
}
```

---

### Step 3 — Apply sanitisation in the normalisation pipeline

In `packages/core/src/normalise.ts` (or the equivalent normalisation module, following
the architecture in `docs/INGESTION.md`), import the sanitisation helpers and apply them
when mapping from `event_submissions` or `external_events` to `events`:

- `events.title` ← `sanitiseTitle(source.title)`
- `events.summary` ← `sanitiseSummary(source.summary ?? source.description)`
- `events.description` ← `stripHtml(source.description)` (only for permitted sources;
  link-only sources get `null` regardless — see SEC-05)

The sanitisation must run **before** the dedupe key is computed, because
`normalise_title()` in the DB operates on an already-clean title.

---

### Step 4 — Update `docs/INGESTION.md`

In the **Raw to normalised** section, in the Normalisation paragraph, add a sentence
after "The normaliser reads the `_guess` fields and resolves them into canonical values":

> All user-supplied text — `title`, `summary`, and `description` from
> `event_submissions`, and equivalent fields from HTML and RSS connectors — is passed
> through `sanitiseTitle()` / `sanitiseSummary()` / `stripHtml()` in
> `packages/core/src/sanitise.ts` before being written to `events`. This strips all
> HTML tags and limits field lengths. API sources (Ticketmaster, Skiddle) are not
> sanitised beyond length capping, as their content is controlled by the API provider.

---

## Acceptance criteria

- [ ] `packages/core/src/sanitise.ts` exists with `stripHtml`, `sanitiseSummary`, and `sanitiseTitle`
- [ ] `sanitize-html` is listed as a dependency in `packages/core/package.json`
- [ ] `stripHtml('<script>alert(1)</script>Funk Night')` returns `'Funk Night'`
- [ ] `sanitiseTitle(null)` returns `null`
- [ ] `sanitiseTitle('a'.repeat(400))` returns a string of length 300
- [ ] Normalisation pipeline applies `sanitiseTitle` before writing `events.title`
- [ ] Normalisation pipeline applies `stripHtml` or `sanitiseSummary` before writing `events.description` / `events.summary`
- [ ] `docs/INGESTION.md` documents the sanitisation point
