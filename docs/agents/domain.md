# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Single-context repo.** One `CONTEXT.md` at the repo root. **ADRs live in
`docs/decisions/` (not `docs/adr/`)** — this repo's established convention, using the
`docs/decisions/0000-adr-template.md` shape.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/decisions/`** — read ADRs that touch the area you're about to work in
  (`0001`–`0008`; `0008` sets tracer-bullet/vertical-slice delivery).
- For delivery/plan context, the live plan is the tracer-bullet PRD on the GitHub issue
  tracker; `docs/ROADMAP.md` is retained as horizontal reference (superseded by ADR 0008).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them
lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md            ← domain glossary
├── docs/
│   ├── decisions/        ← ADRs (0000 template, 0001–0008)
│   └── agents/           ← this config (issue tracker, triage labels, domain layout)
└── ...
```

## Knowledge vs work

- **Knowledge** lives in `docs/` (CONTEXT glossary, `decisions/` ADRs, reference specs).
- **Work** lives as GitHub issues (vertical-slice, `ready-for-agent`), consumed by the
  `.sandcastle/` agent runtime. The legacy backlog in `docs/tasks/` and `docs/prompts/`
  is being migrated into issues (ADR 0008).
