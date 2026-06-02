# API-06: HTML connector pre-flight — JS rendering SPIKE and robots.txt compliance

**Priority:** P1  
**Area:** Connectors  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

Two unresolved issues will cause HTML connectors to silently fail or violate ToS if not
addressed before any Tier 3 connector is built:

**1 — JS rendering.** The ingestion runtime may be Supabase Edge Functions (Deno). Deno
does not support Puppeteer or Playwright. If any Tier 3 source renders its event listings
via JavaScript (common in CMS-heavy sites), a plain `fetch()` will return HTML with no
events — `parsedCount = 0` every run, break detection flags it, but no events are ever
ingested. This is not a connector bug; it is an infrastructure gap. It must be resolved
per-source before any connector is built.

**2 — robots.txt compliance.** No document in the repo mentions `robots.txt`. Scraping
a venue's events page without checking robots.txt is both a terms of service risk and a
reputational risk for a community non-profit. The Connector Guide now requires the check
as a pre-flight step; this task implements the systematic verification for all Phase 1
Tier 3 sources.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md` (especially the new
pre-flight checklist in Section 8), `docs/reference/SPEC.md` Section 6 (Tier 3 sources),
`docs/INGESTION.md`, and `CLAUDE.md` before proceeding.

**Your task** is a documentation-only SPIKE: for every Phase 1 Tier 3 HTML source, verify
JS rendering requirements and robots.txt status, and record the findings.

**Phase 1 Tier 3 sources to check:**
- SWG3 (`https://swg3.tv/events` or similar)
- Mono (`https://www.monocafebar.com/events`)
- The Flying Duck (`https://theflyingduck.co.uk/whats-on`)
- St Luke's (`https://www.stlukesglasgow.com/events`)

**Step 1 — For each source, test static HTML rendering:**

Attempt to fetch the events listing URL using a plain HTTP GET (no JavaScript). You can
simulate this with `curl -s <url> | grep -i "event\|gig\|show"` or equivalent. Record:
- Whether event titles are visible in the raw HTML response
- Whether the page returns a meaningful HTML body or a JS-rendered shell
- The HTTP status code

**Step 2 — For each source, check robots.txt:**

Fetch `https://<domain>/robots.txt` and check whether the events path is disallowed
for bots. Record:
- Whether robots.txt exists
- Whether `User-agent: *` or a specific crawler is disallowed from the events path
- Whether there is a `Crawl-delay` directive

**Step 3 — Write the findings document:**

Create `docs/connectors/html-preflight.md` with a table:

| Source | Events URL | Static HTML? | robots.txt status | Recommended approach |
|---|---|---|---|---|
| SWG3 | ... | Yes/No/Partial | Allowed / Disallowed / Missing | HTML/iCal/Skip |
| Mono | ... | ... | ... | ... |
| The Flying Duck | ... | ... | ... | ... |
| St Luke's | ... | ... | ... | ... |

**Recommended approach values:**
- `HTML` — static fetch works, robots.txt allows, build the connector
- `iCal` — static fetch fails (JS-rendered) but an iCal feed exists; use that instead
- `JS-required` — static fetch fails and no iCal alternative; requires headless browser
  infrastructure decision (see BE-01) before proceeding
- `ToS-blocked` — robots.txt disallows; do not scrape; pursue iCal or RSS alternative,
  or contact venue to discuss data sharing

**Step 4 — Update `docs/reference/SPEC.md`:**

For any Tier 3 source where the recommended approach changes from `HTML` to something
else, update the "Integration" and "Risk" columns in the Tier 3 table.

**Step 5 — If any source is `JS-required`:**

Add a note to `docs/decisions/0002-ingestion-runtime.md` (once it exists, per BE-01)
that that specific source requires headless browser infrastructure. If the runtime ADR
does not yet exist, add a comment in `docs/connectors/html-preflight.md` flagging the
dependency on BE-01.

---

## Acceptance criteria

- [ ] `docs/connectors/html-preflight.md` exists with findings for all four Phase 1 sources
- [ ] Each source has a documented static-HTML test result
- [ ] Each source has a documented robots.txt check result
- [ ] Each source has a recommended approach (`HTML`, `iCal`, `JS-required`, `ToS-blocked`)
- [ ] `docs/reference/SPEC.md` Tier 3 table is updated where the approach changed
- [ ] Any `JS-required` source is flagged as a dependency on BE-01's runtime decision
- [ ] No HTML connector implementation exists for any `JS-required` or `ToS-blocked` source
