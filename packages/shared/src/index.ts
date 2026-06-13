// @clydeculture/shared — types, enums, db client
export * from './types/event.js';
export * from './types/source.js';
export * from './sourcePolicy.js';
export * from './enums/taxonomy.js';
export { createClient } from './db/client.js';
export { upsertExternalEvents } from './db/upsertExternalEvents.js';
export type { ExternalEventInput } from './db/upsertExternalEvents.js';
export {
  getEventBySlug,
  getEventLinks,
  getPublishedEvents,
  getThisWeekendDateRange,
  getTonightDateRange,
  getVenueBySlug,
} from './db/publicQueries.js';
export type {
  DateRange,
  EventLink,
  EventLinkKind,
  PublicEventFilters,
  PublicQueryClient,
} from './db/publicQueries.js';
export {
  ticketmasterAttribution,
  ticketmasterImageHotlink,
  ticketmasterSourceLink,
} from './presentation/sourceAttribution.js';
export type {
  PublicEventForAttribution,
  SourceAttribution,
} from './presentation/sourceAttribution.js';
