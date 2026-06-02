# Connector Guide

A connector is a TypeScript module that implements the `Connector` interface and pulls
events from one upstream source. Connectors are completely isolated — a failure in one
must never affect any other. This guide covers everything you need to build and register
a new connector.

---

## 1. Choose a source type

| Type | When to use | Tier | Maintenance |
|------|-------------|------|-------------|
| `api` | Source exposes a REST/JSON API with stable identifiers | 1 | Near zero |
| `rss` | Venue or promoter publishes an RSS feed | 2 | Near zero |
| `ical` | Venue publishes an `.ics` calendar link | 2 | Near zero |
| `html` | No feed exists; you must parse HTML with CSS selectors | 3 | Occasional |

`html` connectors are the most fragile. A layout change on the source site silently
breaks the scraper — there is no HTTP error to catch. The platform's break detection
(a 70% drop in parsed count vs. the 14-day median) exists mainly for Tier 3, but you
should still expect to fix an HTML connector a few times a year. Prefer RSS or iCal if
the venue publishes them.

---

## 2. Where the file goes

```
packages/connectors/src/{type}/{slug}/index.ts
```

The directory name is the connector's slug — a stable kebab-case machine name that must
match the `slug` column in the `sources` table exactly and must never change after the
connector is first deployed.

```
packages/connectors/src/rss/glasgow-art-map/index.ts
packages/connectors/src/api/skiddle/index.ts
packages/connectors/src/html/swg3/index.ts
```

---

## 3. Implement the interface

The full contract is in [packages/connectors/src/connector.ts](../packages/connectors/src/connector.ts):

```ts
export type SourceType = "api" | "rss" | "ical" | "html" | "manual";

export interface RawEvent {
  externalId: string;    // stable upstream identifier — see section 4
  externalUrl: string;   // required — Clyde Culture is link-first
  title: string;
  startAt?: string;      // ISO 8601
  venueName?: string;
  eventTypeGuess?: string;
  tagsGuess?: string[];
  raw: unknown;          // full upstream payload, kept for debugging
}

export interface IngestResult {
  fetchedCount: number;  // raw records retrieved from upstream
  parsedCount: number;   // records successfully shaped into RawEvent
  items: RawEvent[];
  errors: string[];
}

export interface Connector {
  readonly slug: string;
  readonly type: SourceType;
  run(): Promise<IngestResult>;
}
```

**`run()` must not throw.** All errors — network failures, parse errors, unexpected
payloads — go into `IngestResult.errors` as plain strings. This is the isolation
contract: an unhandled exception propagating out of `run()` would crash the orchestrator
and silently skip every connector that follows.

The gap between `fetchedCount` and `parsedCount` is an early signal that a source is
changing shape, so keep them accurate: increment `fetchedCount` for every raw record you
retrieve before parsing, and only increment `parsedCount` (via `items.length`) for
records that produce a valid `RawEvent`.

The standard shape:

