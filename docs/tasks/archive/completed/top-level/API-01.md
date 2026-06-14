# API-01: SPIKE — Eventbrite deprecated; define Phase 1 grassroots coverage strategy

**Priority:** P1  
**Area:** Connectors / Strategy  
**Status:** Open  
**Depends on:** —

## Why this matters

The SPEC assigned Eventbrite as the Phase 1 backbone for community, workshop, and grassroots
event coverage. This assumption is broken: Eventbrite removed public event search by location
(`GET /v3/events/search/` with `location.*` parameters) in December 2019 and the API is
reported as unsupported as of 2025. The only remaining endpoints require a known Eventbrite
event ID, venue ID, or organization ID — there is no way to discover Glasgow events on
Eventbrite without already knowing they exist there.

Phase 1 has no replacement for this coverage tier. Without a decision, the connector
directory stubs under `packages/connectors/src/api/eventbrite/` will never be buildable.

---

## Prompt

You are building Clyde Culture, a Glasgow cultural events aggregator. Read `CLAUDE.md`,
`docs/reference/SPEC.md` (Section 6 and Section 14), and `docs/ROADMAP.md` before
proceeding.

The Eventbrite API public event search has been deprecated since December 2019 and is
unsupported. It cannot be used to discover Glasgow events by location. The Phase 1 ingestion
backbone (SPEC Section 14) must be redesigned to replace the grassroots/community/workshop
coverage tier that Eventbrite was assigned.

**Your task** is a documentation-only spike: assess the three replacement options below and
write an ADR that selects one (or a combination) as the replacement strategy.

**Option A — Promote Meetup to Phase 1.**
Meetup has a working location-based event search API and strong coverage for community meetups
and workshops. Risk: Meetup migrated to a GraphQL API in 2023 and the new API's access model
for public event discovery needs verification (see API-09). Do not choose this option unless
you can confirm from public Meetup developer documentation that unauthenticated public event
search by city is supported.

**Option B — Community submission form as primary grassroots channel.**
Accept that grassroots events are not automatable from an aggregation API, and make the public
submission form (`event_submissions` table) the primary onramp for this category.
Downside: requires active community engagement at launch; coverage is zero until contributors
submit.

**Option C — Selective organization-scoped Eventbrite polling.**
Identify a list of known Glasgow cultural organizations that publish events on Eventbrite
(e.g. Glasgow Film Festival, CCA, Tramway) and poll each org's
`GET /v3/organizations/:id/events/` endpoint individually. This is not discovery — it is
targeted polling of known accounts. You must maintain a static list of organization IDs.
Upside: Eventbrite API still works for this pattern. Downside: no discovery of new/unknown
organizations; requires manual curation.

**Step 1 — Research:**
Check the current Meetup developer documentation (developer.meetup.com) for whether public
event search by city is available without organizer-level authentication. Document your
finding in the ADR.

**Step 2 — Write the ADR:**
Create `docs/decisions/0003-grassroots-coverage-strategy.md` using the template at
`docs/decisions/0000-adr-template.md`. The ADR must:
- State that Eventbrite public event search is deprecated and unavailable
- Evaluate all three options with pros, cons, and any known unknowns
- Select a decision (or declare it blocked pending API-09 verification)
- If Option C is selected or included, provide a starter list of known Glasgow
  Eventbrite organization IDs to seed the static list

**Step 3 — Update SPEC.md:**
In Section 14 (Phase 1 MVP), replace the Eventbrite line with the chosen alternative.
Update Section 6 Tier 1 table to reflect the new strategy.

**Step 4 — If Option A is chosen, update ROADMAP.md:**
Move Meetup from Phase 2 to Phase 1 in the roadmap.

---

## Acceptance criteria

- [ ] `docs/decisions/0003-grassroots-coverage-strategy.md` exists with status `accepted`
  or `blocked` (if Meetup API verification is pending)
- [ ] The ADR explicitly states that Eventbrite public search is unavailable
- [ ] A single replacement strategy is selected (or the decision is explicitly deferred
  with a blocker named)
- [ ] `docs/reference/SPEC.md` Section 14 no longer lists Eventbrite as a Phase 1 source
- [ ] `docs/reference/SPEC.md` Section 6 Eventbrite row reflects the deprecated status
- [ ] If Meetup is selected: `docs/ROADMAP.md` moves Meetup to Phase 1
- [ ] If Option C is selected: a seed list of known Glasgow Eventbrite org IDs is documented
