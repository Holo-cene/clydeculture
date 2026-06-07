import type { IngestResult, RawEvent } from '../../connector.js';
import { parseTicketmasterEvents } from './parse.js';

const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const GLASGOW_PARAMS: Record<string, string> = {
  latlong: '55.8642,-4.2518',
  radius: '10',
  unit: 'km',
  countryCode: 'GB',
};

export interface TicketmasterPageParams {
  apiKey: string;
  size?: number;
  page?: number;
  startDateTime?: string;
  endDateTime?: string;
}

export function buildTicketmasterUrl(params: TicketmasterPageParams): string {
  const query = new URLSearchParams({
    apikey: params.apiKey,
    ...GLASGOW_PARAMS,
  });
  if (params.size !== undefined) query.set('size', String(params.size));
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.startDateTime !== undefined) query.set('startDateTime', params.startDateTime);
  if (params.endDateTime !== undefined) query.set('endDateTime', params.endDateTime);
  return `${TM_BASE_URL}?${query.toString()}`;
}

export async function fetchTicketmasterPage(
  params: TicketmasterPageParams
): Promise<IngestResult> {
  const errors: string[] = [];
  let items: RawEvent[] = [];
  let fetchedCount = 0;

  try {
    const url = buildTicketmasterUrl(params);
    const response = await fetch(url);

    if (!response.ok) {
      errors.push(`HTTP ${response.status} ${response.statusText}`);
    } else {
      const data = await response.json() as unknown;

      if (
        typeof data === 'object' &&
        data !== null &&
        '_embedded' in data
      ) {
        const paged = data as { _embedded: { events: unknown[] } };
        fetchedCount = paged._embedded.events.length;
        items = parseTicketmasterEvents(paged);
      }
      // No _embedded = zero results for this query window — fetchedCount stays 0
    }
  } catch (err) {
    errors.push(`Fetch failed: ${String(err)}`);
  }

  return { fetchedCount, parsedCount: items.length, items, errors };
}
