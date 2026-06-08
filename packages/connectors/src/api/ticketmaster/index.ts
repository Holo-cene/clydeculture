import type { Connector, IngestResult, RawEvent } from '../../connector.js';
import { describeTicketmasterDateSkip, parseTicketmasterEvents } from './parse.js';
import { buildTicketmasterUrl } from './fetch.js';

const WINDOW_COUNT = 5;
const WINDOW_DAYS = 14;
const DEFAULT_MAX_PAGES = 5;
const PAGE_SIZE = 200;

export interface TicketmasterConnectorConfig {
  apiKey: string;
  /** Override "today" for deterministic testing. Defaults to new Date(). */
  startDate?: Date;
  /** Milliseconds to sleep between page requests. Defaults to 250. Set 0 in tests. */
  pageSleepMs?: number;
  /** Max pages fetched per 14-day window before stopping. Defaults to 5. */
  maxPagesPerWindow?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createTicketmasterConnector(
  config: TicketmasterConnectorConfig
): Connector {
  const { apiKey, pageSleepMs = 250, maxPagesPerWindow = DEFAULT_MAX_PAGES } = config;

  return {
    slug: 'ticketmaster',
    type: 'api',

    async run(): Promise<IngestResult> {
      const errors: string[] = [];
      const items: RawEvent[] = [];
      let fetchedCount = 0;

      const today = config.startDate ?? new Date();

      for (let w = 0; w < WINDOW_COUNT; w++) {
        const windowStart = addDays(today, w * WINDOW_DAYS);
        const windowEnd = addDays(today, w * WINDOW_DAYS + WINDOW_DAYS - 1);
        const startDateTime = `${toIsoDate(windowStart)}T00:00:00Z`;
        const endDateTime = `${toIsoDate(windowEnd)}T23:59:59Z`;

        let page = 0;
        let pagesInWindow = 0;

        for (;;) {
          try {
            if (pageSleepMs > 0 && (page > 0 || w > 0)) {
              await sleep(pageSleepMs);
            }

            const url = buildTicketmasterUrl({
              apiKey,
              size: PAGE_SIZE,
              page,
              startDateTime,
              endDateTime,
            });

            const response = await fetch(url);

            if (!response.ok) {
              errors.push(
                `HTTP ${response.status} ${response.statusText} (window ${startDateTime}–${endDateTime}, page ${page})`
              );
              break;
            }

            const data = (await response.json()) as unknown;

            let pageEvents: unknown[] = [];
            let totalPages = 1;

            if (typeof data === 'object' && data !== null) {
              const d = data as Record<string, unknown>;

              if (
                '_embedded' in d &&
                typeof d['_embedded'] === 'object' &&
                d['_embedded'] !== null
              ) {
                const emb = d['_embedded'] as Record<string, unknown>;
                if (Array.isArray(emb['events'])) {
                  pageEvents = emb['events'] as unknown[];
                }
              }

              if (
                'page' in d &&
                typeof d['page'] === 'object' &&
                d['page'] !== null
              ) {
                const pi = d['page'] as Record<string, unknown>;
                if (typeof pi['totalPages'] === 'number') {
                  totalPages = pi['totalPages'];
                }
              }
            }

            fetchedCount += pageEvents.length;

            const pageItems = parseTicketmasterEvents({
              _embedded: { events: pageEvents },
            });
            for (const pageEvent of pageEvents) {
              const dateSkip = describeTicketmasterDateSkip(pageEvent);
              if (dateSkip !== undefined) errors.push(dateSkip);
            }
            items.push(...pageItems);
            pagesInWindow++;

            const isLastPage = page >= totalPages - 1;
            const capReached = pagesInWindow >= maxPagesPerWindow;

            if (isLastPage) {
              if (pageEvents.length === PAGE_SIZE) {
                errors.push(
                  `Non-fatal: window ${startDateTime}–${endDateTime} final page returned 200 results; results may be truncated. Consider narrowing to 7-day sub-windows.`
                );
              }
              break;
            }

            if (capReached) {
              errors.push(
                `Non-fatal: window ${startDateTime}–${endDateTime} paging cap reached at ${pagesInWindow} pages; more results may exist beyond page ${page}.`
              );
              break;
            }

            page++;
          } catch (err) {
            errors.push(
              `Fetch failed (window ${startDateTime}–${endDateTime}, page ${page}): ${String(err)}`
            );
            break;
          }
        }
      }

      return { fetchedCount, parsedCount: items.length, items, errors };
    },
  };
}

export const ticketmasterConnector: Connector = createTicketmasterConnector({
  apiKey: process.env['TICKETMASTER_API_KEY'] ?? '',
});
