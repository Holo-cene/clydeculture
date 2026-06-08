# Clyde Culture Prompt Library

Reusable Claude Code prompts for controlled, test-driven development of the Clyde Culture
engine and Astro frontend.

## How to use

Each numbered file is a standalone Claude Code prompt. Copy the full file content into
a new Claude Code session — or paste it as your first message — at the start of a
focused work session.

Work through them in order unless you have a specific reason to jump ahead. The sequence
is designed so each step builds on the previous one and does not create assumptions that
would block a later prompt.

## Important distinction — always keep this in mind

> The Astro website currently displays seeded demo data labelled "Source: Demo Eventbrite
> Feed". This proves the public display path, not the real Ticketmaster ingestion path.
>
> Do not treat a passing Astro demo as evidence that Ticketmaster ingestion works.

The five proof levels are distinct:

| Level | What it proves | Current status |
|---|---|---|
| Public display | Astro renders events from Supabase via anon key | Done (demo seed) |
| Seeded demo data | 10 events flow from seed.sql to published visibility | Done |
| Connector parser | Ticketmaster fixtures parse to `RawEvent[]` | Done (unit tests pass) |
| E2E with fixtures | Full path: fixture → external_events → events → public query | Not yet proven |
| Live Ticketmaster | Real API key, real Glasgow events ingested | Not yet started |

## Prompt index

| File | Purpose |
|---|---|
| [00-repo-status-reassessment.md](00-repo-status-reassessment.md) | Critically reassess repo state after any implementation branch |
| [01-mvp-acceptance-review.md](01-mvp-acceptance-review.md) | Verify the MVP public directory is still demoable |
| [02-package-boundary-cleanup.md](02-package-boundary-cleanup.md) | Fix architecture drift (DB calls in `packages/core`) |
| [03-frontend-publishing-decision.md](03-frontend-publishing-decision.md) | Clarify Astro-replaces-Webflow in a formal ADR |
| [04-ticketmaster-fixture-e2e-red-test.md](04-ticketmaster-fixture-e2e-red-test.md) | Write the failing E2E test for the Ticketmaster path |
| [05-ticketmaster-fixture-e2e-implementation.md](05-ticketmaster-fixture-e2e-implementation.md) | Implement the smallest code to pass the E2E red test |
| [06-ingestion-orchestration-review.md](06-ingestion-orchestration-review.md) | Assess whether Trigger/sweep is wired and production-sensible |
| [07-source-policy-and-link-first-compliance.md](07-source-policy-and-link-first-compliance.md) | Audit source policy before adding real URLs or live ingestion |
| [08-demo-data-to-realistic-demo-urls.md](08-demo-data-to-realistic-demo-urls.md) | Replace synthetic `example.org` URLs with real public pages |
| [09-ci-validation-workflow.md](09-ci-validation-workflow.md) | Add GitHub Actions CI validation |
| [10-next-source-fixture-plan.md](10-next-source-fixture-plan.md) | Plan next ingestion sources after Ticketmaster |
| [99-prompt-writing-standards.md](99-prompt-writing-standards.md) | Standards for writing new prompts in this library |

## Historical prompts

The files `01_PROMPTS_FOR_CLAUDE_CODE.md` through `07_MVP_SERIAL_AGENT_PROMPTS.md` are
the original prompt sequences used to build the initial docs set and the MVP. They are
kept for historical reference but are not intended to be re-run as-is. See the archive
notice in `01_PROMPTS_FOR_CLAUDE_CODE.md`.

## Standards

See [99-prompt-writing-standards.md](99-prompt-writing-standards.md) for the rules that
apply when writing or updating prompts in this library.
