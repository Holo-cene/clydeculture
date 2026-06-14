import {
  DATA_THISTLE_SOURCE_POLICY,
  canUseSourceForStagingCollection,
  type SourcePolicy,
} from '@clydeculture/shared';
import type { Connector, IngestResult, RawEvent } from '../../connector.js';
import {
  createDataThistleClient,
  type DataThistleClientConfig,
  type DataThistleEventsParams,
} from './client.js';
import { parseDataThistleEventsForStaging } from './parse.js';

const DEFAULT_TOWN = 'Glasgow';
const DEFAULT_WINDOW_DAYS = 70;
const DEFAULT_MAX_PAGES = 10;
const PAGE_SIZE = 20; // documented API maximum

export interface DataThistleConnectorConfig extends DataThistleClientConfig {
  /** Override "today" for deterministic testing. Defaults to new Date(). */
  startDate?: Date;
  /** Days ahead of startDate covered by min_date/max_date. Defaults to 70. */
  windowDays?: number;
  /** Defaults to Glasgow — town filtering avoids radius bleed (SPEC.md §5). */
  town?: string;
  /** Max pages fetched per run before stopping. Defaults to 10. */
  maxPages?: number;
  /** Milliseconds to sleep between page requests. Defaults to 250. Set 0 in tests. */
  pageSleepMs?: number;
  /**
   * Source policy gate. Defaults to DATA_THISTLE_SOURCE_POLICY (staging allowed,
   * production display disabled). The connector refuses to fetch when staging
   * collection is disabled.
   */
  sourcePolicy?: SourcePolicy;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIsoDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function createDataThistleConnector(
  config: DataThistleConnectorConfig
): Connector {
  const {
    town = DEFAULT_TOWN,
    windowDays = DEFAULT_WINDOW_DAYS,
    maxPages = DEFAULT_MAX_PAGES,
    pageSleepMs = 250,
    sourcePolicy = DATA_THISTLE_SOURCE_POLICY,
  } = config;

  return {
    slug: 'datathistle',
    type: 'api',

    async run(): Promise<IngestResult> {
      const errors: string[] = [];
      const items: RawEvent[] = [];
      let fetchedCount = 0;

      if (!canUseSourceForStagingCollection(sourcePolicy)) {
        return {
          fetchedCount,
          parsedCount: 0,
          items,
          errors: [
            `Data Thistle staging collection disabled by source policy ${sourcePolicy.sourceSlug}`,
          ],
        };
      }

      const client = createDataThistleClient(config);
      const start = config.startDate ?? new Date();
      const minDate = toIsoDateTime(start);
      const maxDate = toIsoDateTime(addDays(start, windowDays));

      let page = 1;

      for (;;) {
        if (pageSleepMs > 0 && page > 1) {
          await sleep(pageSleepMs);
        }

        const params: DataThistleEventsParams = {
          town,
          minDate,
          maxDate,
          status: 'live',
          page,
          limit: PAGE_SIZE,
        };

        // Pagination strategy: the OpenAPI spec documents page/limit params and
        // Link/X-Prev/X-Next headers, but the X-Next VALUE format (path vs
        // absolute URL) is not documented. We therefore treat X-Next presence
        // as "more pages exist" and increment `page` ourselves rather than
        // following the header value. Verify against real responses in the
        // first live smoke run (SPEC.md §5).
        const result = await client.fetchEventsPage(params);
        errors.push(...result.errors);

        if (!result.ok) break;

        if (Array.isArray(result.payload)) {
          fetchedCount += result.payload.length;
        }

        const parsed = parseDataThistleEventsForStaging(result.payload, sourcePolicy);
        items.push(...parsed.items);
        errors.push(...parsed.errors);

        if (result.nextPage === undefined) break;

        if (page >= maxPages) {
          errors.push(
            `Non-fatal: Data Thistle page cap reached at ${page} pages; more results may exist (X-Next was present).`
          );
          break;
        }

        page++;
      }

      return { fetchedCount, parsedCount: items.length, items, errors };
    },
  };
}
