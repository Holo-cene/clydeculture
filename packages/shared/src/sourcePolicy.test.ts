import { describe, expect, it } from 'vitest';
import {
  DATA_THISTLE_SOURCE_POLICY,
  canDisplaySourcePublicly,
  canRetainRawPayload,
  canUseSourceForStagingCollection,
  getSourcePolicy,
} from './sourcePolicy.js';

describe('source policy contract', () => {
  it('models Data Thistle as staging-allowed but disabled for public production display', () => {
    expect(DATA_THISTLE_SOURCE_POLICY).toMatchObject({
      sourceSlug: 'datathistle',
      allowPublicDisplay: false,
      allowStagingCollection: true,
      productionEnabled: false,
    });

    expect(canUseSourceForStagingCollection(DATA_THISTLE_SOURCE_POLICY)).toBe(true);
    expect(canDisplaySourcePublicly(DATA_THISTLE_SOURCE_POLICY)).toBe(false);
  });

  it('keeps Data Thistle rich-content and venue-enrichment fields disabled', () => {
    expect(DATA_THISTLE_SOURCE_POLICY).toMatchObject({
      allowDescriptions: false,
      allowImages: false,
      allowVenueEnrichment: false,
      allowRawPayloadRetention: false,
    });

    expect(canRetainRawPayload(DATA_THISTLE_SOURCE_POLICY)).toBe(false);
  });

  it('keeps Data Thistle minimal metadata fields available for staged parsing', () => {
    expect(DATA_THISTLE_SOURCE_POLICY).toMatchObject({
      allowDerivedCategoryMapping: true,
      allowTicketLinks: true,
      allowPriceDisplay: true,
      allowVenueNameDisplay: true,
      allowPlaceIdStorage: true,
      sourceLinkMode: 'source_or_booking_url',
    });
  });

  it('records Data Thistle attribution, source-link, and TTL constraints explicitly', () => {
    expect(DATA_THISTLE_SOURCE_POLICY).toMatchObject({
      cacheTtlHours: 24,
      rawPayloadTtlHours: 24,
      requiresAttribution: true,
      requiresLogo: true,
      requiresSourceLink: true,
      requiresDataThistleUpdateLink: true,
      attributionLabel: 'Data supplied by Data Thistle',
    });
    expect(DATA_THISTLE_SOURCE_POLICY.notes).toContain('production terms remain to be confirmed');
  });

  it('looks up Data Thistle policy by source slug', () => {
    expect(getSourcePolicy('datathistle')).toBe(DATA_THISTLE_SOURCE_POLICY);
    expect(getSourcePolicy('unknown-source')).toBeUndefined();
  });
});
