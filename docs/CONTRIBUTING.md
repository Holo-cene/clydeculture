# Contributing to Clyde Culture

Clyde Culture is a community collective. Contributions to the engine — connectors, schema
changes, bug fixes — are welcome from members and collaborators. This document explains
how to do that well.

---

## Before you start

Read [`CLAUDE.md`](../CLAUDE.md) for the full project context and hard rules. This
document assumes you have. The most important things to hold in mind:

- Clyde Culture is a discovery and routing layer, not a publisher. It links to events;
  it does not republish them.
- The source of truth is Supabase. The frontend is disposable.
- A broken connector must never affect other connectors. Isolation is structural.

---

## Proposing a connector

The most common contribution is a new source connector. Before writing any code:

1. **Check whether the source already exists.** Look in `packages/connectors/src/` and
   in the `sources` table. A connector may exist but be paused or disabled.

2. **Check the source's terms of service.** See the link-first and ToS rules below.
   Sources that prohibit scraping or automated access cannot be added.

3. **Choose the right source type.** In order of preference: `api` → `rss` → `ical` →
   `html`. HTML connectors are the most fragile and require ongoing maintenance. If a
   venue publishes an RSS or iCal feed, use it.

4. **Open an issue or discussion before building.** Describe the source, the source type,
   what data it exposes, and any ToS constraints. This avoids duplicate effort and catches
   problems early. Don't write the connector first and ask for a review second.

Once your proposal is agreed, follow [`docs/CONNECTOR_GUIDE.md`](CONNECTOR_GUIDE.md) to
build and register it.

---

## Code conventions

These apply to all contributions, not just connectors.

**Language and tooling.** TypeScript strict mode throughout. Node. pnpm workspaces.
No new runtime dependencies without discussion — open an issue first.

**Schema changes** go through `supabase/migrations/`. Never edit the database out of band.
Migration files are sequential and cannot be reordered after they run.

**Secrets** live in environment variables or Supabase Vault. Never in config JSON, never
in committed files.

**Descriptions** should be kept minimal even for sources that permit them. Store a short
summary at most. See the link-first rule below.

**No connector should affect another.** Every run logs to `ingest_runs`. Break detection
flags a connector when parsed count drops more than 70% below its 14-day median. If your
connector is noisy, that affects the median — keep it clean.

---

## The link-first and ToS rules

These are non-negotiable.

Clyde Culture routes to sources. It does not republish them. This means:

- Store a short summary at most. Never store full descriptions, body text, or images from
  sources that prohibit reproduction — Resident Advisor and Instagram are explicit examples.
- Do not scrape sources that prohibit automated access in their ToS, regardless of how
  useful the data would be.
- If a source's ToS changes, the connector must be reviewed and potentially disabled.
  A connector that was compliant at launch may not stay that way.
- Prefer API access over scraping wherever a source offers it. API access is more stable
  and typically has clearer ToS around automated use.

When in doubt, don't build the connector. Reach out to the source to ask about data access.

---

## Testing

All code contributions must follow the two-step test-first workflow described in
`docs/DEVELOPMENT_WORKFLOW.md` and enforced in `CLAUDE.md`.

The short version:

1. Write or update the relevant test(s) first. Do not write production code yet.
2. Review the test: what does it prove? what edge cases remain?
3. Wait for the prompt: `Now implement the smallest production code needed to pass this test. Run the test and report the result.`
4. Then implement the smallest production change that makes the test pass.

**Do not weaken tests, skip assertions, or mock away the behaviour under test to make
an implementation easier.** If a test cannot be written because a contract is missing,
stop and propose the missing contract.

For package-specific test targets and example prompts, see `docs/TESTING.md`.

To run tests:

```bash
pnpm test                                         # all packages
pnpm --filter @clyde-culture/core test            # core only
pnpm --filter @clyde-culture/connectors test      # connectors only
pnpm typecheck && pnpm lint                       # type and lint checks
```

---

## Pull requests

Keep pull requests focused. A connector is one PR. A schema migration is one PR. Don't
bundle unrelated changes.

**What to include in the PR description:**
- What the change does and why
- For connectors: the source name, source type, ToS status, and a sample of the data
  the connector returns
- For schema changes: the migration file and the reason for the change

**What reviewers will check:**
- Does the connector implement the shared interface correctly?
- Is the connector isolated — does a failure leave other connectors unaffected?
- Does the connector respect the source's ToS and the link-first rule?
- Are secrets handled correctly?
- Does the migration follow the existing naming and sequencing conventions?

There is no formal SLA on reviews. If your PR is waiting, a comment in the issue or
discussion thread is the right way to follow up.

---

## Non-code contributions

Bug reports, source suggestions, ToS flags, and documentation improvements are all
useful. Open an issue with enough context to act on it. For source suggestions, note
the source name, URL, and whether you have checked the ToS.
