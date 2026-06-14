import { TICKETMASTER_SOURCE_POLICY } from '../sourcePolicy.js';

export interface PublicEventForAttribution {
  image_url?: string | null;
  ticket_url?: string | null;
  ticket_url_label?: string | null;
  source_url?: string | null;
}

export interface SourceAttribution {
  label: string;
  href: string;
}

function isTicketmasterEvent(event: PublicEventForAttribution): boolean {
  return event.ticket_url_label === TICKETMASTER_SOURCE_POLICY.attributionLabel;
}

function pickSourceLink(event: PublicEventForAttribution): string | null {
  const ticket = typeof event.ticket_url === 'string' ? event.ticket_url.trim() : '';
  if (ticket.length > 0) return ticket;
  const source = typeof event.source_url === 'string' ? event.source_url.trim() : '';
  if (source.length > 0) return source;
  return null;
}

export function ticketmasterSourceLink(event: PublicEventForAttribution): string | null {
  if (!isTicketmasterEvent(event)) return null;
  return pickSourceLink(event);
}

export function ticketmasterAttribution(
  event: PublicEventForAttribution,
): SourceAttribution | null {
  if (!isTicketmasterEvent(event)) return null;
  const href = pickSourceLink(event);
  if (!href) return null;
  return {
    label: TICKETMASTER_SOURCE_POLICY.attributionLabel,
    href,
  };
}

export function ticketmasterImageHotlink(event: PublicEventForAttribution): string | null {
  if (!isTicketmasterEvent(event)) return null;
  const image = typeof event.image_url === 'string' ? event.image_url.trim() : '';
  if (image.length === 0) return null;
  if (!image.toLowerCase().startsWith('https://')) return null;
  return image;
}
