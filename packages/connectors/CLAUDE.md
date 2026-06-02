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

Hash helper:
```ts
import { createHash } from "crypto";
const h = (...parts: string[]) =>
  createHash("sha256").update(parts.join("|")).digest("hex");
```

## Skeleton

```ts
// packages/connectors/src/{type}/{slug}/index.ts
import type { Connector, IngestResult, RawEvent } from "../../connector";

export const myConnector: Connector = {
  slug: "my-slug",   // TODO: kebab-case, matches sources.slug
  type: "rss",       // TODO: api | rss | ical | html

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
-- tier: 1=api  2=rss/ical  3=html  4=enrichment
-- credentials go in Vault/env, never in config
```
