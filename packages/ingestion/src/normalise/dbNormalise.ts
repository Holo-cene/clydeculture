import {
  deriveDedupeKey,
  calculateConfidence,
  calculateTrust,
  calculateCompleteness,
  normaliseImageUrl,
  normaliseTitle,
  mapAvailabilityGuessToCanonical,
  type SourceTier,
  type TypeSource,
} from '@clydeculture/core';

type Row = Record<string, unknown>;

interface QueryResult<T> {
  data: T;
  error: unknown;
}

interface QueryBuilder extends PromiseLike<QueryResult<Row[]>> {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  upsert(values: Row | Row[], options?: Row): QueryBuilder;
  update(values: Row): QueryBuilder;
  single(): Promise<QueryResult<Row>>;
  maybeSingle(): Promise<QueryResult<Row | null>>;
}

export interface NormaliseDbClient {
  from(table: string): QueryBuilder;
  rpc?(name: string, args: Row): Promise<QueryResult<unknown>>;
}

export interface NormaliseExternalEventsForSourceInput {
  client: NormaliseDbClient;
  sourceId: string;
}

interface SourceRow extends Row {
  id: string;
  slug: string;
  tier: SourceTier;
  config: {
    auto_publish?: boolean;
    timezone?: string;
  };
}

interface ExternalEventRow extends Row {
  id: string;
  source_id: string;
  external_id: string;
  event_id?: string | null;
  external_url?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  doors_at?: string | null;
  price_min_guess?: number | null;
  price_max_guess?: number | null;
  is_free_guess?: boolean | null;
  availability_guess?: string | null;
  venue_id_guess?: string | null;
  event_type_guess?: string | null;
  ticket_url_guess?: string | null;
  ticket_url_label_guess?: string | null;
  image_url_guess?: string | null;
  venue_name?: string | null;
  time_tba_guess?: boolean | null;
  is_all_day_guess?: boolean | null;
  raw?: Row;
}

interface CategoryMapRow extends Row {
  event_type_id: number;
  event_types?: {
    slug?: string;
  };
}

export async function normaliseExternalEventsForSource(
  input: NormaliseExternalEventsForSourceInput,
): Promise<void> {
  const source = await getSource(input.client, input.sourceId);
  const externalEvents = await getAllExternalEventsForSource(input.client, input.sourceId);

  for (const externalEvent of externalEvents) {
    const mappedType = await resolveEventType(input.client, source, externalEvent.event_type_guess);
    const title = (externalEvent.title ?? '').trim().slice(0, 500);
    const startAt = externalEvent.start_at;
    const venue = await resolveVenue(input.client, externalEvent);

    if (!title) {
      await markNormalisationSkip(input.client, externalEvent, 'missing_title');
      continue;
    }
    if (!startAt) {
      await markNormalisationSkip(input.client, externalEvent, 'missing_start_at');
      continue;
    }
    if (!venue) {
      await markNormalisationSkip(input.client, externalEvent, 'missing_venue');
      continue;
    }

    const timeTba = externalEvent.time_tba_guess === true;
    const isAllDay = externalEvent.is_all_day_guess === true;

    const confidence = calculateConfidence({
      sourceTier: source.tier,
      title,
      startAt,
      timeTba,
      sourceUrl: externalEvent.external_url ?? null,
      ticketUrl: externalEvent.ticket_url_guess ?? null,
      venue: { id: venue.id },
      eventTypeSlug: mappedType.slug,
      typeSource: mappedType.typeSource,
    });
    // ADR 0006: also compute trust × completeness signals. The legacy `confidence`
    // gate above remains the publishing boundary until the RLS swap migration
    // lands; until then both sets of inputs are written to every canonical row.
    const trust = calculateTrust({
      sourceTier: source.tier,
      title,
    });
    const completeness = calculateCompleteness({
      title,
      startAt,
      timeTba,
      sourceUrl: externalEvent.external_url ?? null,
      ticketUrl: externalEvent.ticket_url_guess ?? null,
      venue: { id: venue.id, autoCreated: venue.autoCreated },
      hasImage: Boolean(normaliseImageUrl(externalEvent.image_url_guess)),
      typeClassified: mappedType.slug !== 'other',
    });
    const needsReview = mappedType.needsReview || confidence.needsReview || venue.needsReview;
    const visibility =
      confidence.score >= 60 && !needsReview && source.config?.auto_publish === true
        ? 'published'
        : 'draft';

    const eventRow = buildEventRow({
      externalEvent,
      source,
      title,
      startAt,
      timeTba,
      isAllDay,
      venue,
      mappedType,
      confidence,
      trust,
      completeness,
      needsReview,
      visibility,
    });

    if (externalEvent.event_id) {
      const { error: updateError } = await input.client
        .from('events')
        .update(eventRow)
        .eq('id', externalEvent.event_id);

      if (updateError) {
        await markNormalisationSkip(input.client, externalEvent, 'update_failed');
      }
    } else {
      const { data: canonicalEvent, error: upsertError } = await input.client
        .from('events')
        .upsert(eventRow, { onConflict: 'dedupe_key' })
        .select('id')
        .single();

      if (upsertError || !canonicalEvent) {
        await markNormalisationSkip(input.client, externalEvent, 'canonical_upsert_failed');
        continue;
      }

      const eventId = canonicalEvent['id'];
      if (typeof eventId !== 'string') {
        continue;
      }

      await input.client
        .from('external_events')
        .update({ event_id: eventId })
        .eq('id', externalEvent.id);
    }
  }
}

