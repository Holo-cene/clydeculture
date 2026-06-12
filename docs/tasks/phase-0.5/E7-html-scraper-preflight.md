# E7 — HTML Scraper Pre-flight

## Status
Open

## Purpose
Phase 1 HTML sources (SWG3, St Luke's, Mono, The Flying Duck) each need a ToS/robots.txt check before any scraper code is written. At least one source may require JavaScript rendering (Playwright) rather than static HTML parsing (Cheerio). Trigger.dev cloud workers may not support Chromium — this must be confirmed before the connector architecture is locked. This task produces a pre-flight document for each HTML source. No code.

## Classification
- Type: spike (research per source)
- Blocks: all Phase 1 HTML connector builds
- Can run in parallel: yes (with E1–E6, D tasks, H1)
- Must run after: none
- Must run before: SWG3, St Luke's, Mono, Flying Duck connector implementations

## Files to inspect first
- `docs/tasks/archive/completed/top-level/API-06.md` — archived HTML scraping task file
- `docs/CONNECTOR_GUIDE.md` — HTML connector approach

## Files allowed to edit
- `docs/tasks/phase-0.5/E7-html-scraper-preflight.md` — update this task's status notes if findings make the task obsolete or blocked
- `docs/connectors/html-preflight.md` (new — create in `docs/connectors/`, make the directory if needed)

## Files not allowed to edit
- Any TypeScript source files
- Any migration files
- Any connector implementations

## Non-goals
- Do not write any scraper code.
- Do not make scraper requests to production sites.
- Do not make schema changes.

## Required steps
1. Read `docs/tasks/archive/completed/top-level/API-06.md` in full.
2. For each Phase 1 HTML source, research and document in `docs/connectors/html-preflight.md`:

   **Per-source checklist** (SWG3, St Luke's, Mono, The Flying Duck):
   a. `robots.txt`: what does it say about the events page path? Quote relevant Allow/Disallow.
   b. ToS: does the site's Terms prohibit automated access? Quote any relevant clause. If prohibited → hard block: mark as "not viable for Phase 1".
   c. JavaScript rendering requirement: can the events listing be parsed from static HTML, or does it require JS execution?
      - If static: Cheerio is sufficient.
      - If JS-required: Playwright is needed.
   d. Crawlee/Playwright in Trigger.dev cloud: note whether this has been confirmed or needs testing.

3. **Trigger.dev + Playwright compatibility:**
   - Document whether Trigger.dev cloud workers (as of Phase 1) support running Chromium/Playwright in-process.
   - If not: note that Apify actors are the alternative for JS-heavy sources.

4. **Field-completeness alerting proposal:**
   - Document in `docs/connectors/html-preflight.md`: flag runs where > 30% of records have null `title` or `start_at`. Log as `count_drop` alert type.

5. Update this task file with a summary of per-source findings, or archive it if HTML scraping is rejected for Phase 1.

## Test command / verification
No automated test — verify by git diff and checklist.

```bash
ls docs/connectors/
git diff docs/tasks/phase-0.5/E7-html-scraper-preflight.md
```

## Acceptance criteria
- [ ] `docs/connectors/html-preflight.md` exists with a per-source section for all 4 HTML sources.
- [ ] Each source's robots.txt and ToS status is documented.
- [ ] JavaScript rendering requirement is confirmed for each source.
- [ ] Trigger.dev + Playwright compatibility is addressed.
- [ ] Field-completeness alerting proposal is in `docs/connectors/html-preflight.md`.
- [ ] Any source where ToS prohibits scraping is clearly marked as blocked.

## Stop condition
Stop when `docs/connectors/html-preflight.md` and this task status are complete. Report:
- per-source ToS/robots.txt status
- which sources require Playwright
- Trigger.dev + Playwright compatibility finding
- any sources blocked by ToS
- recommended next prompt: HTML connector implementation for ToS-clear sources (Wave 5)
