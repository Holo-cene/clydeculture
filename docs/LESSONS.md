# Lessons Learned

Post-implementation notes on patterns that caused problems or worked well.
Reference these before starting similar work.

## Format

Each entry should include:
- **Title** — what the lesson is about
- **Date discovered**
- **What happened** — brief, honest description
- **What to do instead** — actionable guidance
- **Related prompt or task** — where this lesson surfaced

---

## Entries

### Prescriptive prompts rot against a moving codebase

- **Date discovered:** 2026-06-11
- **What happened:** A prompt library (old `docs/prompts/12`–`16`) was written
  directly from Audit 2's findings, baking in specific values, field paths, and code
  snippets — e.g. confidence tier base scores of `40/25/10/5`, the Ticketmaster TBA
  field path `dates.time.noSpecificTime`, and a price-write snippet
  `price_min: guess ?? null`. A review against the live code found all three wrong:
  the real tier scores are `50/40/30/20` (`calculateConfidence` was already
  implemented), the TBA field is `dates.start.timeTBA` (already wired), and the naive
  price snippet would have bypassed the existing `pricesAllowed` link-first gate. An
  agent following those prompts would have regressed working code to match wrong tests.
- **What to do instead:** Prompts should encode *process and intent*, and force the
  agent to derive *values and structure* from the canonical sources (live code,
  migrations, `docs/NORMALISATION.md`) at run time. Use an audit/gate prompt to
  produce a file:line gap list first; make downstream prompts act *only* on confirmed
  gaps and no-op otherwise. Never copy a magic number from an audit into a prompt as
  an assertion target — cite where the agent must read it instead.
- **Related prompt/task:** `docs/prompts/11` (gate), `docs/prompts/12` (remediation);
  prompt-writing standard #6 in `docs/prompts/99-prompt-writing-standards.md`.
