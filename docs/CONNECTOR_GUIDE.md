# Connector Guide

A connector is a TypeScript module that implements the `Connector` interface and pulls
events from one upstream source. Connectors are completely isolated — a failure in one
must never affect any other. This guide covers everything you need to build and register
a new connector.

---

## 1. Choose a source type

The preferred integration order is: **API → RSS/iCal → JSON-LD (static HTML) → HTML
(Crawlee) → Apify actor**. Apply the earliest option that provides sufficient structured
data. See [ADR 0003](decisions/0003-scraping-strategy.md) for the full rationale.

| Type | When to use | Tier | Maintenance |
|------|-------------|------|-------------|
| `api` | Source exposes a REST/JSON API with stable identifiers | 1 | Near zero |
| `rss` | Venue or promoter publishes an RSS feed | 2 | Near zero |
| `ical` | Venue publishes an `.ics` calendar link | 2 | Near zero |
| `html` | No feed exists; parse HTML with Crawlee (CSS selectors or JSON-LD) | 3 | Occasional |
| `apify` | Source is JS-heavy or a maintained Apify Store actor exists (e.g. DICE.fm, Eventbrite) | 2 | Low — pin actor version |

`html` connectors use **Crawlee** (`CheerioCrawler` for static pages, `PlaywrightCrawler`
for JS-rendered pages). They are the most fragile source type — a layout change on the
source site silently breaks the scraper with no HTTP error to catch. The platform's
break detection (a 70% drop in parsed count vs. the 14-day median) exists mainly for
Tier 3. Prefer RSS, iCal, or JSON-LD if the venue publishes them.

`apify` connectors call the Apify API from inside a Trigger.dev task: trigger an actor
run, poll for completion, fetch the output dataset, and convert to `RawEvent[]`. The
connector interface (`run() → IngestResult`) is unchanged; the Apify HTTP calls are
implementation details inside `run()`.

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
packages/connectors/src/apify/dice/index.ts
packages/connectors/src/apify/eventbrite/index.ts
```

---

## 3. Implement the interface

The full contract is in [packages/connectors/src/connector.ts](../packages/connectors/src/connector.ts):

```ts
export type SourceType = "api" | "rss" | "ical" | "html" | "apify" | "manual";

