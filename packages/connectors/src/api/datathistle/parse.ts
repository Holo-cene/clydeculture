import type { RawEvent } from '../../connector.js';
import { isValidHttpsUrl } from '../../validate.js';
import { mapDataThistleTags, type DataThistleCategoryMapping } from './categories.js';

type ParseResult = {
  items: RawEvent[];
  errors: string[];
};

type StagingSourcePolicy = {
  sourceSlug: string;
  allowStagingCollection: boolean;
};

type PolicyAwareParseResult<TSourcePolicy extends StagingSourcePolicy> = ParseResult & {
  sourcePolicy: TSourcePolicy;
};

const SOURCE = 'datathistle';
const OFFSET_QUALIFIED_DATETIME = /(?:Z|[+-]\d{2}:\d{2})$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isoFromDate(value: string): string | undefined {
  if (!OFFSET_QUALIFIED_DATETIME.test(value)) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().replace('.000Z', 'Z');
}

function endFromDuration(startAt: string, duration: unknown): string | undefined {
  const durationText = stringValue(duration);
  if (durationText === undefined) return undefined;

  const minutes = Number(durationText);
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return undefined;

  return new Date(start.getTime() + minutes * 60_000)
    .toISOString()
    .replace('.000Z', 'Z');
}

function tagsFrom(...values: unknown[]): string[] {
  const tags = new Set<string>();
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const tag of value) {
      const text = stringValue(tag);
      if (text !== undefined) tags.add(text);
    }
  }
  return [...tags];
}

/** Staging-friendly mapping evidence stored in raw — original tags stay in tagsGuess. */
function categoryMappingEvidence(
  mapping: DataThistleCategoryMapping
): Record<string, unknown> {
  const evidence: Record<string, unknown> = { mappingSource: mapping.mappingSource };
  if (mapping.eventTypeSlug !== undefined) evidence['eventTypeSlug'] = mapping.eventTypeSlug;
  if (mapping.matchedTag !== undefined) evidence['matchedTag'] = mapping.matchedTag;
  return evidence;
}

function bookingUrlFrom(links: unknown): string | undefined {
  for (const link of records(links)) {
    const type = stringValue(link['type'])?.toLowerCase();
    const url = stringValue(link['url']);
    if (type === 'booking' && url !== undefined && isValidHttpsUrl(url)) return url;
  }
  return undefined;
}

function sourceUrlFor(event: Record<string, unknown>, performance: Record<string, unknown>): string | undefined {
  const website = stringValue(event['website']);
  if (website !== undefined && isValidHttpsUrl(website)) return website;
  return bookingUrlFrom(performance['links']);
}

function priceFrom(tickets: unknown): {
  min?: number;
  max?: number;
  isFree?: boolean;
  currency?: string;
} {
  const minValues: number[] = [];
  const maxValues: number[] = [];
  let currency: string | undefined;

  for (const ticket of records(tickets)) {
    const ticketCurrency = stringValue(ticket['currency']);
    if (ticketCurrency !== 'GBP') continue;

    currency = ticketCurrency;
    const min = numberValue(ticket['min_price']);
    const max = numberValue(ticket['max_price']);
    if (min !== undefined) minValues.push(min);
    if (max !== undefined) maxValues.push(max);
  }

  const min = minValues.length > 0 ? Math.min(...minValues) : undefined;
  const max = maxValues.length > 0 ? Math.max(...maxValues) : undefined;

  const result: { min?: number; max?: number; isFree?: boolean; currency?: string } = {};
  if (min !== undefined) {
    result.min = min;
    result.isFree = min === 0;
  }
  if (max !== undefined) result.max = max;
  if (currency !== undefined) result.currency = currency;
  return result;
}

function rawContext(
  event: Record<string, unknown>,
  schedule: Record<string, unknown>,
  performance: Record<string, unknown>,
  placeId: string,
  placeName: string | undefined,
  performanceTs: string,
  priceCurrency: string | undefined
): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    source: SOURCE,
    eventId: event['event_id'],
    placeId,
    performanceTs,
    status: event['status'],
  };

  const createdTs = stringValue(event['created_ts']);
  if (createdTs !== undefined) raw['createdTs'] = createdTs;

  const modifiedTs = stringValue(event['modified_ts']);
  if (modifiedTs !== undefined) raw['modifiedTs'] = modifiedTs;

  const scheduleTags = tagsFrom(schedule['tags']);
  const scheduleContext: Record<string, unknown> = { placeId };
  if (placeName !== undefined) scheduleContext['placeName'] = placeName;
  if (scheduleTags.length > 0) scheduleContext['tags'] = scheduleTags;

  const performanceContext: Record<string, unknown> = { ts: performanceTs };
  const duration = stringValue(performance['duration']);
  if (duration !== undefined) performanceContext['duration'] = duration;

  const timeUnknown = stringValue(performance['time_unknown']);
  if (timeUnknown !== undefined) performanceContext['timeUnknown'] = true;

  if (priceCurrency !== undefined) performanceContext['ticketCurrency'] = priceCurrency;

  raw['schedule'] = scheduleContext;
  raw['performance'] = performanceContext;
  return raw;
}

