/**
 * The contract every connector implements. Connectors are isolated: a failure in one
 * must never affect another. See docs/CONNECTOR_GUIDE.md before adding a new one.
 */
export type SourceType = "api" | "rss" | "ical" | "html" | "manual";

/** A raw item as pulled from upstream, before normalisation. */
export interface RawEvent {
  /** Stable upstream id: API id, RSS GUID, iCal UID, or a content hash. */
  externalId: string;
  /** Required — Clyde Culture is link-first. */
  externalUrl: string;
  title: string;
  startAt?: string; // ISO 8601
  venueName?: string;
  eventTypeGuess?: string;
  tagsGuess?: string[];
  /** Full upstream payload, kept for debugging and re-parsing. */
  raw: unknown;
}

export interface IngestResult {
  fetchedCount: number;
  parsedCount: number;
  items: RawEvent[];
  errors: string[];
}

export interface Connector {
  /** Stable slug, e.g. "ticketmaster" or "swg3". */
  readonly slug: string;
  readonly type: SourceType;
  /** Pull and parse upstream items. Must not throw — return errors in IngestResult. */
  run(): Promise<IngestResult>;
}
