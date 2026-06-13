import { createHash } from 'node:crypto';
import type { RawEvent } from '../../connector.js';

export interface RssParseResult {
  fetchedCount: number;
  items: RawEvent[];
  errors: string[];
}

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function readTag(itemXml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(itemXml);
  if (!match) return undefined;
  const inner = match[1] ?? '';
  const stripped = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  if (stripped.length === 0) return undefined;
  return decodeEntities(stripped);
}

function hashId(...parts: Array<string | undefined>): string {
  return createHash('sha256').update(parts.map(p => p ?? '').join('|')).digest('hex');
}

function rfc822ToIso(pubDate: string): string | undefined {
  const parsed = Date.parse(pubDate);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parse a Type A (structured event feed) RSS 2.0 document for The Glad Cafe.
 *
 * Type A semantics — see docs/CONNECTOR_GUIDE.md §6:
 *   - one <item> = one event
 *   - <pubDate> is the event start (not a publication date)
 *   - if <pubDate> is missing or unparseable, emit startAt: undefined
 *     (do not fabricate; do not skip the item)
 *   - <description> is link-first — not stored on the RawEvent
 */
export function parseGladCafeFeed(xml: string): RssParseResult {
  const items: RawEvent[] = [];
  const errors: string[] = [];
  let fetchedCount = 0;

  for (const match of xml.matchAll(ITEM_RE)) {
    fetchedCount += 1;
    const itemXml = match[1] ?? '';

    try {
      const title = readTag(itemXml, 'title');
      const link = readTag(itemXml, 'link');
      const guid = readTag(itemXml, 'guid');
      const pubDate = readTag(itemXml, 'pubDate');
      const category = readTag(itemXml, 'category');

      if (!link) {
        errors.push(
          `Skipped item with no <link>: ${title ?? '(untitled)'}`,
        );
        continue;
      }

      if (!title) {
        errors.push(`Skipped item with no <title>: ${link}`);
        continue;
      }

      const externalId = guid ?? hashId(link, title);
      const startAt = pubDate ? rfc822ToIso(pubDate) : undefined;

      const item: RawEvent = {
        externalId,
        externalUrl: link,
        title,
        raw: { guid, link, title, pubDate, category },
      };
      if (startAt !== undefined) item.startAt = startAt;
      if (category !== undefined) item.eventTypeGuess = category;
      items.push(item);
    } catch (err) {
      errors.push(`Failed to parse <item>: ${String(err)}`);
    }
  }

  return { fetchedCount, items, errors };
}
