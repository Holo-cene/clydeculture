# Documentation

Generate the files below by running `PROMPTS_FOR_CLAUDE_CODE.md` in order.

## Core
- `PROJECT_OVERVIEW.md` — vision, principles, scope, success criteria
- `ARCHITECTURE.md` — system architecture, components, data flow
- `DATA_MODEL.md` — the canonical schema, documented (from the v5 schema)
- `INGESTION.md` — the four source types, scheduling, run logging, break detection
- `CONNECTOR_GUIDE.md` — how to build a new connector (the contributor contract)
- `DEDUPLICATION.md` — within-source and cross-source dedup strategy
- `FESTIVALS.md` — festival detection rules and festival pages
- `PUBLISHING.md` — how approved events reach the frontend
- `OPERATIONS.md` — environments, secrets, scheduling, monitoring, deployment
- `ROADMAP.md` — Phase 1 / Phase 2 / long-term, as a delivery plan
- `BRAND_VOICE.md` — the voice, where it applies, where it does not
- `CONTRIBUTING.md` — the open-source / community contributor model

## Decisions
- `decisions/` — Architecture Decision Records (ADRs). Start with the template.

## Reference (paste these in)
- `reference/SPEC.md` — the full platform specification
- `reference/SCHEMA_v5.sql` — the existing v5 Postgres schema
- `reference/DESIGN_LANGUAGE.md` — the brand and voice source document