```ts
async run(): Promise<IngestResult> {
  const errors: string[] = [];
  const items: RawEvent[] = [];
  let fetchedCount = 0;

  try {
    const data = await fetchUpstream();
    fetchedCount = data.length;

    for (const record of data) {
      try {
        items.push(toRawEvent(record));
      } catch (err) {
        errors.push(`Failed to parse record: ${String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Fetch failed: ${String(err)}`);
  }

  return { fetchedCount, parsedCount: items.length, items, errors };
}
```

---

## 4. Assign a stable externalId

`externalId` is how the ingestion pipeline deduplicates records across runs. It must be
stable (same value on every run for the same upstream event) and upstream-sourced (not a
database id, not a sequential counter).

| Source type | What to use |
|-------------|-------------|
| `api` | The upstream identifier field — `event.id`, `event.eventId`, etc. |
| `rss` | `item.guid` — fall back to a content hash if the feed omits it |
| `ical` | `event.uid` — iCal UIDs are defined to be globally unique |
| `html` | Content hash of venue name, start date, and normalised title |

Hash fallback (used for RSS feeds that omit GUIDs, and for all HTML connectors):

```ts
import { createHash } from "crypto";

function contentHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

// RSS fallback
const externalId = item.guid ?? contentHash(item.link ?? "", item.title ?? "");

// HTML
const externalId = contentHash(venueName, startDate, title.toLowerCase().trim());
```

---

## 5. The link-first rule

`externalUrl` is required on every `RawEvent`. If you cannot construct a URL for a
record, skip it and push a descriptive error string — do not emit a `RawEvent` without
one.

Clyde Culture is a discovery and routing layer, not a publisher. Every event on the
platform links back to its origin. This shapes what you store:

**Store:** `title`, `startAt`, `venueName`, `eventTypeGuess`, `tagsGuess`. A short
summary line is fine where the source provides one.

**Do not store:** full event descriptions, promotional copy, or images from link-only
sources such as Resident Advisor or Instagram. These sources are designed to be linked
to, not scraped. Storing their content violates their terms of service and the
platform's own principles.

When in doubt: less is more. The `externalUrl` is what matters.

---

## 6. Worked example: RSS connector

A complete connector for a Substack RSS feed. This can be used as a starting template
for any RSS source.

```ts
// packages/connectors/src/rss/glasgow-art-map/index.ts
import Parser from "rss-parser";
import { createHash } from "crypto";
import type { Connector, IngestResult, RawEvent } from "../../connector";

const parser = new Parser();
const FEED_URL = "https://glasgowartmap.substack.com/feed";

function guidOrHash(link: string | undefined, title: string | undefined): string {
  return createHash("sha256")
    .update(`${link ?? ""}|${title ?? ""}`)
    .digest("hex");
}

export const glasgowArtMapConnector: Connector = {
  slug: "glasgow-art-map",
  type: "rss",

  async run(): Promise<IngestResult> {
    const errors: string[] = [];
    const items: RawEvent[] = [];
    let fetchedCount = 0;

    try {
      const feed = await parser.parseURL(FEED_URL);
      fetchedCount = feed.items.length;

      for (const item of feed.items) {
        try {
          if (!item.link) {
            errors.push(`Skipped item with no link: ${item.title ?? "(untitled)"}`);
            continue;
          }

          items.push({
            externalId: item.guid ?? guidOrHash(item.link, item.title),
            externalUrl: item.link,
            title: item.title ?? "(untitled)",
            // DO NOT use item.isoDate here for newsletter sources — isoDate is the
            // newsletter publication date, not the event date described in the post.
            // Leave startAt undefined; the normalisation pipeline will mark these
            // as low-confidence and route them to the moderation queue.
            startAt: undefined,
            // No venueName: this is an arts listings newsletter, not a single venue.
            // No description: link-first — the Substack post is the canonical content.
            raw: item,
          });
        } catch (err) {
          errors.push(`Failed to parse item "${item.title}": ${String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Feed fetch failed: ${String(err)}`);
    }

    return { fetchedCount, parsedCount: items.length, items, errors };
  },
};
```

If `rss-parser` is not yet installed in the connectors package:

```
pnpm --filter @clydeculture/connectors add rss-parser
pnpm --filter @clydeculture/connectors add -D @types/rss-parser
```

---

## 7. Register in the sources table

Add a row to the `sources` table. Use a migration file under `supabase/migrations/` if
this is going into the shared database; run it directly against your local Supabase
instance during development.

```sql
INSERT INTO sources (slug, source_type, tier, config, enabled)
VALUES (
  'glasgow-art-map',
  'rss',
  2,
  '{"feedUrl": "https://glasgowartmap.substack.com/feed"}',
  true
);
```

| Column | Notes |
|--------|-------|
| `slug` | Must exactly match `connector.slug` in the TypeScript module |
| `source_type` | Must match `connector.type` |
| `tier` | 1–4, see the table in section 1 |
| `config` | Non-secret connector settings — endpoint URL, query parameters, pagination config |
| `enabled` | Set `false` if you want to register it without immediately activating it |

**Credentials go in Supabase Vault or environment variables, never in `config`.** The
`config` column is visible to anyone with database access and is not encrypted.

---

## 8. Test locally

No test framework needed for a quick smoke test. Create a `scratch/` directory at the
repo root (gitignored; not committed) and add a test file:

```ts
// scratch/test-glasgow-art-map.ts
import { glasgowArtMapConnector } from "../packages/connectors/src/rss/glasgow-art-map";

const result = await glasgowArtMapConnector.run();

console.log("fetched:", result.fetchedCount);
console.log("parsed:", result.parsedCount);
console.log("errors:", result.errors);
console.log("first item:", JSON.stringify(result.items[0], null, 2));
```

Run it with:

```
npx tsx scratch/test-glasgow-art-map.ts
```

**Before building an HTML connector, verify:**

- [ ] `robots.txt` at the source domain does not disallow crawling the events path. Check `https://<domain>/robots.txt` and record the finding in the connector's implementation notes. If crawling is disallowed, do not build the connector — propose alternative coverage (iCal, RSS, or link-out only) instead.
- [ ] The event listing page renders in a static fetch (no JS required). Test with `curl` or a plain `fetch()` and confirm that event titles and dates are visible in the raw HTML. If the page requires JavaScript execution, document it as a JS-rendered source and raise as a blocker (see API-06).

Check off the following before opening a PR:

- [ ] `parsedCount > 0`
- [ ] `errors` is empty or contains only expected skips
- [ ] Every item in `items` has a non-empty `externalId` and `externalUrl`
- [ ] `externalId` values are stable — running the connector twice produces the same IDs
- [ ] `externalUrl` values load in a browser and point to the source's own page
- [ ] `run()` does not throw — wrap the call in a try/catch to confirm

Once the connector passes the smoke test, open a pull request. The review will check the
above list and verify the `sources` row is included in a migration or seed file.
