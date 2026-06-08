export interface DateRange {
  startAt: string;
  endAt: string;
}

export interface PublicEventFilters {
  dateRange?: DateRange;
  eventTypeSlug?: string;
  venueSlug?: string;
  festivalSlug?: string;
  q?: string;
}

interface QueryResult<T> {
  data: T;
  error: unknown;
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  eq(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, value: unknown[]): QueryBuilder<T>;
  ilike(column: string, value: string): QueryBuilder<T>;
  or(value: string): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  maybeSingle(): PromiseLike<QueryResult<T | null>>;
  single(): PromiseLike<QueryResult<T | null>>;
}

interface SelectBuilder {
  select(columns?: string): QueryBuilder;
}

export interface PublicQueryClient {
  from(table: string): SelectBuilder;
}

const PUBLIC_EVENT_SELECT = [
  '*',
  'event_types(*)',
  'venues(*)',
  'festivals(*)',
].join(',');

function applyPublicEventBoundary(
  client: PublicQueryClient,
): QueryBuilder {
  return client
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('visibility', 'published')
    .gte('confidence', 60);
}

function throwIfQueryError(error: unknown): void {
  if (error) {
    throw error;
  }
}

export async function getPublishedEvents(
  client: PublicQueryClient,
  filters: PublicEventFilters = {},
): Promise<unknown[]> {
  const searchTerm = publicSearchTerm(filters.q);
  const matchingVenueIds = searchTerm ? await getSearchVenueIds(client, searchTerm) : [];
  const eventTypeId = filters.eventTypeSlug
    ? await getEventTypeIdBySlug(client, filters.eventTypeSlug)
    : null;
  const venueId = filters.venueSlug ? await getVenueIdBySlug(client, filters.venueSlug) : null;
  const festivalId = filters.festivalSlug
    ? await getFestivalIdBySlug(client, filters.festivalSlug)
    : null;

  if (
    (filters.eventTypeSlug && eventTypeId === null) ||
    (filters.venueSlug && venueId === null) ||
    (filters.festivalSlug && festivalId === null)
  ) {
    return [];
  }

  let query = applyPublicEventBoundary(client);

  if (filters.dateRange) {
    query = query
      .gte('start_at', filters.dateRange.startAt)
      .lt('start_at', filters.dateRange.endAt);
  }

  if (filters.eventTypeSlug) {
    query = query.eq('event_type_id', eventTypeId);
  }

  if (filters.venueSlug) {
    query = query.eq('venue_id', venueId);
  }

  if (filters.festivalSlug) {
    query = query.eq('festival_id', festivalId);
  }

  if (searchTerm) {
    const searchFilters = [
      `title.ilike.%${searchTerm}%`,
      `normalised_title.ilike.%${searchTerm}%`,
      `ticket_url_label.ilike.%${searchTerm}%`,
    ];

    if (matchingVenueIds.length > 0) {
      searchFilters.push(`venue_id.in.(${matchingVenueIds.join(',')})`);
    }

    query = query.or(searchFilters.join(','));
  }

  const { data, error } = await query.order('start_at', { ascending: true });
  throwIfQueryError(error);

  return data ?? [];
}

async function getEventTypeIdBySlug(
  client: PublicQueryClient,
  slug: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('event_types')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  throwIfQueryError(error);
  return isRecord(data) && typeof data['id'] === 'number' ? data['id'] : null;
}

async function getVenueIdBySlug(client: PublicQueryClient, slug: string): Promise<string | null> {
  const { data, error } = await client
    .from('venues')
    .select('id')
    .eq('slug', slug)
    .in('status', ['active', 'temporary'])
    .maybeSingle();

  throwIfQueryError(error);
  return isRecord(data) && typeof data['id'] === 'string' ? data['id'] : null;
}

async function getFestivalIdBySlug(client: PublicQueryClient, slug: string): Promise<string | null> {
  const { data, error } = await client
    .from('festivals')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  throwIfQueryError(error);
  return isRecord(data) && typeof data['id'] === 'string' ? data['id'] : null;
}

async function getSearchVenueIds(client: PublicQueryClient, searchTerm: string): Promise<string[]> {
  const { data, error } = await client
    .from('venues')
    .select('id')
    .ilike('name', `%${searchTerm}%`);

  throwIfQueryError(error);

  return (data ?? [])
    .map((row) => (isRecord(row) && typeof row['id'] === 'string' ? row['id'] : null))
    .filter((id): id is string => id !== null);
}

function publicSearchTerm(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getEventBySlug(
  client: PublicQueryClient,
  slug: string,
): Promise<unknown | null> {
  const { data, error } = await applyPublicEventBoundary(client)
    .eq('slug', slug)
    .maybeSingle();

  throwIfQueryError(error);
  return data;
}

export async function getVenueBySlug(
  client: PublicQueryClient,
  slug: string,
): Promise<unknown | null> {
  const { data, error } = await client
    .from('venues')
    .select('*')
    .eq('slug', slug)
    .in('status', ['active', 'temporary'])
    .maybeSingle();

  throwIfQueryError(error);
  return data;
}

export function getTonightDateRange(now: Date): DateRange {
  const start = new Date(now);
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function getThisWeekendDateRange(now: Date): DateRange {
  const start = new Date(now);
  const day = start.getUTCDay();

  if (day === 0 || day >= 5) {
    const daysSinceFriday = (day - 5 + 7) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceFriday);
  } else {
    const daysUntilFriday = 5 - day;
    start.setUTCDate(start.getUTCDate() + daysUntilFriday);
  }

  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 3);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}
