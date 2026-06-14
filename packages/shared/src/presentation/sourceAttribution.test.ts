import { describe, expect, it } from 'vitest';
import {
  ticketmasterAttribution,
  ticketmasterImageHotlink,
  ticketmasterSourceLink,
  type PublicEventForAttribution,
} from './sourceAttribution.js';

const TICKETMASTER_EVENT: PublicEventForAttribution = {
  image_url: 'https://s1.ticketm.net/dam/a/123/mogwai.jpg',
  ticket_url: 'https://www.ticketmaster.co.uk/event/abc',
  ticket_url_label: 'Buy on Ticketmaster',
  source_url: 'https://www.ticketmaster.co.uk/event/abc',
};

describe('ticketmasterAttribution (ADR 0004)', () => {
  it('returns "Buy on Ticketmaster" when the event carries the Ticketmaster ticket label', () => {
    const result = ticketmasterAttribution(TICKETMASTER_EVENT);
    expect(result).toEqual({
      label: 'Buy on Ticketmaster',
      href: 'https://www.ticketmaster.co.uk/event/abc',
    });
  });

  it('returns null for events without a Ticketmaster label', () => {
    expect(
      ticketmasterAttribution({ ticket_url_label: 'Book at venue' }),
    ).toBeNull();
    expect(ticketmasterAttribution({})).toBeNull();
  });

  it('returns null when no source link is available', () => {
    expect(
      ticketmasterAttribution({ ticket_url_label: 'Buy on Ticketmaster' }),
    ).toBeNull();
  });

  it('prefers ticket_url over source_url for the attribution link', () => {
    const result = ticketmasterAttribution({
      ticket_url_label: 'Buy on Ticketmaster',
      ticket_url: 'https://www.ticketmaster.co.uk/event/ticket',
      source_url: 'https://www.ticketmaster.co.uk/event/listing',
    });
    expect(result?.href).toBe('https://www.ticketmaster.co.uk/event/ticket');
  });

  it('falls back to source_url when ticket_url is missing', () => {
    const result = ticketmasterAttribution({
      ticket_url_label: 'Buy on Ticketmaster',
      source_url: 'https://www.ticketmaster.co.uk/event/listing',
    });
    expect(result?.href).toBe('https://www.ticketmaster.co.uk/event/listing');
  });
});

describe('ticketmasterSourceLink', () => {
  it('returns the Ticketmaster source link for Ticketmaster events', () => {
    expect(ticketmasterSourceLink(TICKETMASTER_EVENT)).toBe(
      'https://www.ticketmaster.co.uk/event/abc',
    );
  });

  it('returns null when the event is not Ticketmaster-sourced', () => {
    expect(
      ticketmasterSourceLink({
        ticket_url: 'https://example.com',
        ticket_url_label: 'Tickets',
      }),
    ).toBeNull();
  });
});

describe('ticketmasterImageHotlink (no binary caching, ADR 0004)', () => {
  it('returns the HTTPS CDN URL for Ticketmaster events with an image', () => {
    expect(ticketmasterImageHotlink(TICKETMASTER_EVENT)).toBe(
      'https://s1.ticketm.net/dam/a/123/mogwai.jpg',
    );
  });

  it('returns null when the event has no image', () => {
    expect(
      ticketmasterImageHotlink({
        ticket_url_label: 'Buy on Ticketmaster',
        ticket_url: 'https://www.ticketmaster.co.uk/event/abc',
      }),
    ).toBeNull();
    expect(
      ticketmasterImageHotlink({
        ticket_url_label: 'Buy on Ticketmaster',
        ticket_url: 'https://www.ticketmaster.co.uk/event/abc',
        image_url: null,
      }),
    ).toBeNull();
  });

  it('rejects non-HTTPS image URLs to keep hot-linking on the Ticketmaster CDN safe', () => {
    expect(
      ticketmasterImageHotlink({
        ...TICKETMASTER_EVENT,
        image_url: 'http://s1.ticketm.net/insecure.jpg',
      }),
    ).toBeNull();
  });

  it('returns null when the event is not Ticketmaster-sourced (no cross-source caching)', () => {
    expect(
      ticketmasterImageHotlink({
        ticket_url_label: 'Other source',
        image_url: 'https://example.com/img.jpg',
      }),
    ).toBeNull();
  });
});
