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
    start?: { dateTime?: string };
    doorOpenTime?: string;
    status?: { code?: string };
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
  return candidates[0]?.url;
}

function primarySegmentId(classifications: TmClassification[] | undefined): string | undefined {
  if (!classifications || classifications.length === 0) return undefined;
  const cls = classifications.find(c => c.primary === true) ?? classifications[0];
  const id = cls?.segment?.id;
  return id !== undefined ? id.toLowerCase() : undefined;
}

/**
 * Maps a Ticketmaster Discovery API response to RawEvent[].
 *
 * Implements Step 1 of the startAt fallback chain only (dateTime already UTC).
 * TODO: add localDate+localTime fallback and timeTBA midnight placeholder when needed.
 */
export function parseTicketmasterEvents(
  response: { _embedded: { events: unknown[] } }
): RawEvent[] {
  const items: RawEvent[] = [];

  for (const raw of response._embedded.events) {
    if (!isTmEvent(raw)) continue;

    const externalUrl = raw.url;
    if (!isValidHttpsUrl(externalUrl)) continue;

    // Fallback chain step 1: use dateTime when present (already UTC).
    // Events where no dateTime is available are skipped per SPEC §4.
    const startAt = raw.dates?.start?.dateTime;
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
