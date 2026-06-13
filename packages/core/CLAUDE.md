# core package — Claude Code reference

Pure normalisation, deduplication, and festival detection logic. No I/O, no Supabase calls,
no side effects. Every exported function must be deterministic and safe to call in tests
without any external setup.

## Critical invariants

- **No I/O.** This package must never import Supabase, fetch, fs, or any network/disk
  dependency. If you need data from the DB, pass it as an argument.
- **SQL parity.** `normaliseTitle()` and `deriveDedupeKey()` must produce identical output
  to their SQL counterparts (`normalise_title()` and `compute_dedupe_key()`). A mismatch
  causes cross-source deduplication to silently fail. Tests are the contract.
- **API over scrape.** When merging duplicate records, the API-sourced record is canonical.
  `mergeExternalEventIntoCanonicalEvent()` must preserve this preference.

## Dedup key contract

Cross-source dedup key = SHA-256 of:

```
COALESCE(venue_id::text, 'no-venue')
  || '|'
  || TO_CHAR(DATE_TRUNC('hour', start_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD-HH24')
  || '|'
  || normalise_title(title)
```

`deriveDedupeKey(venueId: string | null, startAt: string, title: string): string`
- `venueId` null → use literal `'no-venue'`
- `startAt` is ISO 8601; truncate to UTC hour before hashing
- `title` is passed through `normaliseTitle()` before hashing
- Returns a 64-character lowercase hex string

## Title normalisation contract

`normaliseTitle(input: string): string`

Must match the SQL function exactly:
```sql
regexp_replace(lower(input), '[^[:alnum:][:space:]]', '', 'g')
-- then collapse multiple spaces → single space, trim
```

`[:alnum:]` is Unicode-aware in PostgreSQL — it retains accented letters (é, ü, ñ, ó)
and other Unicode letters. The TypeScript implementation must use a Unicode-aware equivalent
(e.g. `/[^\p{L}\p{N}\s]/gu`), not the ASCII-only `[^a-z0-9 ]`. Using ASCII-only would
cause cross-source dedup to silently fail for events with accented characters.

Rules:
- Lowercase the input
- Strip characters that are not Unicode letters, digits, or whitespace
- Collapse multiple consecutive whitespace to a single space
- Trim leading/trailing whitespace
- Must be idempotent

## Functions in this package

| Function | Module | Notes |
|---|---|---|
| `normaliseTitle()` | `src/normalise/normalise.ts` | Must match SQL `normalise_title()` |
| `normaliseVenueName()` | `src/normalise/normalise.ts` | Used for venue alias matching |
| `deriveDedupeKey()` | `src/dedupe/dedupe.ts` | Must match SQL `compute_dedupe_key()` |
| `mergeExternalEventIntoCanonicalEvent()` | `src/dedupe/dedupe.ts` | API wins over scrape |
| `mapSourceCategoryToEventType()` | `src/normalise/normalise.ts` | Governs taxonomy |
| `calculateConfidence()` | `src/normalise/normalise.ts` | Legacy single-score gate (RLS still uses this) |
| `calculateTrust()` | `src/normalise/normalise.ts` | ADR 0006 trust signal — "is this event real?" |
| `calculateCompleteness()` | `src/normalise/normalise.ts` | ADR 0006 completeness signal — Minimum Viable Public Event |
| `isEligibleForPublic()` | `src/normalise/normalise.ts` | ADR 0006 split gate (`trust >= T && completeness >= C`) |
| `detectFestival()` | `src/festivals/festivals.ts` | Affects grouping and display |

## Tests

Framework: **Vitest v2**. Run with `pnpm --filter @clydeculture/core test`.

| Test file | Covers |
|---|---|
| `src/dedupe/dedupe.test.ts` | `deriveDedupeKey`, `mergeExternalEventIntoCanonicalEvent` |
| `src/normalise/normalise.test.ts` | `normaliseTitle`, `normaliseVenueName` |
| `src/normalise/trustCompleteness.test.ts` | `calculateTrust`, `calculateCompleteness`, `isEligibleForPublic` (ADR 0006) |
| `src/festivals/festivals.test.ts` | `detectFestival` |

Before implementing any function in this package, write the test first per the
repository test-driven development policy (`CLAUDE.md`).