/** Maps synthetic/OpenAPI-shaped Data Thistle events to RawEvents for feasibility tests. */
export function parseDataThistleEvents(payload: unknown): ParseResult {
  const items: RawEvent[] = [];
  const errors: string[] = [];

  if (!Array.isArray(payload)) {
    return { items, errors: ['Data Thistle payload must be an array of events'] };
  }

  for (const event of records(payload)) {
    const eventId = stringValue(event['event_id']);
    const name = stringValue(event['name']);
    const status = stringValue(event['status'])?.toLowerCase();

    if (eventId === undefined) {
      errors.push('Skipped Data Thistle event: missing event_id');
      continue;
    }

    if (name === undefined) {
      errors.push(`Skipped Data Thistle event ${eventId}: missing name`);
      continue;
    }

    if (status !== 'live') {
      errors.push(`Skipped Data Thistle event ${eventId}: non-live status ${status ?? 'unknown'}`);
      continue;
    }

    const eventTags = tagsFrom(event['tags']);
    const schedules = records(event['schedules']);
    if (schedules.length === 0) {
      errors.push(`Skipped Data Thistle event ${eventId}: missing schedules`);
      continue;
    }

    for (const schedule of schedules) {
      const place = asRecord(schedule['place']);
      const placeId = stringValue(schedule['place_id']) ?? stringValue(place?.['place_id']);
      const placeName = stringValue(place?.['name']);

      if (placeId === undefined) {
        errors.push(`Skipped Data Thistle event ${eventId}: missing place_id`);
        continue;
      }

      const performances = records(schedule['performances']);
      if (performances.length === 0) {
        errors.push(`Skipped Data Thistle event ${eventId} at ${placeId}: missing performances`);
        continue;
      }

      for (const performance of performances) {
      const performanceTs = stringValue(performance['ts']);
      if (performanceTs === undefined) {
        errors.push(`Skipped Data Thistle event ${eventId} at ${placeId}: missing performance ts`);
        continue;
      }

      const startAt = isoFromDate(performanceTs);
      if (startAt === undefined) {
        errors.push(
            `Skipped Data Thistle event ${eventId} at ${placeId}: invalid or offset-less performance ts`
        );
        continue;
      }

        const externalUrl = sourceUrlFor(event, performance);
        if (externalUrl === undefined) {
          errors.push(
            `Skipped Data Thistle event ${eventId} at ${placeId}: missing safe HTTPS externalUrl`
          );
          continue;
        }

        const bookingUrl = bookingUrlFrom(performance['links']);
        const price = priceFrom(performance['tickets']);
        const tags = tagsFrom(eventTags, schedule['tags']);
        const categoryMapping = mapDataThistleTags(tags);
        const eventType = categoryMapping.eventTypeSlug;
        const externalId = `${SOURCE}:${eventId}:${placeId}:${performanceTs}`;

        const item: RawEvent = {
          externalId,
          externalUrl,
          title: name.slice(0, 500),
          startAt,
          availabilityGuess: status,
          raw: {
            ...rawContext(event, schedule, performance, placeId, placeName, performanceTs, price.currency),
            categoryMapping: categoryMappingEvidence(categoryMapping),
          },
        };

        const endAt = endFromDuration(startAt, performance['duration']);
        if (endAt !== undefined) item.endAt = endAt;
        if (placeName !== undefined) item.venueName = placeName;
        if (eventType !== undefined) item.eventTypeGuess = eventType;
        if (tags.length > 0) item.tagsGuess = tags;
        if (price.min !== undefined) item.priceMinGuess = price.min;
        if (price.max !== undefined) item.priceMaxGuess = price.max;
        if (price.isFree !== undefined) item.isFreeGuess = price.isFree;
        if (bookingUrl !== undefined) item.ticketUrlGuess = bookingUrl;
        if (stringValue(performance['time_unknown']) !== undefined) item.timeTba = true;

        items.push(item);
      }
    }
  }

  return { items, errors };
}

export function parseDataThistleEventsForStaging<TSourcePolicy extends StagingSourcePolicy>(
  payload: unknown,
  sourcePolicy: TSourcePolicy
): PolicyAwareParseResult<TSourcePolicy> {
  if (sourcePolicy.allowStagingCollection !== true) {
    return {
      items: [],
      errors: [`Data Thistle staging collection disabled by source policy ${sourcePolicy.sourceSlug}`],
      sourcePolicy,
    };
  }

  return {
    ...parseDataThistleEvents(payload),
    sourcePolicy,
  };
}
