import type { SupabaseClient } from '@supabase/supabase-js';

/** Mirrors RawEvent from @clydeculture/connectors — structurally compatible. */
export interface ExternalEventInput {
  externalId: string;
  externalUrl: string;
  title: string;
  startAt?: string;
  endAt?: string;
  doorsAt?: string;
  venueName?: string;
  eventTypeGuess?: string;
  tagsGuess?: string[];
  priceMinGuess?: number;
  priceMaxGuess?: number;
  isFreeGuess?: boolean;
  ticketUrlGuess?: string;
  ticketUrlLabelGuess?: string;
  imageUrlGuess?: string;
  availabilityGuess?: string;
  /** Mirrors RawEvent.timeTba — true when source date is known but time is TBA. */
  timeTba?: boolean;
  /** Mirrors RawEvent.isAllDay — true when source explicitly marks this as an all-day event. */
  isAllDay?: boolean;
  raw: unknown;
}

export async function upsertExternalEvents(
  client: SupabaseClient,
  sourceId: string,
  events: ExternalEventInput[],
): Promise<void> {
  const lastSeenAt = new Date().toISOString();

  const rows = events.map(event => ({
    source_id: sourceId,
    external_id: event.externalId,
    external_url: event.externalUrl,
    title: event.title,
    raw: event.raw,
    last_seen_at: lastSeenAt,
    is_deleted: false,
    ...(event.startAt !== undefined && { start_at: event.startAt }),
    ...(event.endAt !== undefined && { end_at: event.endAt }),
    ...(event.doorsAt !== undefined && { doors_at: event.doorsAt }),
    ...(event.venueName !== undefined && { venue_name: event.venueName }),
    ...(event.eventTypeGuess !== undefined && { event_type_guess: event.eventTypeGuess }),
    ...(event.tagsGuess !== undefined && { tags_guess: event.tagsGuess }),
    ...(event.priceMinGuess !== undefined && { price_min_guess: event.priceMinGuess }),
    ...(event.priceMaxGuess !== undefined && { price_max_guess: event.priceMaxGuess }),
    ...(event.isFreeGuess !== undefined && { is_free_guess: event.isFreeGuess }),
    ...(event.ticketUrlGuess !== undefined && { ticket_url_guess: event.ticketUrlGuess }),
    ...(event.ticketUrlLabelGuess !== undefined && {
      ticket_url_label_guess: event.ticketUrlLabelGuess,
    }),
    ...(event.imageUrlGuess !== undefined && { image_url_guess: event.imageUrlGuess }),
    ...(event.availabilityGuess !== undefined && { availability_guess: event.availabilityGuess }),
    ...(event.timeTba !== undefined && { time_tba_guess: event.timeTba }),
    ...(event.isAllDay !== undefined && { is_all_day_guess: event.isAllDay }),
  }));

  await client.from('external_events').upsert(rows, { onConflict: 'source_id,external_id' });
}
