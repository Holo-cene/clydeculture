/**
 * Data Thistle tag → Clyde Culture taxonomy mapping.
 *
 * Connector-side category evidence only: this module produces a *guess* from
 * Data Thistle `tags[]` values, mirroring the 'map'/'fallback' typeSource idea
 * in `@clydeculture/core` `mapSourceCategoryToEventType`. Normalisation owns
 * the final decision (including the 'other' fallback) — this module never
 * forces 'other'.
 *
 * Coverage source: packages/connectors/src/api/datathistle/SPEC.md §12
 * (taxonomy mapping recommendations table).
 *
 * Pure function, no I/O, deterministic, never throws.
 */

export type DataThistleCategoryMapping = {
  eventTypeSlug?: string;
  matchedTag?: string;
  mappingSource: 'datathistle-tag-map' | 'fallback';
  sourceTags: string[];
};

/**
 * Fixed priority order of category rules. The first rule with a matching tag
 * wins. Order (highest priority first):
 *
 *  1. live_music
 *  2. club_night
 *  3. comedy
 *  4. theatre
 *  5. opera context rule (see below)
 *  6. arts_exhibition
 *  7. workshop
 *  8. talk_lecture
 *  9. film
 * 10. family
 * 11. sport
 * 12. community_meetup
 * 13. food_drink
 *
 * This preserves the priority order of the legacy private helper
 * `mapTagsToEventType` in parse.ts for every tag it covered.
 */
const CATEGORY_RULES: ReadonlyArray<{
  eventTypeSlug: string;
  tags: ReadonlySet<string>;
}> = [
  {
    eventTypeSlug: 'live_music',
    tags: new Set([
      'music',
      'gigs',
      'gig',
      'concerts',
      'concert',
      'classical',
      'classical music',
      'jazz',
      'folk',
      'live music',
    ]),
  },
  {
    eventTypeSlug: 'club_night',
    tags: new Set([
      'clubbing',
      'clubs',
      'club',
      'dj',
      'djs',
      'dance music',
      'nightlife',
      'club night',
    ]),
  },
  {
    eventTypeSlug: 'comedy',
    tags: new Set(['comedy', 'stand-up', 'standup', 'stand up']),
  },
  {
    eventTypeSlug: 'theatre',
    tags: new Set([
      'theatre',
      'theater',
      'drama',
      'musicals',
      'musical',
      'plays',
      'performance',
      'dance',
      'cabaret',
      'circus',
    ]),
  },
  {
    eventTypeSlug: 'arts_exhibition',
    tags: new Set([
      'art',
      'visual art',
      'exhibitions',
      'exhibition',
      'galleries',
      'gallery',
      'museums',
      'museum',
    ]),
  },
  {
    eventTypeSlug: 'workshop',
    tags: new Set([
      'workshop',
      'workshops',
      'classes',
      'class',
      'courses',
      'course',
      'learning',
      'craft',
    ]),
  },
  {
    eventTypeSlug: 'talk_lecture',
    tags: new Set([
      'talk',
      'talks',
      'lecture',
      'lectures',
      'books',
      'literature',
      'spoken word',
      'poetry',
      'author event',
    ]),
  },
  {
    eventTypeSlug: 'film',
    tags: new Set([
      'film',
      'films',
      'cinema',
      'screening',
      'screenings',
      'event cinema',
      'movie',
      'movies',
    ]),
  },
  {
    eventTypeSlug: 'family',
    tags: new Set(['family', 'children', 'kids', "children's", 'schools']),
  },
  {
    eventTypeSlug: 'sport',
    tags: new Set([
      'sport',
      'sports',
      'running',
      'cycling',
      'swimming',
      'football',
      'fitness',
    ]),
  },
  {
    eventTypeSlug: 'community_meetup',
    tags: new Set([
      'community',
      'local groups',
      'social',
      'social events',
      'meetup',
      'heritage',
    ]),
  },
  {
    eventTypeSlug: 'food_drink',
    tags: new Set([
      'food',
      'drink',
      'food and drink',
      'markets',
      'market',
      'tasting',
      'beer',
      'wine',
      'street food',
    ]),
  },
];

