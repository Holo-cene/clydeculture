import type { Connector, IngestResult } from '../../connector.js';
import { parseGladCafeFeed } from './parse.js';

export interface GladCafeConnectorConfig {
  /** RSS feed URL. Comes from sources.config or GLAD_CAFE_RSS_URL env var. */
  url: string;
  /** Override for testing — defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export function createGladCafeConnector(
  config: GladCafeConnectorConfig,
): Connector {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  return {
    slug: 'glad-cafe',
    type: 'rss',

    async run(): Promise<IngestResult> {
      const errors: string[] = [];

      let body: string;
      try {
        const response = await fetchImpl(config.url);
        if (!response.ok) {
          errors.push(
            `Glad Cafe RSS fetch failed with status ${response.status}`,
          );
          return { fetchedCount: 0, parsedCount: 0, items: [], errors };
        }
        body = await response.text();
      } catch (err) {
        errors.push(`Glad Cafe RSS fetch failed: ${String(err)}`);
        return { fetchedCount: 0, parsedCount: 0, items: [], errors };
      }

      const parsed = parseGladCafeFeed(body);
      errors.push(...parsed.errors);
      return {
        fetchedCount: parsed.fetchedCount,
        parsedCount: parsed.items.length,
        items: parsed.items,
        errors,
      };
    },
  };
}

export function gladCafeConfigFromEnv(
  env: Record<string, string | undefined>,
): GladCafeConnectorConfig | undefined {
  const url = env['GLAD_CAFE_RSS_URL'];
  if (!url) return undefined;
  return { url };
}
