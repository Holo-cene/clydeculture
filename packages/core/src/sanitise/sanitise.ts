// Strip-all-HTML sanitisation for user-supplied text.
//
// Applied in the normaliser before writing canonical events so that any
// downstream renderer (Astro frontend, Supabase Studio table editor, a future
// admin panel) is safe even if a payload made it through the public submission
// form. See issue #21 and docs/NORMALISATION.md.
//
// Strip-all (not allowlist) because Clyde Culture is link-first — descriptions
// are rarely rendered, and the source's own page carries any rich formatting.

const SCRIPT_OR_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_TAG = /<[^<>]*>/g;
const STRAY_ANGLE = /[<>]/g;
const WHITESPACE_RUN = /\s+/g;

export function stripHtml(value: string | null | undefined): string | null {
  if (value == null) return null;
  let s = String(value);

  s = s.replace(SCRIPT_OR_STYLE_BLOCK, '');
  s = s.replace(HTML_COMMENT, '');

  // Iterate so that obfuscated input like `<<script>script>` — which becomes
  // `<script>` after the inner tag is removed — is stripped on the next pass.
  let prev: string;
  do {
    prev = s;
    s = s.replace(HTML_TAG, '');
  } while (s !== prev);

  // Drop unmatched angle brackets left by malformed input. Any well-formed
  // tag would have been removed above; what remains is markup debris that
  // could be rebuilt into something unsafe.
  s = s.replace(STRAY_ANGLE, '');

  s = s.replace(WHITESPACE_RUN, ' ').trim();
  return s || null;
}

function sanitiseAndCap(value: string | null | undefined, maxLength: number): string | null {
  const stripped = stripHtml(value);
  if (stripped == null) return null;
  return stripped.slice(0, maxLength).trim() || null;
}

export function sanitiseTitle(value: string | null | undefined): string | null {
  return sanitiseAndCap(value, 300);
}

export function sanitiseSummary(value: string | null | undefined): string | null {
  return sanitiseAndCap(value, 500);
}

export function sanitiseDescription(value: string | null | undefined): string | null {
  return sanitiseAndCap(value, 2000);
}
