import { describe, expect, it } from 'vitest';
import { stripHtml, sanitiseTitle, sanitiseSummary, sanitiseDescription } from './sanitise.js';

// Sanitisation contract — see issue #21 (Stored-XSS sanitisation).
//
// WHERE: applied in the normaliser (packages/core), before any user-supplied
//        text is written to canonical `events` rows.
// WHAT:  strip-all-HTML — no allowlist, no tags survive.
// WHICH: title, summary, description (from event_submissions, and equivalent
//        user-controlled fields on external_events from HTML/RSS connectors).
//
// Rationale: link-first means Clyde Culture rarely renders descriptions, so
// allowing any HTML buys risk for no editorial gain. Moderator UIs (Supabase
// Studio table editor, a future admin panel) that render values as raw HTML
// must be safe even if a payload made it through the public submission form.

describe('stripHtml', () => {
  it('returns null for null and undefined', () => {
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml(undefined)).toBeNull();
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(stripHtml('')).toBeNull();
    expect(stripHtml('   ')).toBeNull();
    expect(stripHtml('\n\t  \n')).toBeNull();
  });

  it('returns plain text unchanged (apart from whitespace collapse)', () => {
    expect(stripHtml('Funk Night at SWG3')).toBe('Funk Night at SWG3');
  });

  it('strips a basic <script> tag and its contents', () => {
    expect(stripHtml('<script>alert(1)</script>Funk Night')).toBe('Funk Night');
  });

  it('strips a <script> tag with attributes and its contents', () => {
    expect(stripHtml('Hello <script src="https://evil/x.js">alert(1)</script>World')).toBe(
      'Hello World',
    );
  });

  it('strips a <style> block and its contents', () => {
    expect(stripHtml('<style>body{display:none}</style>Listing')).toBe('Listing');
  });

  it('strips tags with event-handler attributes', () => {
    expect(stripHtml('<img src="x" onerror="alert(1)">Hello')).toBe('Hello');
    expect(stripHtml('<a href="https://example.com" onclick="alert(1)">link</a>')).toBe('link');
  });

  it('strips tags that carry javascript: URLs (URL is inside the tag, removed with it)', () => {
    expect(stripHtml('<a href="javascript:alert(1)">click</a> me')).toBe('click me');
  });

  it('strips nested and obfuscated tags by iterating until stable', () => {
    // After removing the inner <script>, the outer <<…>script> becomes <script>
    // and must be removed on a second pass.
    expect(stripHtml('<<script>script>alert(1)</script>Funk Night')).toBe('Funk Night');
  });

  it('strips HTML comments including malicious payloads inside them', () => {
    expect(stripHtml('Funk Night <!-- <script>alert(1)</script> --> Tonight')).toBe(
      'Funk Night Tonight',
    );
  });

  it('strips orphan opening tags (no closing tag) without leaving angle brackets', () => {
    expect(stripHtml('Funk <b>Night')).toBe('Funk Night');
  });

  it('preserves non-Latin / mojibake-prone characters', () => {
    expect(stripHtml('Café Düsseldorf — соня')).toBe('Café Düsseldorf — соня');
    expect(stripHtml('日本語のイベント')).toBe('日本語のイベント');
  });

  it('does not decode HTML entities — they remain encoded so a later HTML render is safe', () => {
    // If we decoded &lt;script&gt; we would reintroduce the very payload we just
    // stripped. Leave entities alone; rendered text shows the literal entity
    // string, which displays as plain text in any sane renderer.
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom &amp; Jerry');
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('collapses internal whitespace introduced by tag removal', () => {
    expect(stripHtml('Funk <b>  </b> Night')).toBe('Funk Night');
  });
});

describe('sanitiseTitle', () => {
  it('returns null for null/undefined/empty', () => {
    expect(sanitiseTitle(null)).toBeNull();
    expect(sanitiseTitle(undefined)).toBeNull();
    expect(sanitiseTitle('')).toBeNull();
    expect(sanitiseTitle('   ')).toBeNull();
  });

  it('strips HTML and trims', () => {
    expect(sanitiseTitle('<script>alert(1)</script>Funk Night')).toBe('Funk Night');
    expect(sanitiseTitle('  <b>Funk Night</b>  ')).toBe('Funk Night');
  });

  it('caps at 300 characters', () => {
    const long = 'a'.repeat(400);
    const result = sanitiseTitle(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(300);
  });

  it('returns null if the value is HTML-only with no text content', () => {
    expect(sanitiseTitle('<script>alert(1)</script>')).toBeNull();
    expect(sanitiseTitle('<!-- comment only -->')).toBeNull();
  });
});

describe('sanitiseSummary', () => {
  it('returns null for null/undefined/empty', () => {
    expect(sanitiseSummary(null)).toBeNull();
    expect(sanitiseSummary(undefined)).toBeNull();
    expect(sanitiseSummary('')).toBeNull();
  });

  it('strips HTML and trims', () => {
    expect(sanitiseSummary('<p>An evening of <em>noise</em>.</p>')).toBe(
      'An evening of noise.',
    );
  });

  it('caps at 500 characters', () => {
    const long = 'a'.repeat(800);
    const result = sanitiseSummary(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(500);
  });
});

describe('sanitiseDescription', () => {
  it('returns null for null/undefined/empty', () => {
    expect(sanitiseDescription(null)).toBeNull();
    expect(sanitiseDescription(undefined)).toBeNull();
    expect(sanitiseDescription('')).toBeNull();
  });

  it('strips HTML', () => {
    expect(
      sanitiseDescription('<div><script>alert(1)</script><p>A night out.</p></div>'),
    ).toBe('A night out.');
  });

  it('caps at 2000 characters', () => {
    const long = 'a'.repeat(3000);
    const result = sanitiseDescription(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2000);
  });
});
