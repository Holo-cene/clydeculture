// NOTE: festival matching uses a SEPARATE normaliser from normaliseTitle().
// normaliseTitle() strips punctuation entirely so e.g. "Celtic-Connections"
// collapses to "celticconnections" — that's correct for dedupe-key parity with
// the SQL function, but would block a "Celtic Connections" term match on a
// hyphenated title. For festival-term matching we substitute punctuation with
// whitespace so word boundaries survive.

export interface FestivalRecord {
  id: string;
  slug: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  matchDomains: string[];
  matchTitleTerms: string[];
  matchUrlSlugs: string[];
}

export interface FestivalEventOverride {
  sourceId: string;
  externalId: string;
  festivalId: string;
}

export type FestivalMatchRule = 'domain' | 'title' | 'url_slug' | 'manual';

export interface FestivalWindowMismatch {
  festivalId: string;
  festivalSlug: string;
  matchRule: Exclude<FestivalMatchRule, 'manual'>;
  sourceId: string;
  externalId: string;
  startDate: string;
  endDate: string;
  eventDate: string;
  message: string;
}

export interface DetectFestivalInput {
  sourceId: string;
  externalId: string;
  title: string;
  startAt: string;
  sourceDomain: string | null;
  externalUrl: string | null;
  festivals: FestivalRecord[];
  overrides: FestivalEventOverride[];
}

export interface DetectFestivalResult {
  festivalId: string | null;
  isFestivalEvent: boolean;
  matchRule: FestivalMatchRule | null;
  windowMismatch: FestivalWindowMismatch | null;
}

const AUTOMATED_RULES: Exclude<FestivalMatchRule, 'manual'>[] = [
  'domain',
  'title',
  'url_slug',
];

export function detectFestival(input: DetectFestivalInput): DetectFestivalResult {
  const override = input.overrides.find(
    (o) => o.sourceId === input.sourceId && o.externalId === input.externalId,
  );
  if (override) {
    return {
      festivalId: override.festivalId,
      isFestivalEvent: true,
      matchRule: 'manual',
      windowMismatch: null,
    };
  }

  const normalisedTitle = normaliseForFestivalMatch(input.title);
  const domain = input.sourceDomain?.trim().toLowerCase() ?? '';
  const url = input.externalUrl?.toLowerCase() ?? '';

  let firstMismatch: FestivalWindowMismatch | null = null;

  for (const festival of input.festivals) {
    for (const rule of AUTOMATED_RULES) {
      if (!ruleMatches(rule, festival, { normalisedTitle, domain, url })) continue;

      if (!withinWindow(festival, input.startAt)) {
        if (firstMismatch === null) {
          firstMismatch = buildMismatch(festival, rule, input);
        }
        // Don't try lower-priority rules for this festival — once any rule
        // matched and the window failed, we record the mismatch and move on.
        break;
      }

      return {
        festivalId: festival.id,
        isFestivalEvent: true,
        matchRule: rule,
        windowMismatch: null,
      };
    }
  }

  return {
    festivalId: null,
    isFestivalEvent: false,
    matchRule: null,
    windowMismatch: firstMismatch,
  };
}

function ruleMatches(
  rule: Exclude<FestivalMatchRule, 'manual'>,
  festival: FestivalRecord,
  ctx: { normalisedTitle: string; domain: string; url: string },
): boolean {
  switch (rule) {
    case 'domain':
      if (!ctx.domain) return false;
      return festival.matchDomains.some((d) => ctx.domain === d.trim().toLowerCase());
    case 'title':
      if (!ctx.normalisedTitle) return false;
      return festival.matchTitleTerms.some((term) => {
        const t = normaliseForFestivalMatch(term);
        return t.length > 0 && ctx.normalisedTitle.includes(t);
      });
    case 'url_slug':
      if (!ctx.url) return false;
      return festival.matchUrlSlugs.some((slug) => ctx.url.includes(slug.toLowerCase()));
  }
}

function withinWindow(festival: FestivalRecord, startAtIso: string): boolean {
  if (!festival.startDate || !festival.endDate) return true;
  const eventDate = startAtIso.slice(0, 10);
  return eventDate >= festival.startDate && eventDate <= festival.endDate;
}

function normaliseForFestivalMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMismatch(
  festival: FestivalRecord,
  rule: Exclude<FestivalMatchRule, 'manual'>,
  input: DetectFestivalInput,
): FestivalWindowMismatch {
  const eventDate = input.startAt.slice(0, 10);
  const startDate = festival.startDate ?? '';
  const endDate = festival.endDate ?? '';
  const message =
    `Festival match '${festival.slug}' for event ${input.sourceId}/${input.externalId} ` +
    `failed window check: event ${eventDate} outside ${startDate}–${endDate}`;
  return {
    festivalId: festival.id,
    festivalSlug: festival.slug,
    matchRule: rule,
    sourceId: input.sourceId,
    externalId: input.externalId,
    startDate,
    endDate,
    eventDate,
    message,
  };
}
