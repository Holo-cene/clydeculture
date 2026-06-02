# SEC-10: SPIKE — Ticketmaster image licensing and CDN hot-linking terms

**Priority:** P3 (Spike)
**Area:** Security, Legal, Connectors
**Status:** Open
**Depends on:** API-02 (Ticketmaster connector)

## Why this matters

The schema stores `events.image_url` as a text URL pointing to the Ticketmaster CDN.
SPEC.md §6 lists Ticketmaster as Tier 1 with "images included." Ticketmaster's Discovery
API returns image objects with CDN URLs. Displaying or hot-linking these images may
violate Ticketmaster's API terms if:

1. **Attribution is required** — Ticketmaster may require a "Powered by Ticketmaster"
   badge or attribution link alongside any use of their images.
2. **CDN URLs are ephemeral** — If Ticketmaster rotates or expires CDN URLs, stored
   `image_url` values silently break, showing broken images on the frontend with no
   alert.
3. **Hot-linking is prohibited** — Some API providers explicitly prohibit embedding
   their CDN images directly in third-party sites; image proxying may be required.
4. **Image caching** — Caching Ticketmaster images (e.g., in a Next.js image
   optimisation pipeline or Cloudflare CDN) may constitute storing a copy of their
   content, which their terms may prohibit.

This is a spike because the relevant terms are in Ticketmaster's developer agreement,
which requires reviewing the actual agreement text.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SPEC.md` (§6 Ticketmaster entry,
Tier 1 table, Sources to avoid), `docs/reference/SCHEMA_v5.sql` (events.image_url and
has_image), `docs/DATA_MODEL.md` (events table — Images section), and
`docs/tasks/API-02.md` before proceeding.

**Your task** is to research Ticketmaster's API image usage terms and produce a short
decision record. No connector code changes unless the research uncovers a clear
requirement.

---

### Step 1 — Review Ticketmaster Discovery API terms

Check the following:

1. **Attribution:** Does the Ticketmaster Discovery API agreement require any attribution
   text or logo when displaying events from their API? Common requirements:
   "Powered by Ticketmaster" with a link to ticketmaster.co.uk.
   URL to review: `https://developer.ticketmaster.com/support/terms-of-use/`

2. **Image usage:** Does the agreement specifically address using image CDN URLs in a
   third-party website? Look for clauses about "Content", "API Data", "attribution",
   and "downstream use."

3. **CDN URL stability:** Are image URLs documented as stable/persistent, or are they
   ephemeral (rotating, time-limited)? This affects whether storing the URL is safe.

4. **Caching restrictions:** Are there clauses about caching API responses or Content?

Document findings in a decision record (Step 2).

---

### Step 2 — Create `docs/decisions/0002-ticketmaster-image-usage.md`

Use the template at `docs/decisions/0000-adr-template.md`. The decision record must
state:

- Whether attribution is required and what format it takes
- Whether hot-linking CDN images is permitted
- Whether URL caching creates a ToS problem
- The recommended approach for displaying Ticketmaster event images (hot-link vs proxy
  vs omit)

Template decision (to be confirmed by actual ToS review):

```markdown
## Decision

[One of:]

**A — Hot-link permitted, no attribution required:**
Store the CDN URL in `events.image_url` and render directly on the frontend.
No changes needed. Note: if CDN URLs expire, add a monitoring check.

**B — Attribution required:**
Store the CDN URL in `events.image_url`. The frontend template must display a
"Ticketmaster" label (or "Tickets via Ticketmaster") adjacent to any Ticketmaster-sourced
event image. Add `primary_source_id` lookup to the sync job to attach source attribution
when `image_url` comes from a Ticketmaster external_events row.

**C — Hot-linking prohibited or CDN URLs are ephemeral:**
Do not store or render Ticketmaster images. Set `image_url = null` for Ticketmaster
sourced events in the normalisation pipeline. Add an `is_link_only` override flag to
the Ticketmaster source row (pending SEC-05 for the `sources.is_link_only` column).

**D — Further legal review required:**
The terms are ambiguous. Tag as a pre-launch blocker and seek advice.
```

---

### Step 3 — Update `docs/CONNECTOR_GUIDE.md` §5

After the link-first rule section, add a paragraph:

> **Image storage policy:** Before storing `image_url` from any API source, confirm
> that the provider's API terms permit hot-linking or image display in a third-party
> site. Ticketmaster terms are documented in `docs/decisions/0002-ticketmaster-image-usage.md`.
> If terms are unclear, do not store `image_url` and set `events.image_url = null` in
> the normalisation pipeline for that source.

---

## Acceptance criteria

- [ ] `docs/decisions/0002-ticketmaster-image-usage.md` exists with status `accepted` or `proposed`
- [ ] Decision record states whether attribution is required (with specific format if yes)
- [ ] Decision record states whether CDN hot-linking is permitted
- [ ] Decision record recommends one of Options A–D and explains the reasoning
- [ ] If attribution is required: a task is added to the sync job / frontend template to implement it
- [ ] If hot-linking is prohibited: the Ticketmaster connector sets `image_url = null` in normalisation
- [ ] `docs/CONNECTOR_GUIDE.md` §5 references `0002-ticketmaster-image-usage.md`
