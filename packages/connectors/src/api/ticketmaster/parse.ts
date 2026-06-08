import type { RawEvent } from '../../connector.js';
import { isValidHttpsUrl } from '../../validate.js';

interface TmImage {
  ratio: string;
  url: string;
  width: number;
}

interface TmClassification {
  primary?: boolean;
  segment?: { id: string };
  genre?: { name?: string };
}

interface TmPriceRange {
  min: number;
  max: number;
}

interface TmEvent {
  id: string;
  name: string;
  url: string;
  images?: TmImage[];
  dates?: {
    start?: {
      dateTime?: string;
      localDate?: string;
      localTime?: string;
      dateTBA?: boolean;
      dateTBD?: boolean;
      timeTBA?: boolean;
    };
    doorOpenTime?: string;
    status?: { code?: string };
    timezone?: string;
  };
  classifications?: TmClassification[];
  priceRanges?: TmPriceRange[];
  _embedded?: { venues?: Array<{ name?: string }> };
}

function isTmEvent(event: unknown): event is TmEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['name'] === 'string' &&
    typeof e['url'] === 'string'
  );
}

function selectImage(images: TmImage[] | undefined): string | undefined {
  if (!images) return undefined;

  const candidates = images
    .filter(img => img.ratio === '16_9' && img.width >= 640 && isValidHttpsUrl(img.url))
    .sort((a, b) => b.width - a.width);
  if (candidates[0]?.url !== undefined) return candidates[0].url;

  const fallbackCandidates = images
    .filter(img => img.width >= 640 && isValidHttpsUrl(img.url))
    .sort((a, b) => b.width - a.width);
  return fallbackCandidates[0]?.url;
}

function primaryClassification(
  classifications: TmClassification[] | undefined
): TmClassification | undefined {
  if (!classifications || classifications.length === 0) return undefined;
  return classifications.find(c => c.primary === true) ?? classifications[0];
}

function primarySegmentId(classifications: TmClassification[] | undefined): string | undefined {
  const cls = primaryClassification(classifications);
  const id = cls?.segment?.id;
  return id !== undefined ? id.toLowerCase() : undefined;
}

function primaryGenreName(classifications: TmClassification[] | undefined): string | undefined {
  const name = primaryClassification(classifications)?.genre?.name?.trim();
  if (!name || name.toLowerCase() === 'undefined') return undefined;
  return name;
}

function parseLocalDate(localDate: string): [number, number, number] | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseLocalTime(localTime: string): [number, number, number] | undefined {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localTime);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')];
}

function offsetMsAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  const wallClockAsUtc = Date.UTC(
    Number(values['year']),
    Number(values['month']) - 1,
    Number(values['day']),
    Number(values['hour']),
    Number(values['minute']),
    Number(values['second'])
  );

  return wallClockAsUtc - date.getTime();
}

function localDateTimeToUtcIso(
  localDate: string,
  localTime: string,
  timeZone: string
): string | undefined {
  const date = parseLocalDate(localDate);
  const time = parseLocalTime(localTime);
  if (!date || !time) return undefined;

  const localAsUtc = Date.UTC(date[0], date[1] - 1, date[2], time[0], time[1], time[2]);
  const offset = offsetMsAt(new Date(localAsUtc), timeZone);
  let utc = localAsUtc - offset;

  const adjustedOffset = offsetMsAt(new Date(utc), timeZone);
  if (adjustedOffset !== offset) {
    utc = localAsUtc - adjustedOffset;
  }

  return new Date(utc).toISOString().replace('.000Z', 'Z');
}

function ticketmasterStartAt(event: TmEvent): string | undefined {
  const start = event.dates?.start;
  if (!start) return undefined;

  if (start.dateTime) return start.dateTime;

  const timeZone = event.dates?.timezone ?? 'Europe/London';
  if (start.localDate && start.localTime) {
    return localDateTimeToUtcIso(start.localDate, start.localTime, timeZone);
  }

  if (start.localDate && start.timeTBA === true) {
    return localDateTimeToUtcIso(start.localDate, '00:00:00', timeZone);
  }

  return undefined;
}

export function describeTicketmasterDateSkip(raw: unknown): string | undefined {
  if (!isTmEvent(raw) || !isValidHttpsUrl(raw.url)) return undefined;
  if (ticketmasterStartAt(raw) !== undefined) return undefined;

  const start = raw.dates?.start;
  if (!start) return `Skipped Ticketmaster event ${raw.id}: missing start date`;

  const flags: string[] = [];
  if (start.dateTBA === true) flags.push('dateTBA');
  if (start.dateTBD === true) flags.push('dateTBD');
  if (start.timeTBA === true) flags.push('timeTBA');

  const reason = flags.length > 0
    ? `unresolved ${flags.join('/')}`
    : 'missing start dateTime/localDate';
  return `Skipped Ticketmaster event ${raw.id}: ${reason}`;
}

/** Maps a Ticketmaster Discovery API response to RawEvent[]. */
export function parseTicketmasterEvents(
  response: { _embedded: { events: unknown[] } }
): RawEvent[] {
  const items: RawEvent[] = [];

  for (const raw of response._embedded.events) {
    if (!isTmEvent(raw)) continue;

    const externalUrl = raw.url;
    if (!isValidHttpsUrl(externalUrl)) continue;

    const startAt = ticketmasterStartAt(raw);
    if (!startAt) continue;

    const priceRange = raw.priceRanges?.[0];

    const item: RawEvent = {
      externalId: raw.id,
      externalUrl,
      title: raw.name.trim().slice(0, 500),
      startAt,
      ticketUrlGuess: externalUrl,
      ticketUrlLabelGuess: 'Buy on Ticketmaster',
      raw,
    };

    const doorsAt = raw.dates?.doorOpenTime;
    if (doorsAt !== undefined) item.doorsAt = doorsAt;

    const venueName = raw._embedded?.venues?.[0]?.name;
    if (venueName !== undefined) item.venueName = venueName;

    const segmentId = primarySegmentId(raw.classifications);
    if (segmentId !== undefined) item.eventTypeGuess = segmentId;

    const genreName = primaryGenreName(raw.classifications);
    if (genreName !== undefined) item.tagsGuess = [genreName];

    if (priceRange !== undefined) {
      item.priceMinGuess = priceRange.min;
      item.priceMaxGuess = priceRange.max;
      item.isFreeGuess = priceRange.min === 0;
    }

    const imageUrl = selectImage(raw.images);
    if (imageUrl !== undefined) item.imageUrlGuess = imageUrl;

    const statusCode = raw.dates?.status?.code;
    if (statusCode !== undefined) item.availabilityGuess = statusCode;

    items.push(item);
  }

  return items;
}
