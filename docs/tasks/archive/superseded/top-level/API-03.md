> **ARCHIVED 2026-06-13.** SUPERSEDED. Skiddle commercial approval is upstream of any code; preflight retained via archived E2 design-doc. See `docs/tasks/MIGRATION_TRIAGE.md`.

# API-03: Skiddle API — obtain commercial approval before connector build

**Priority:** P1  
**Area:** Connectors / Legal  
**Status:** Open  
**Depends on:** —

## Why this matters

Skiddle's API terms restrict commercial use and include a non-compete clause. The relevant
terms:

- **Non-commercial default.** Commercial use requires prior written approval from
  `dev@skiddle.com`.
- **Non-compete clause.** The API may not be used on any site or application that
  "directly competes with Skiddle Ltd's business activity." Clyde Culture is a
  Glasgow event discovery platform; Skiddle is a UK ticketing and event discovery
  platform. The overlap is significant.
- **Attribution required.** Must credit Skiddle by name and brand logo.
- **Link constraint.** Must link to Skiddle using the exact event URL returned by the API.
- **Long-term conflict.** SPEC Section 15 mentions "Optional ticket affiliate revenue"
  as a future goal — at that point the commercial use term clearly triggers.

Building the Skiddle connector before obtaining written approval puts Clyde Culture in
breach of Skiddle's terms from day one. This task gates the connector build.

---

## Prompt

You are building Clyde Culture. This is a documentation and process task, not a
code task. Read `docs/reference/SPEC.md` Section 6 (Skiddle row), `CLAUDE.md`, and
`docs/PROJECT_OVERVIEW.md` before proceeding.

**Your task** is to draft the approval request email and create a decision record
capturing the outcome.

**Step 1 — Draft the approval request:**

Create `docs/decisions/0004-skiddle-api-approval.md` using the template at
`docs/decisions/0000-adr-template.md`. Set status to `pending`. Include:
- A section "Approval email" with the draft text of the email to send to `dev@skiddle.com`
  describing the project, confirming non-profit status, confirming link-first approach,
  and explicitly requesting written approval for commercial use and clarification on
  whether the non-compete clause applies
- A section "Terms constraints" documenting the obligations if approval is granted
  (Skiddle attribution, logo, link requirements)
- A section "If approval is refused" describing the fallback: treat Skiddle events as
  link-out only via HTML scraping of skiddle.com/Glasgow (Tier 3) or drop the source

**Step 2 — Add a gate comment to the Skiddle connector stub:**

Add a file `packages/connectors/src/api/skiddle/README.md` with a single-paragraph
notice:

> **Do not implement this connector until written approval has been received from
> Skiddle (`dev@skiddle.com`) and recorded in `docs/decisions/0004-skiddle-api-approval.md`.**
> See API-03 for context. Building without approval violates Skiddle's commercial use
> and non-compete terms.

**Step 3 — Write a connector spec stub:**

Once approval is confirmed, this spec will be completed. For now, create
`packages/connectors/src/api/skiddle/SPEC.md` as a stub:

```
# Skiddle connector spec

**Status: Blocked — awaiting commercial approval (see docs/decisions/0004-skiddle-api-approval.md)**

## When unblocked, document here:
- Confirmed rate limits (daily/hourly)
- Attribution and logo requirements
- Link constraint (must use exact Skiddle event URL)
- Glasgow geo filter parameters (lat, lng, radius)
- Fields available: title, start_at, venue, ticket_url, genre
```

---

## Acceptance criteria

- [ ] `docs/decisions/0004-skiddle-api-approval.md` exists with status `pending`
- [ ] The ADR contains a complete draft approval request email
- [ ] The ADR documents the obligations if approved
- [ ] The ADR documents the fallback if refused
- [ ] `packages/connectors/src/api/skiddle/README.md` contains the gate notice
- [ ] `packages/connectors/src/api/skiddle/SPEC.md` stub exists
- [ ] No Skiddle connector implementation exists until status changes to `accepted`