async function getSource(client: NormaliseDbClient, sourceId: string): Promise<SourceRow> {
  const { data } = await client.from('sources').select('*').eq('id', sourceId).single();

  return {
    ...data,
    id: stringValue(data['id']),
    slug: stringValue(data['slug']),
    tier: sourceTierValue(data['tier']),
    config: configValue(data['config']),
  };
}

async function getAllExternalEventsForSource(
  client: NormaliseDbClient,
  sourceId: string,
): Promise<ExternalEventRow[]> {
  const { data } = await client
    .from('external_events')
    .select('*')
    .eq('source_id', sourceId);

  return data.map((row) => ({
    ...row,
    id: stringValue(row['id']),
    source_id: stringValue(row['source_id']),
    external_id: stringValue(row['external_id']),
    event_id: nullableString(row['event_id']),
    external_url: nullableString(row['external_url']),
    title: nullableString(row['title']),
    start_at: nullableString(row['start_at']),
    end_at: nullableString(row['end_at']),
    doors_at: nullableString(row['doors_at']),
    price_min_guess: nullableNumber(row['price_min_guess']),
    price_max_guess: nullableNumber(row['price_max_guess']),
    is_free_guess: nullableBoolean(row['is_free_guess']),
    availability_guess: nullableString(row['availability_guess']),
    venue_id_guess: nullableString(row['venue_id_guess']),
    venue_name: nullableString(row['venue_name']),
    event_type_guess: nullableString(row['event_type_guess']),
    ticket_url_guess: nullableString(row['ticket_url_guess']),
    ticket_url_label_guess: nullableString(row['ticket_url_label_guess']),
    image_url_guess: nullableString(row['image_url_guess']),
    time_tba_guess: nullableBoolean(row['time_tba_guess']),
    is_all_day_guess: nullableBoolean(row['is_all_day_guess']),
    raw: isRecord(row['raw']) ? row['raw'] : {},
  }));
}

async function resolveVenue(
  client: NormaliseDbClient,
  externalEvent: ExternalEventRow,
): Promise<{ id: string; needsReview: boolean; autoCreated: boolean } | null> {
  if (externalEvent.venue_id_guess) {
    return { id: externalEvent.venue_id_guess, needsReview: false, autoCreated: false };
  }

  const venueName = externalEvent.venue_name?.trim();
  if (!venueName || !client.rpc) {
    return null;
  }

  const resolvedVenueId = await rpcString(client, 'resolve_venue', {
    p_venue_name: venueName,
  });
  if (resolvedVenueId) {
    return { id: resolvedVenueId, needsReview: false, autoCreated: false };
  }

  const createdVenueId = await rpcString(client, 'auto_create_venue', {
    p_venue_name: venueName,
    p_source_url: externalEvent.external_url ?? null,
  });
  if (createdVenueId) {
    return { id: createdVenueId, needsReview: true, autoCreated: true };
  }

  return null;
}

async function rpcString(
  client: NormaliseDbClient,
  name: string,
  args: Row,
): Promise<string | null> {
  if (!client.rpc) return null;

  const { data } = await client.rpc(name, args);
  return typeof data === 'string' && data.trim() ? data : null;
}