/**
 * Opera ambiguity rule (SPEC.md §12: "opera where music-led" → live_music,
 * "opera where stage-led" → theatre). Implemented simply: when 'opera' is
 * present and no rule ranked above theatre has matched, the event is theatre
 * if the tags also include a theatre-ish context tag, otherwise live_music.
 * Note 'musicals', 'drama', and 'theatre' are already caught by the theatre
 * rule above, so within this rule only 'stage' is operative — they are kept
 * here so the documented context list matches the implementation.
 */
const OPERA_TAG = 'opera';
const OPERA_THEATRE_CONTEXT: ReadonlySet<string> = new Set([
  'musicals',
  'drama',
  'theatre',
  'stage',
]);

/** Position of the opera context rule in the priority order (after theatre). */
const OPERA_RULE_INDEX = 4;

function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Maps Data Thistle tags to a Clyde Culture event type guess.
 *
 * - Matching is case-insensitive and whitespace-trimmed; emitted values
 *   (`sourceTags`, `matchedTag`) keep the original source text untouched.
 * - `sourceTags` is deduplicated case-insensitively, keeping the first
 *   occurrence; empty/whitespace-only entries are dropped.
 * - Unknown or ambiguous-only tags (or empty input) yield
 *   `{ mappingSource: 'fallback' }` with no `eventTypeSlug` — normalisation
 *   owns the 'other' fallback.
 */
export function mapDataThistleTags(
  tags: readonly string[]
): DataThistleCategoryMapping {
  const sourceTags: string[] = [];
  const normalisedTags: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const normalised = normaliseTag(tag);
    if (normalised === '' || seen.has(normalised)) continue;
    seen.add(normalised);
    sourceTags.push(tag);
    normalisedTags.push(normalised);
  }

  // Walk the documented priority order: rules before the opera slot, the
  // opera context rule, then the remaining rules.
  return resolveByPriority(sourceTags, normalisedTags);
}

function matchRule(
  rule: { eventTypeSlug: string; tags: ReadonlySet<string> },
  sourceTags: string[],
  normalisedTags: string[]
): DataThistleCategoryMapping | undefined {
  for (let i = 0; i < normalisedTags.length; i += 1) {
    if (rule.tags.has(normalisedTags[i] as string)) {
      return {
        eventTypeSlug: rule.eventTypeSlug,
        matchedTag: sourceTags[i] as string,
        mappingSource: 'datathistle-tag-map',
        sourceTags,
      };
    }
  }
  return undefined;
}

function resolveByPriority(
  sourceTags: string[],
  normalisedTags: string[]
): DataThistleCategoryMapping {
  for (let ruleIndex = 0; ruleIndex < CATEGORY_RULES.length; ruleIndex += 1) {
    if (ruleIndex === OPERA_RULE_INDEX) {
      const operaMatch = matchOperaRule(sourceTags, normalisedTags);
      if (operaMatch !== undefined) return operaMatch;
    }

    const rule = CATEGORY_RULES[ruleIndex];
    if (rule === undefined) continue;
    const match = matchRule(rule, sourceTags, normalisedTags);
    if (match !== undefined) return match;
  }

  return { mappingSource: 'fallback', sourceTags };
}

function matchOperaRule(
  sourceTags: string[],
  normalisedTags: string[]
): DataThistleCategoryMapping | undefined {
  const operaPosition = normalisedTags.indexOf(OPERA_TAG);
  if (operaPosition === -1) return undefined;

  const stageLed = normalisedTags.some((tag) => OPERA_THEATRE_CONTEXT.has(tag));
  return {
    eventTypeSlug: stageLed ? 'theatre' : 'live_music',
    matchedTag: sourceTags[operaPosition] as string,
    mappingSource: 'datathistle-tag-map',
    sourceTags,
  };
}
