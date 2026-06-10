import { createHash } from 'node:crypto';
import { normaliseTitle } from '../normalise/normalise.js';

const OFFSET_QUALIFIED_DATETIME = /(?:Z|[+-]\d{2}:\d{2})$/;

export function deriveDedupeKey(venueId: string | null, startAt: string, title: string): string {
  assertOffsetQualifiedIsoDateTime(startAt);

  const venueComponent = venueId ?? 'no-venue';

  const date = new Date(startAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const hourBucket = `${year}-${month}-${day}-${hour}`;

  const raw = `${venueComponent}|${hourBucket}|${normaliseTitle(title)}`;
  return createHash('sha256').update(raw).digest('hex');
}

function assertOffsetQualifiedIsoDateTime(startAt: string): void {
  if (!OFFSET_QUALIFIED_DATETIME.test(startAt)) {
    throw new Error('startAt must include a timezone offset for dedupe_key derivation');
  }
}