export interface RawEvent {
  externalId: string;           // stable upstream identifier — see section 4
  externalUrl: string;          // required — Clyde Culture is link-first
  title: string;
  startAt?: string;             // ISO 8601
  endAt?: string;               // ISO 8601
  doorsAt?: string;             // ISO 8601 — "Doors 7pm, Show 8pm"
  venueName?: string;
  eventTypeGuess?: string;
  tagsGuess?: string[];
  priceMinGuess?: number;
  priceMaxGuess?: number;
  isFreeGuess?: boolean;
  ticketUrlGuess?: string;
  ticketUrlLabelGuess?: string;
  imageUrlGuess?: string;
  availabilityGuess?: string;   // e.g. "onsale", "sold_out", "cancelled"
  raw: unknown;                 // full upstream payload, kept for debugging
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

**Required fields:** `externalId`, `externalUrl`, `title`, and `raw` — every `RawEvent`
must carry all four. Skip records where you cannot supply a stable id or a valid HTTPS
URL; push a descriptive string to `errors` instead.

**Optional fields:** everything else. Many sources will not provide all of them —
that is expected. Pass through whatever the source makes available and omit the rest.
Do not invent or default a value for an optional field; the normalisation pipeline
decides how to use what is present.

**Dates and times** (`startAt`, `endAt`, `doorsAt`) must be ISO 8601 strings
(`"2026-07-01T19:00:00Z"`) where provided. Leave the field absent if the source does
not supply it.

---

**`run()` must not throw.** All errors — network failures, parse errors, unexpected
payloads — go into `IngestResult.errors` as plain strings. This is the isolation
contract: an unhandled exception propagating out of `run()` would crash the Trigger.dev
task and silently skip every connector that follows. Trigger.dev's per-task isolation
means a crashed task does not affect other connector tasks, but the broken connector's
own `ingest_runs` row will not be updated correctly if `run()` throws.

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

**Store:** `title`, `startAt`, `endAt`, `doorsAt`, `venueName`, `eventTypeGuess`,
`tagsGuess`, `priceMinGuess`, `priceMaxGuess`, `isFreeGuess`, `ticketUrlGuess`,
`ticketUrlLabelGuess`, `imageUrlGuess`, `availabilityGuess` — where the source provides
them. All are optional; omit rather than guess.

**Do not store:** full event descriptions, promotional copy, or images from link-only
sources such as Resident Advisor or Instagram. These sources are designed to be linked
to, not scraped. Storing their content violates their terms of service and the
platform's own principles.

When in doubt: less is more. The `externalUrl` is what matters.

**Image storage policy:** Before storing `imageUrlGuess` from any API source,
confirm that the provider's API terms permit hot-linking or image display in a
third-party site. Ticketmaster's terms are documented in
[`docs/decisions/0004-ticketmaster-image-usage.md`](decisions/0004-ticketmaster-image-usage.md).
If terms are unclear, do not set `imageUrlGuess` — the normalisation pipeline
will leave `events.image_url` null for that source. Never download or
proxy-cache image binaries from any source.

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

After registering the source, create a Trigger.dev task in `trigger/tasks/` that calls
the connector's `run()` method, writes the `ingest_runs` row, and upserts items into
`external_events`. Add the connector to the parent sweep task's fan-out list. See ADR
0002 for the Trigger.dev task model.

---

## 8. Pre-flight checklist (HTML and Apify connectors)

Before writing any code for an `html` or `apify` connector, complete this checklist and
record the findings as comments in the connector's source file header. This checklist
applies every time — not just for the first build.

- [ ] **robots.txt** — Check `https://<domain>/robots.txt`. Does it allow crawling the
  events listing path? If the relevant path is disallowed, do not build the connector.
  Propose alternative coverage (iCal, RSS, or link-out only) and open an issue instead.

- [ ] **Terms of service** — Does the site's ToS explicitly permit or prohibit automated
  access? Sources that prohibit scraping cannot be added. If the ToS is ambiguous,
  raise the question in a discussion thread before writing any code.

- [ ] **JSON-LD structured data** — Check whether the events listing page embeds
  `<script type="application/ld+json">` with `schema.org/Event` markup. If it does,
  prefer JSON-LD extraction over CSS selector scraping — it is more stable and more
  likely to survive redesigns. Document the result (present/absent) in the connector
  header.

- [ ] **Static vs JS-rendered** — Test with `curl` or a plain `fetch()`: are event
  titles and dates visible in the raw HTML response, or does the page require JavaScript
  execution? If JS is required, document it and use `PlaywrightCrawler`. Record which
  Crawlee crawler type is needed.

---

## 9. Test locally

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

Check off the following before opening a PR:

- [ ] `parsedCount > 0`
- [ ] `errors` is empty or contains only expected skips
- [ ] Every item in `items` has a non-empty `externalId` and `externalUrl`
- [ ] `externalId` values are stable — running the connector twice produces the same IDs
- [ ] `externalUrl` values load in a browser and point to the source's own page
- [ ] `run()` does not throw — wrap the call in a try/catch to confirm
- [ ] Pre-flight checklist (section 8) completed and findings recorded in the connector
  source header (HTML and Apify connectors only)

Once the connector passes the smoke test, open a pull request. The review will check the
above list and verify the `sources` row is included in a migration or seed file.

---

## 10. Planned: cultural-graph connector responsibilities (ADR 0005)

> **Direction, not current state.** As the cultural-graph model lands, connector
> authors take on a few more responsibilities. None of the fields below exist yet —
> verify against `supabase/migrations/`.

**Per-source media-rights classification (required).** Record, in the connector source
header / SPEC and in `docs/source-policy.md`, whether the source's media may be
displayed. Default is **not permitted** until reviewed. See `docs/MEDIA_POLICY.md`. Set
`imageUrlGuess` only for sources whose image-display terms are reviewed and documented.

**Source capability checklist (on registration).** Declare what the source can supply so
field-level provenance and source priority are principled (`docs/INGESTION.md` — source
capability matrix): times/doors, venue identity, ticket/booking link, price,
availability/cancellation, media (display-permitted?), organiser/artist.

**Source trust class (on registration).** Classify the source as
`api / feed / scrape / partner / community / editor` (`docs/INGESTION.md`). Class feeds
the **trust** signal (ADR 0006), separate from the quality `tier`.

**Entity extraction (link-first, provisional).** Where the source exposes organiser /
promoter / artist names, emit them as provisional entity links — a name + canonical link
only, never biographies (`docs/ENTITIES.md`). Organisers/collectives are prioritised
over artists (B2a before B2b).

**Idempotent re-ingest.** For high-frequency sources (e.g. cinema showings), ensure
stable per-occurrence `externalId`s so daily re-pulls are no-op upserts, not row churn
(`docs/INGESTION.md` — high-frequency re-ingest idempotency).
