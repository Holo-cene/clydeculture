export {
  ticketmasterAttribution,
  ticketmasterImageHotlink,
  ticketmasterSourceLink,
} from '@clydeculture/shared';
export type { SourceAttribution } from '@clydeculture/shared';

export interface EventView {
  title?: string;
  slug?: string;
  start_at?: string;
  source_url?: string;
  ticket_url?: string;
  ticket_url_label?: string;
  image_url?: string | null;
  summary?: string | null;
  price_display?: string | null;
  is_free?: boolean | null;
  availability?: string | null;
  venues?: {
    name?: string;
    slug?: string;
  } | null;
  event_types?: {
    label?: string;
    slug?: string;
  } | null;
  festivals?: {
    name?: string;
    slug?: string;
  } | null;
}

export interface VenueView {
  name?: string;
  slug?: string;
  website?: string | null;
  address?: string | null;
  area?: string | null;
}

export function asEventView(value: unknown): EventView {
  return isRecord(value) ? (value as EventView) : {};
}

export function asEventViews(values: unknown[]): EventView[] {
  return values.map(asEventView);
}

export function asVenueView(value: unknown): VenueView {
  return isRecord(value) ? (value as VenueView) : {};
}

export function formatDateTime(value?: string): string {
  if (!value) return 'Date to be confirmed';

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(new Date(value));
}

export function sourceHref(event: EventView): string | undefined {
  return event.source_url || event.ticket_url;
}

export function sourceName(event: EventView): string {
  return event.ticket_url_label || 'Original source';
}

export function formatTicketing(event: EventView): string | null {
  const price =
    event.price_display ??
    (event.is_free === true ? 'Free' : event.is_free === false ? 'Paid' : null);
  const status = event.availability ?? null;
  if (!price && !status) return null;
  return [price, status].filter(Boolean).join(' · ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
