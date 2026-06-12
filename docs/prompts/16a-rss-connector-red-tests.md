# 16a — RSS Connector — Red Tests

## Purpose

Write failing tests for the first approved Glasgow RSS connector (from prompt `15`).
The connector must implement the `Connector` interface, parse an RSS fixture to
`RawEvent[]`, handle missing dates gracefully, and enforce link-first compliance.

TDD Step 1 only. Do not implement production code.

---

## Skill

Use the `/implement-test-first` skill.

## Parallelization

Sequential after `15` (needs the approved venue and field mapping contract).
Sequential before `16b`.

---

## Context

The approved venue from `15` (e.g. The Glad Cafe) will be the first RSS connector.
The connector directory is `packages/connectors/src/rss/{slug}/`.

The `Connector` interface (`packages/connectors/src/connector.ts`) requires:
- `slug: string` — must match the approved venue slug from `15`
- `type: 'rss'`
- `run(): Promise<IngestResult>`

All tests must use fixture data — no live HTTP calls. An RSS fixture file must be
created alongside the tests.

`rss-parser` is the expected parsing library. Confirm it is in
`packages/connectors/package.json` before proceeding. If absent, stop and raise as
a blocker (do not add dependencies without approval per `CLAUDE.md`).

Do not conflate demo proof with ingestion proof. The Astro website currently displays
seeded demo data and proves the public display path only.

---

## Files to Inspect

- `packages/connectors/src/connector.ts` — `Connector` interface, `RawEvent` fields
- `packages/connectors/src/api/ticketmaster/index.ts` — reference connector pattern
- `packages/connectors/src/api/ticketmaster/parse.test.ts` — reference test pattern
- `packages/connectors/src/rss/` — empty placeholder (`.gitkeep` only)
- `packages/connectors/package.json` — confirm `rss-parser` is listed
- The field mapping contract and approved venue from prompt `15`

---

## Task Instructions

1. Confirm `rss-parser` is in `packages/connectors/package.json`. If absent, stop
   here and note it as a blocker. Do not proceed.

2. Using the approved venue from prompt `15`, create a representative RSS fixture:
   `packages/connectors/src/rss/{slug}/fixtures/feed.xml`

   The fixture must include:
   - 3–5 realistic RSS event items with valid titles, links, and guids
   - At least one item with a well-formed `pubDate`
   - At least one item with no `pubDate` (or an unparseable date)
   - At least one item with no `link` field (to test error handling)

3. Create `packages/connectors/src/rss/{slug}/parse.test.ts`:

   **Test: valid RSS item produces RawEvent with required fields**
   Parse the fixture. Assert first valid item has non-empty `externalId`,
   `externalUrl` starting with `https://`, and non-empty `title`.

   **Test: externalId uses guid, falls back to link**
   Assert `externalId` equals the RSS `guid` of the first item (or `link` if no guid).

   **Test: item with no pubDate produces startAt: undefined**
   Parse the date-missing item. Assert `startAt` is `undefined`, not a fabricated
   timestamp and not the string `'undefined'`.

   **Test: link-first — description is not stored**
   Assert that `RawEvent` does not include a `description` field, or if it does, it
   is `undefined`. (If the `15` policy permits a short description ≤ 200 chars, test
   that it is capped at 200 chars.)

   **Test: item with no link is recorded as an error, not an item**
   The fixture item with no `link` must appear in `IngestResult.errors` and must
   not appear in `IngestResult.items`.

   **Test: parsedCount equals the count of valid items**
   Assert `parsedCount === items.length` and `fetchedCount` equals total items in
   the fixture.

4. Create `packages/connectors/src/rss/{slug}/connector.test.ts`:

   **Test: connector implements Connector interface**
   Assert `connector.slug === '{slug}'` and `connector.type === 'rss'`.

   **Test: run() returns IngestResult shape**
   Mock the HTTP fetch (do not call live URL). Assert `run()` resolves to an object
   with `fetchedCount`, `parsedCount`, `items`, `errors` fields.

5. Run tests and confirm failures:
   ```bash
   pnpm --filter @clydeculture/connectors test rss
   ```

6. Confirm no existing tests are broken.

---

## Non-Goals

- Do not implement the connector.
- Do not call live RSS URLs.
- Do not add the connector to `sweep.ts` yet.
- Do not add `rss-parser` as a dependency — raise a blocker if it is missing.

---

## Validation Commands

```bash
pnpm --filter @clydeculture/connectors test rss
```

Expected: 8 new tests fail; no existing tests broken.

---

## Required Output Format

State the approved venue used and its slug.
For each new test: file path, test name, assertion, and failure reason.
Note any blockers (e.g. missing `rss-parser`).

End with:

> Ready for implementation. Prompt me with: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`

---

## Acceptance Criteria

- [ ] `rss-parser` confirmed present (or blocker raised)
- [ ] Fixture file created with 3–5 items (valid + date-missing + no-link)
- [ ] 8 failing tests created across parse and connector test files
- [ ] Link-first compliance test included
- [ ] Error handling test for no-link item included
- [ ] No connector implementation written
- [ ] No live HTTP calls in tests
