import { createHash } from 'node:crypto';
import { normaliseTitle } from '../normalise/normalise.js';

export function deriveDedupeKey(venueId: string | null, startAt: string, title: string): string {
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
