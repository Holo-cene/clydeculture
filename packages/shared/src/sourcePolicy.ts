export type SourceSlug = 'datathistle' | 'ticketmaster';

export type SourceLinkMode = 'source_or_booking_url';

export interface SourcePolicy {
  sourceSlug: SourceSlug;
  allowDescriptions: boolean;
  allowImages: boolean;
  allowVenueEnrichment: boolean;
  allowRawPayloadRetention: boolean;
  rawPayloadTtlHours: number;
  cacheTtlHours: number;
  requiresAttribution: boolean;
  requiresLogo: boolean;
  requiresSourceLink: boolean;
  requiresDataThistleUpdateLink: boolean;
  allowPublicDisplay: boolean;
  allowStagingCollection: boolean;
  allowDerivedCategoryMapping: boolean;
  allowTicketLinks: boolean;
  allowPriceDisplay: boolean;
  allowVenueNameDisplay: boolean;
  allowPlaceIdStorage: boolean;
  productionEnabled: boolean;
  attributionLabel: string;
  sourceLinkMode: SourceLinkMode;
  notes: string;
}

export type SourcePolicyMap = Record<SourceSlug, SourcePolicy>;

export const DATA_THISTLE_SOURCE_POLICY: SourcePolicy = {
  sourceSlug: 'datathistle',
  allowDescriptions: false,
  allowImages: false,
  allowVenueEnrichment: false,
  allowRawPayloadRetention: false,
  rawPayloadTtlHours: 24,
  cacheTtlHours: 24,
  requiresAttribution: true,
  requiresLogo: true,
  requiresSourceLink: true,
  requiresDataThistleUpdateLink: true,
  allowPublicDisplay: false,
  allowStagingCollection: true,
  allowDerivedCategoryMapping: true,
  allowTicketLinks: true,
  allowPriceDisplay: true,
  allowVenueNameDisplay: true,
  allowPlaceIdStorage: true,
  productionEnabled: false,
  attributionLabel: 'Data supplied by Data Thistle',
  sourceLinkMode: 'source_or_booking_url',
  notes:
    'Descriptions, images, rich place data, logo placement, attribution wording, and production terms remain to be confirmed.',
};

export const TICKETMASTER_SOURCE_POLICY: SourcePolicy = {
  sourceSlug: 'ticketmaster',
  allowDescriptions: false,
  allowImages: true,
  allowVenueEnrichment: true,
  allowRawPayloadRetention: true,
  rawPayloadTtlHours: 720,
  cacheTtlHours: 24,
  requiresAttribution: true,
  requiresLogo: false,
  requiresSourceLink: true,
  requiresDataThistleUpdateLink: false,
  allowPublicDisplay: true,
  allowStagingCollection: true,
  allowDerivedCategoryMapping: true,
  allowTicketLinks: true,
  allowPriceDisplay: true,
  allowVenueNameDisplay: true,
  allowPlaceIdStorage: false,
  productionEnabled: true,
  attributionLabel: 'Buy on Ticketmaster',
  sourceLinkMode: 'source_or_booking_url',
  notes:
    'Ticketmaster Discovery API: hot-link images from the Ticketmaster CDN at render time; no binary caching. Every listing must show "Buy on Ticketmaster" attribution adjacent to the title and image, linking back to the Ticketmaster event page (ADR 0004).',
};

export const SOURCE_POLICIES: SourcePolicyMap = {
  datathistle: DATA_THISTLE_SOURCE_POLICY,
  ticketmaster: TICKETMASTER_SOURCE_POLICY,
};

export function getSourcePolicy(sourceSlug: string): SourcePolicy | undefined {
  return SOURCE_POLICIES[sourceSlug as SourceSlug];
}

export function canUseSourceForStagingCollection(policy: SourcePolicy): boolean {
  return policy.allowStagingCollection === true;
}

export function canDisplaySourcePublicly(policy: SourcePolicy): boolean {
  return policy.productionEnabled === true && policy.allowPublicDisplay === true;
}

export function canRetainRawPayload(policy: SourcePolicy): boolean {
  return policy.allowRawPayloadRetention === true;
}
