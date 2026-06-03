# CC-NEW-2: DICE.fm Apify connector pre-flight

**Priority:** P1  
**Area:** Connectors / Integrations  
**Status:** Open  
**Depends on:** CC-NEW-1 (schema must include `source_type = 'apify'` before this row is seeded)

---

## Why this exists

ADR 0003 identifies DICE.fm as a Tier 2 Apify-based source. Before any connector code
is written, a pre-flight must verify that a suitable Apify actor exists, that its output
schema maps to `RawEvent`, and that automated access is permitted by DICE.fm's ToS and
robots.txt. This pre-flight output gates the actual connector implementation.

---

## Role

You are an integrations engineer performing a connector pre-flight spike for the Clyde
Culture project. Your output is a spec document, not production code. Do not write
TypeScript yet.

Read first:
- `docs/decisions/0003-scraping-strategy.md`
- `packages/connectors/CLAUDE.md`
- `packages/connectors/src/apify/README.md`
- `packages/connectors/src/connector.ts` (the `RawEvent` interface)

---

## Tasks

### 1. Apify actor discovery

Search the Apify Store for DICE.fm scrapers. Evaluate candidates on:
- Output schema completeness (title, date/time, venue, ticket URL, price)
- Maintenance status (last updated, open issues)
- Reliability indicators (run success rate, dataset item counts)

Select one actor. Pin its version. Document why it was chosen over alternatives.

If no suitable public actor exists, document this and note that a custom actor would
need to be built — this escalates the task.

### 2. Output schema mapping

Given a sample dataset item from the chosen actor, map each field to `RawEvent`:

| Actor output field | RawEvent field | Notes |
|---|---|---|
| `id` or equivalent | `externalId` | Must be stable — same event, same ID every run |
| `url` or `link` | `externalUrl` | Required — link-first architecture |
| `name` or `title` | `title` | |
| `startDate` | `startAt` | Convert to ISO 8601 |
| `venue.name` | `venueName` | |
| `genre` or `category` | `eventTypeGuess` | |
| `tags` | `tagsGuess` | |
| `price` | (price fields) | |

Identify any required fields that are missing from the actor output. Missing `externalId`
(stable ID) or `externalUrl` is a blocking issue.

### 3. Location filtering

DICE.fm is a UK-wide platform. The connector must filter to Glasgow events only.
Determine whether the actor supports location-based input (e.g., `location: 'Glasgow'`)
or whether city filtering must happen in the mapping step.

### 4. ToS and robots.txt check

- Read `https://dice.fm/robots.txt`
- Read the DICE.fm Terms of Service (find the automated access / scraping policy)
- Document: is automated access permitted? Are there rate limits or restrictions?

If access is not clearly permitted, flag this as a blocker. Do not proceed with connector
implementation until ToS is confirmed acceptable.

### 5. `sources` row config shape

Write the SQL to register the DICE.fm connector as a source:

```sql
insert into sources (name, slug, source_type, tier, base_url, config, is_active)
values (
  'DICE.fm',
  'dice-fm',
  'apify',
  2,
  'https://api.apify.com',
  '{
    "actorId": "<actor-id-from-step-1>",
    "actorVersion": "<pinned-version>",
    "input": {
      "location": "Glasgow",
      "maxItems": 200
    }
  }',
  false  -- enabled only after SPEC.md is reviewed
);
```

---

## Output

Create `packages/connectors/src/apify/dice/SPEC.md` containing:

1. **Actor chosen:** name, Apify Store URL, pinned version, rationale
2. **Output schema mapping:** the table from step 2, with any gaps noted
3. **Location filtering approach:** input param or post-filter, with evidence
4. **ToS status:** permitted / not-permitted / unclear (with source quote)
5. **robots.txt excerpt:** the relevant Disallow/Allow rules
6. **Sources row SQL:** from step 5
7. **Blockers / open questions:** anything that must be resolved before implementation

---

## Acceptance criteria

- [ ] `packages/connectors/src/apify/dice/SPEC.md` created
- [ ] Actor ID and pinned version documented
- [ ] All `RawEvent` required fields mapped or gaps explained
- [ ] ToS status confirmed (not just assumed)
- [ ] Sources row SQL ready to paste into a seed or migration
- [ ] No TypeScript written — this is a pre-flight only
