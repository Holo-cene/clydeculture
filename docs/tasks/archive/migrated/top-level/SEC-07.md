> **ARCHIVED 2026-06-13.** Migrated — COVERED-BY archived E7 design-doc (HTML scraper preflight). See `docs/tasks/MIGRATION_TRIAGE.md`.

# SEC-07: HTML scraper legality — ToS review requirement and per-connector compliance log

**Priority:** P2
**Area:** Security, Connectors, Legal
**Status:** Open
**Depends on:** API-06 (HTML connector pre-flight)

## Why this matters

CONNECTOR_GUIDE.md §8 requires checking `robots.txt` before building an HTML scraper, but:

1. **Terms of service are not checked.** The UK Computer Misuse Act 1990 and the
   upcoming Computer Misuse (Amendment) Bill treat ToS-prohibited scraping as potentially
   unlawful access. Several Tier 3 targets (Gigs in Scotland, The Skinny, CCA Glasgow)
   have general prohibition clauses in their site terms. An undocumented scraper with no
   ToS review is an unmanaged legal exposure.

2. **robots.txt checks are undocumented.** The current checklist item says "Check
   robots.txt and record the finding in the connector's implementation notes," but no
   standard location for that record is defined. An AI agent building a connector will
   not know where to put the compliance record, and a reviewer cannot verify it was done.

3. **robots.txt changes are not re-checked.** A site may add a crawl disallow rule
   after the connector was built. The system has no mechanism to detect this.

This task adds a machine-readable compliance record to each HTML connector and extends
the CONNECTOR_GUIDE.md checklist with mandatory ToS review.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md` (§8 pre-flight checks
and the PR checklist), `docs/reference/SPEC.md` (§6 Tier 3 and Tier 4 sources and
"Sources to avoid"), and `docs/tasks/archive/completed/top-level/API-06.md` before proceeding.

**Your task** is to:
1. Add a standard compliance record format for HTML connectors.
2. Update CONNECTOR_GUIDE.md with mandatory ToS review steps.
3. Create a compliance record template and an example for SWG3.

---

### Step 1 — Create compliance record template

Create `packages/connectors/src/html/COMPLIANCE_TEMPLATE.md`:

```markdown
# Connector compliance record: <SOURCE_NAME>

**Connector slug:** <slug>
**Last reviewed:** <YYYY-MM-DD>
**Reviewer:** <name or GitHub handle>

## robots.txt

- URL checked: `https://<domain>/robots.txt`
- Date checked: <YYYY-MM-DD>
- Result: [ ] No relevant disallow rules found | [ ] Disallow found — see notes
- Relevant rules:
  ```
  <paste relevant robots.txt lines here, or "None">
  ```

## Terms of service

- ToS URL: <URL>
- Date checked: <YYYY-MM-DD>
- Prohibits automated scraping: [ ] Yes | [ ] No | [ ] Not stated
- Relevant clause (quote verbatim if prohibiting):
  > <quote or "Not stated">
- Assessment: [ ] Clear to proceed | [ ] Proceed with caution (see notes) | [ ] Do not build

## Notes / mitigations

<Any additional context, e.g. "No ToS page found — treated as 'not stated'",
"Venue contacted for permission on <date>", "robots.txt checked but no Disallow for /events">

## Decision

[ ] Approved to build
[ ] Blocked — reason: <reason>
```

---

### Step 2 — Create SWG3 compliance record

Create `packages/connectors/src/html/swg3/COMPLIANCE.md` using the template.

Fill in:
- `robots.txt` check: fetch `https://swg3.co.uk/robots.txt` and record the result.
- ToS check: check `https://swg3.co.uk/terms` or equivalent for scraping prohibition.
- Assessment: "SWG3 is a community arts venue in Glasgow. No API alternative exists.
  Contact venue before Phase 1 launch to request permission."

If the actual URLs cannot be fetched during this task, write the file with `[PENDING REVIEW]`
in the relevant fields and add a `needs_review` comment. Do not fabricate the results.

---

### Step 3 — Update `docs/CONNECTOR_GUIDE.md`

In **§8 Test locally**, replace the existing robots.txt checklist item:

> - [ ] `robots.txt` at the source domain does not disallow crawling the events path.
>   Check `https://<domain>/robots.txt` and record the finding in the connector's
>   implementation notes. If crawling is disallowed, do not build the connector —
>   propose alternative coverage (iCal, RSS, or link-out only) instead.

With the following expanded checklist:

> **Before building an HTML connector, complete the legal pre-flight:**
>
> - [ ] Create `packages/connectors/src/html/<slug>/COMPLIANCE.md` using the template
>   in `packages/connectors/src/html/COMPLIANCE_TEMPLATE.md`.
> - [ ] Check `https://<domain>/robots.txt`. Record the relevant rules verbatim in
>   COMPLIANCE.md. If the events path is disallowed, **do not build the connector**.
>   Propose iCal, RSS, or link-out coverage instead.
> - [ ] Check the source site's Terms of Service for automated access / scraping
>   prohibitions. Record the relevant clause verbatim (or "not stated" if absent) in
>   COMPLIANCE.md. If the ToS explicitly prohibits scraping, **do not build the connector**
>   without explicit written permission from the site owner.
> - [ ] Set COMPLIANCE.md decision to "Approved to build" before opening a PR. A PR
>   for an HTML connector without a COMPLIANCE.md will be rejected.
>
> **UK Computer Misuse Act note:** Accessing a computer system (including a website) in a
> way that is prohibited by its terms of service may constitute "unauthorised access"
> under the Computer Misuse Act 1990. When a site's ToS is ambiguous, prefer a lighter
> touch: link-out coverage only, or contact the venue directly to request permission.

Also add a new entry to the **PR checklist**:

> - [ ] COMPLIANCE.md exists in the connector directory and has decision = "Approved to build"

---

### Step 4 — Update `docs/reference/SPEC.md` §6

In the Tier 3 table notes column for "Gigs in Scotland", add:

> **Pre-build requirement:** check robots.txt and ToS before building. The site has
> structured data but may have scraping restrictions. See API-06 and SEC-07.

---

## Acceptance criteria

- [ ] `packages/connectors/src/html/COMPLIANCE_TEMPLATE.md` exists with all sections
- [ ] `packages/connectors/src/html/swg3/COMPLIANCE.md` exists (may have `[PENDING REVIEW]` fields if live fetch not possible)
- [ ] `docs/CONNECTOR_GUIDE.md` §8 includes the expanded legal pre-flight checklist
- [ ] `docs/CONNECTOR_GUIDE.md` PR checklist includes COMPLIANCE.md check
- [ ] UK Computer Misuse Act note is present in CONNECTOR_GUIDE.md
- [ ] Any existing HTML connector PRs are blocked from merge without a COMPLIANCE.md
