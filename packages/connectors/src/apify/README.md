# Apify Connectors

Apify connectors trigger a managed Apify actor via the Apify API, poll for completion, fetch the output dataset, and map items to `RawEvent[]`. They contain no scraping logic — all extraction runs in the actor on Apify's infrastructure. Each connector maps to one actor, with the actor ID and version pinned in `sources.config`.

See ADR 0003 (`docs/decisions/0003-scraping-strategy.md`) and `packages/connectors/CLAUDE.md` for the connector interface pattern.

**Actor pinning:** Always pin the actor version in `sources.config` (e.g., `"actorVersion": "0.1.2"`). Never use `latest` — actor updates can silently change output schemas.

> **Implementation gates:**
> - Do not implement the **Eventbrite** connector until `docs/connectors/eventbrite/COMPLIANCE.md` has been written and reviewed.
> - Do not implement the **DICE.fm** connector until task CC-NEW-2 (DICE.fm pre-flight) is complete. CC-NEW-2 verifies the actor output schema and confirms ToS compliance before any code is written.