async function markNormalisationSkip(
  client: NormaliseDbClient,
  externalEvent: ExternalEventRow,
  reason: string,
): Promise<void> {
  await client
    .from('external_events')
    .update({
      raw: {
        ...(externalEvent.raw ?? {}),
        normalisation_skip: {
          reason,
          at: new Date().toISOString(),
        },
      },
    })
    .eq('id', externalEvent.id);
}

async function resolveEventType(
  client: NormaliseDbClient,
  source: SourceRow,
  sourceCategory: string | null | undefined,
): Promise<{ id: number; slug: string; typeSource: TypeSource; needsReview: boolean }> {
  const normalisedCategory = sourceCategory?.trim().toLowerCase();

  if (normalisedCategory) {
    const { data: mapping } = await client
      .from('source_type_category_map')
      .select('event_type_id,event_types(slug)')
      .eq('source_id', source.id)
      .eq('source_category', normalisedCategory)
      .maybeSingle();

    if (mapping) {
      const mapRow = mapping as CategoryMapRow;
      return {
        id: numberValue(mapRow['event_type_id']),
        slug: mapRow.event_types?.slug ?? 'other',
        typeSource: 'map',
        needsReview: false,
      };
    }
  }

  const { data: fallback } = await client
    .from('event_types')
    .select('id,slug')
    .eq('slug', 'other')
    .single();

  return {
    id: numberValue(fallback['id']),
    slug: stringValue(fallback['slug']),
    typeSource: 'fallback',
    needsReview: true,
  };
}

function buildEventRow(input: {
  externalEvent: ExternalEventRow;
  source: SourceRow;
  title: string;
  startAt: string;
  timeTba: boolean;
  isAllDay: boolean;
  venue: { id: string; needsReview: boolean; autoCreated: boolean };
  mappedType: { id: number; slug: string; typeSource: TypeSource; needsReview: boolean };
  confidence: ReturnType<typeof calculateConfidence>;
  trust: ReturnType<typeof calculateTrust>;
  completeness: ReturnType<typeof calculateCompleteness>;
  needsReview: boolean;
  visibility: string;
}): Row {
  const {
    externalEvent,
    source,
    title,
    startAt,
    timeTba,
    isAllDay,
    venue,
    mappedType,
    confidence,
    trust,
    completeness,
    needsReview,
    visibility,
  } = input;

  const isFree = externalEvent.is_free_guess === true ? true : externalEvent.is_free_guess === false ? false : undefined;
  const pricesAllowed = isFree !== true;

  return stripUndefined({
    title,
    normalised_title: normaliseTitle(title),
    slug: slugFor(title, startAt),
    summary: null,
    description: null,
    source_url: externalEvent.external_url ?? null,
    ticket_url: externalEvent.ticket_url_guess ?? null,
    ticket_url_label: externalEvent.ticket_url_label_guess ?? null,
    image_url: normaliseImageUrl(externalEvent.image_url_guess),
    start_at: startAt,
    end_at: externalEvent.end_at ?? undefined,
    doors_at: externalEvent.doors_at ?? undefined,
    time_tba: timeTba,
    is_all_day: isAllDay,
    is_free: isFree,
    price_min: pricesAllowed && externalEvent.price_min_guess != null ? externalEvent.price_min_guess : undefined,
    price_max: pricesAllowed && externalEvent.price_max_guess != null ? externalEvent.price_max_guess : undefined,
    availability: mapAvailabilityGuessToCanonical(externalEvent.availability_guess),
    timezone: source.config?.timezone ?? 'Europe/London',
    event_type_id: mappedType.id,
    venue_id: venue.id,
    primary_source_id: source.id,
    confidence: confidence.score,
    confidence_inputs: confidence.inputs,
    trust: trust.score,
    trust_inputs: trust.inputs,
    completeness: completeness.score,
    completeness_inputs: completeness.inputs,
    needs_review: needsReview,
    visibility,
    dedupe_key: deriveDedupeKey(venue.id, startAt, title),
  });
}

function slugFor(title: string, startAt: string): string {
  return `${normaliseTitle(title).replace(/\s+/g, '-')}-${startAt.slice(0, 10)}`;
}

function stripUndefined(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function sourceTierValue(value: unknown): SourceTier {
  const tier = numberValue(value);
  return tier === 1 || tier === 2 || tier === 3 || tier === 4 ? tier : 4;
}

function configValue(value: unknown): SourceRow['config'] {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
