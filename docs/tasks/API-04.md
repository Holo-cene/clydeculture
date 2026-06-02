# API-04: iCal connector specification — RRULE expansion, floating-time, and all-day events

**Priority:** P2  
**Area:** Connectors  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

iCal is listed as a Tier 2 source (very stable) for Mono, The Flying Duck, and The Pipe
Factory. The format is stable, but three correctness issues will silently produce wrong
data if the connector is built without addressing them:

1. **RRULE expansion.** Recurring events (e.g., a weekly club night) are stored as a
   single VEVENT with a recurrence rule. A parser that reads VEVENTs one-for-one will
   produce one record instead of the full series. Glasgow venue nights are commonly
   recurring — this failure mode is high-frequency.

2. **Floating-time events.** A `DTSTART` without a `TZID` suffix is a "floating" time
   with no timezone. The iCal standard says floating times are in "local time" — for
   Glasgow venues this means Europe/London, but a parser that doesn't apply this
   assumption explicitly will interpret them as UTC, producing events 1–2 hours off.

3. **All-day events.** `DTSTART;VALUE=DATE:20260614` has no time component. Coercing
   this to a `timestamptz` of `2026-06-14T00:00:00Z` is actively wrong (midnight UTC
   = 1:00 AM BST in summer) and mislabels the event's timing. All-day events need
   special handling in the schema and UI.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md`, `docs/DATA_MODEL.md`,
`docs/reference/SCHEMA_v5.sql`, and `CLAUDE.md` before proceeding.

You are writing the specification and shared utilities for all iCal connectors. Do not
build any specific venue connector yet — write only the shared iCal parsing utilities
and their specification.

**Step 1 — Choose and document the iCal parsing library:**

In `packages/connectors/src/ical/README.md`, document the chosen iCal parsing approach.
The recommended library is `ical.js` (pure JS, handles RRULE, VTIMEZONE, and all-day).
Confirm it is compatible with the chosen execution runtime (see BE-01). If the runtime
is Deno/Edge Functions, confirm the import path.

Document the library name, version, and import path. Do not install the dependency
without approval — flag it in the acceptance criteria instead.

**Step 2 — Write shared iCal parsing utilities:**

Create `packages/connectors/src/ical/parse.ts` implementing these utilities:

```ts
/**
 * Expands a parsed iCal feed into individual event occurrences within a time window.
 * Handles RRULE, EXDATE, VTIMEZONE, floating-time, and VALUE=DATE events.
 */
export function expandCalendar(
  icalText: string,
  windowStart: Date,
  windowEnd: Date,  // recommend: today + 90 days
): ParsedCalendarEvent[];

export interface ParsedCalendarEvent {
  uid: string;           // VEVENT UID — required, globally unique per iCal spec
  title: string;         // SUMMARY
  startAt: Date;         // resolved to Europe/London for floating-time events
  endAt?: Date;
  isAllDay: boolean;     // true when DTSTART is VALUE=DATE
  url?: string;          // URL property if present
  description?: string;  // DESCRIPTION if present — store minimally, link-first
}
```

Implement `expandCalendar` with the following behaviour:
- Pass `windowStart`/`windowEnd` as the expansion range for RRULE (do not expand
  infinite recurrences — cap at `windowEnd`)
- For DTSTART without TZID (floating): apply `Europe/London` timezone
- For DTSTART;VALUE=DATE: set `isAllDay = true`; set `startAt` to midnight
  Europe/London on that date
- Return individual occurrence objects — one per date in the recurrence series

**Step 3 — Write the iCal connector template:**

Create `packages/connectors/src/ical/template.ts` — a worked template that venue-specific
iCal connectors copy and fill in, using `expandCalendar`. This mirrors the RSS template
in `docs/CONNECTOR_GUIDE.md` Section 6.

**Step 4 — Update `docs/CONNECTOR_GUIDE.md`:**

After Section 6 (RSS worked example), add a Section 6b "Worked example: iCal connector"
using the template and documenting the three correctness rules.

**Step 5 — Schema note:**

Add a comment to `docs/DATA_MODEL.md` in the `events` table section noting that `start_at`
for all-day events is stored as midnight Europe/London with `timezone = 'Europe/London'`,
and that the UI should detect all-day events via a future `is_all_day` boolean (to be
added in a follow-up schema migration if needed).

---

## Acceptance criteria

- [ ] `packages/connectors/src/ical/README.md` documents the chosen library, version,
  and compatibility confirmation
- [ ] `packages/connectors/src/ical/parse.ts` exports `expandCalendar` with the
  `ParsedCalendarEvent` type
- [ ] RRULE expansion is capped at `windowEnd` (no infinite recurrences)
- [ ] Floating-time events default to `Europe/London` timezone
- [ ] `VALUE=DATE` all-day events have `isAllDay = true` and `startAt` at midnight
  Europe/London
- [ ] `packages/connectors/src/ical/template.ts` exists as a copy-paste venue template
- [ ] `docs/CONNECTOR_GUIDE.md` has a Section 6b iCal worked example
- [ ] `docs/DATA_MODEL.md` notes all-day event storage convention
- [ ] Dependency (the ical library) is flagged for approval, not silently installed
