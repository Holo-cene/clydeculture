# API-09: SPIKE — Verify Meetup GraphQL API public event search for Phase 2

**Priority:** P3  
**Area:** Connectors  
**Status:** Open  
**Depends on:** API-01

## Why this matters

The SPEC lists Meetup as a Tier 1 Phase 2 source with "Low" risk for community meetups
and social groups. Meetup migrated its public API from v3 (REST) to a new GraphQL API
in 2023 and deprecated the v3 REST endpoints. The v3 `GET /find/events` endpoint that
allowed unauthenticated public event search by city/coordinates no longer works.

The new GraphQL API has different authentication requirements and it is not confirmed
whether public event discovery by location (find all Meetup events in Glasgow) is
possible without organizer-level credentials or special partnership access.

If the Meetup API cannot deliver location-based public event search, the SPEC's risk
rating of "Low" must be updated to "High" and Meetup should be dropped or demoted to
Tier 3 (selective group polling, similar to the Eventbrite Option C fallback in API-01).

This is a Phase 2 concern and does not block Phase 1, but the outcome of API-01 may
promote Meetup to Phase 1 if it is selected as the Eventbrite replacement.

---

## Prompt

You are building Clyde Culture. Read `docs/reference/SPEC.md` Section 6 (Meetup row),
`docs/ROADMAP.md`, and the outcome of `docs/decisions/0003-grassroots-coverage-strategy.md`
(API-01) before proceeding.

**Your task** is to verify Meetup API access and update the SPEC accordingly.
This is a documentation-only spike.

**Step 1 — Research the Meetup GraphQL API:**

Check the current Meetup developer documentation (`developer.meetup.com`) for:
- Whether the GraphQL API supports public event search by city/location without
  organizer-level authentication
- What authentication scope is required (public read vs. OAuth organizer)
- Whether there is a "keyless" tier that returns public events (as the v3 API did)
- Rate limits for the GraphQL API
- Whether self-serve API key registration is available, or whether partnership approval
  is required

**Step 2 — Document the finding:**

Create `packages/connectors/src/api/meetup/SPEC.md` recording your findings:
- API endpoint and authentication approach
- Whether location-based public event search is available
- Rate limits
- Glasgow query approach (city name vs coordinates)
- Fields available: title, start_at, venue, group name, URL
- GraphQL query for Glasgow events (if access is confirmed)

**Step 3 — Update `docs/reference/SPEC.md`:**

Update the Meetup row in the Tier 1 table:
- If public search **is** available: update Notes to confirm GraphQL access and link
  to the connector spec
- If public search **is not** available (requires organizer auth):
  - Change Risk to "High"
  - Update Notes to "Requires organizer-level OAuth; cannot search public events by
    location. Consider selective group polling for known Glasgow groups."
  - Add a Phase 2 note to `docs/ROADMAP.md` marking this as unresolved

**Step 4 — If Phase 1 dependency (API-01 selected Meetup as Eventbrite replacement):**

If `docs/decisions/0003-grassroots-coverage-strategy.md` selected Meetup as the Phase 1
replacement for Eventbrite, and this SPIKE finds that public location search is not
available, escalate to P1 and reopen API-01 with this finding as a new constraint.

---

## Acceptance criteria

- [ ] `packages/connectors/src/api/meetup/SPEC.md` exists with the API access findings
- [ ] The spec confirms whether location-based public event search is available without
  organizer auth
- [ ] The spec documents current rate limits
- [ ] `docs/reference/SPEC.md` Meetup row is updated with the confirmed access model
- [ ] If access is unavailable: Risk column changed to "High" and Notes updated
- [ ] If API-01 depends on Meetup and access is unavailable: API-01 is re-escalated to P1
