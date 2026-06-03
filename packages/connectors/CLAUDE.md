# connectors package — Claude Code reference

Every connector is a TypeScript module implementing the `Connector` interface in
`src/connector.ts`. Full guide: `docs/CONNECTOR_GUIDE.md`.

## Invariants

- `run()` **must not throw** — catch everything and return errors in `IngestResult.errors`
- `externalUrl` is **required** on every `RawEvent` — skip records you can't link and push an error
- `externalId` must be **stable and upstream-sourced** — not a DB id, not a counter
- **Never store full descriptions or images** from link-only sources (RA, Instagram)
- `connector.slug` must **exactly match** the `sources.slug` database row

## externalId by source type

| Type | Use |
|------|-----|
| `api` | Upstream identifier field (`event.id`, `event.eventId`, etc.) |
| `rss` | `item.guid` — fall back to `sha256(link \| title)` if absent |
| `ical` | `event.uid` |
| `html` | `sha256(venueName \| startDate \| title.toLowerCase().trim())` |
| `apify` | Actor output's event ID field (dataset item ID as fallback) |

Hash helper:
```ts
import { createHash } from "crypto";
const h = (...parts: string[]) =>
  createHash("sha256").update(parts.join("|")).digest("hex");
```

## Apify connectors

An Apify connector triggers a managed actor on the Apify platform, polls for
completion, and maps the output dataset to `RawEvent[]` using the standard
`Connector` interface. No CSS selectors, `robots.txt` checks, or Playwright —
all extraction is delegated to the actor.

Steps:

1. `POST /v2/acts/{actorId}/runs` with input from `sources.config`
2. Poll `GET /v2/actor-runs/{runId}` until `status === "SUCCEEDED"` (or fail
   with the Apify run URL for debugging)
3. `GET /v2/datasets/{defaultDatasetId}/items`
4. `items.map(item => toRawEvent(item))`

```
// Apify connector pattern:
// 1. POST /v2/acts/{actorId}/runs  with input from sources.config
// 2. Poll GET /v2/actor-runs/{runId} until status = SUCCEEDED
// 3. GET /v2/datasets/{defaultDatasetId}/items
// 4. items.map(item => toRawEvent(item))
```

The actor version **must** be pinned in `sources.config` — never use `latest`.
`externalId` is the actor output's event ID field; fall back to the Apify
dataset item ID only when no upstream ID is present in the payload.

> **Apify connectors are input/output mappers only.** They do not use CSS
> selectors, `robots.txt` checking, or Playwright — all extraction is
> delegated to the Apify actor. The connector's job is: (a) trigger the actor
> with the right input, (b) poll for completion, (c) map output dataset to
> `RawEvent[]`. Actor selection, version pinning, and ToS compliance are
> verified during connector pre-flight (see CC-NEW-2 for DICE.fm pre-flight).
> Reference: ADR 0003.

> **`SourceType` includes `"apify"`** — it is a canonical value in both the TypeScript
> union and the `sources.source_type` CHECK constraint (added in A1 migration). Do not
> use `"html"` as a workaround for Apify connectors.

## Skeleton

```ts
// packages/connectors/src/{type}/{slug}/index.ts
import type { Connector, IngestResult, RawEvent } from "../../connector";

export const myConnector: Connector = {
  slug: "my-slug",   // TODO: kebab-case, matches sources.slug
  type: "rss",       // TODO: api | rss | ical | html | apify

  async run(): Promise<IngestResult> {
    const errors: string[] = [];
    const items: RawEvent[] = [];
    let fetchedCount = 0;

    try {
      const data = await fetchUpstream(); // TODO
      fetchedCount = data.length;

      for (const record of data) {
        try {
          const externalUrl = record.url; // TODO — required
          if (!externalUrl) {
            errors.push(`Skipped record with no URL: ${record.id}`);
            continue;
          }
          items.push({
            externalId: record.id,        // TODO — stable upstream id
            externalUrl,
            title: record.title ?? "(untitled)",
            startAt: record.date ?? undefined, // ISO 8601
            venueName: record.venue ?? undefined,
            raw: record,
          });
        } catch (err) {
          errors.push(`Parse error: ${String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Fetch failed: ${String(err)}`);
    }

    return { fetchedCount, parsedCount: items.length, items, errors };
  },
};
```

## File layout

```
packages/connectors/src/{type}/{slug}/index.ts
```

Interface: `packages/connectors/src/connector.ts`

## Registration (run after building)

```sql
INSERT INTO sources (slug, source_type, tier, config, enabled)
VALUES ('my-slug', 'rss', 2, '{"feedUrl": "https://..."}', true);
-- tier: 1=api  2=rss/ical/apify  3=html  4=enrichment
-- credentials go in Vault/env, never in config
```

Apify example:

```sql
INSERT INTO sources (slug, source_type, tier, config, enabled)
VALUES (
  'eventbrite-apify',
  'apify',
  2,
  '{"actorId": "jaroslavhejlek/eventbrite-scraper", "actorVersion": "0.1.2", "input": {"location": "Glasgow", "maxItems": 200}}',
  true
);
-- actorVersion must be pinned — never use "latest"
-- Apify API token goes in Vault/env (APIFY_TOKEN), never in config
```
