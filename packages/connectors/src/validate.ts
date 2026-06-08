import type { IngestResult } from './connector.js';

export function isValidHttpsUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateIngestResult(result: IngestResult): IngestResult {
  const errors = [...result.errors];
  const items = result.items.filter(item => {
    if (!isValidHttpsUrl(item.externalUrl)) {
      errors.push(`Item "${item.externalId}" has invalid or non-HTTPS externalUrl`);
      return false;
    }
    return true;
  });
  return { ...result, items, parsedCount: items.length, errors };
}
