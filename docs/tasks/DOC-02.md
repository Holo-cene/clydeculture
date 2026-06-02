# DOC-02: Define error-handling and logging convention

**Priority:** P2  
**Area:** Architecture  
**Status:** Open  
**Depends on:** BE-01

## Why this matters

`CONNECTOR_GUIDE.md` specifies that `run()` must not throw and errors go into
`IngestResult.errors[]` as plain strings. That is the only error-handling contract in the
codebase. There is no convention for:

- Log levels — what is `info` vs `warn` vs `error`
- Log format — plain string, structured JSON, or key=value
- What goes into `IngestResult.errors[]` vs what is logged vs what is swallowed
- The precise rule for what counts as "parseable" vs "unparseable" for the
  `fetchedCount`/`parsedCount` gap — which directly drives break detection thresholds
- How the orchestrator attaches context (connector slug, run ID) to connector log output

Without this convention, three connectors built in three sessions will produce three
different error formats, making automated alert triage and log queries inconsistent.

---

## Prompt

You are building Clyde Culture. Read `docs/CONNECTOR_GUIDE.md`, `docs/INGESTION.md`,
and `docs/OPERATIONS.md` before proceeding. This is a documentation and interface task —
the only source file you may modify is `packages/connectors/src/connector.ts`.

**Step 1 — Create `docs/LOGGING.md`:**

Write the authoritative error-handling and logging convention for the platform. Cover
all five sections below.

**Section 1 — Log levels.** Define exactly four levels:

- `info` — normal operation. Use for: connector started, page fetched, run completed.
  Maximum one `info` log per major stage. Do not log per-record progress at info level.
- `warn` — recoverable record-level anomaly. Use for: a single record was skipped
  (missing URL, disallowed by ToS), a field was absent but the record was still
  processable, a venue was auto-created. The run continues.
- `error` — unrecoverable record-level failure. Use for: a record must be skipped due
  to a parse exception. Also push a formatted string to `IngestResult.errors[]`.
- `fatal` — orchestrator-level failures only. Use for: a connector threw despite the
  no-throw contract; a database write failed; the run cannot be recorded. The
  orchestrator catches this, logs it at `fatal`, and marks the run `failed`.

Connectors use only `info`, `warn`, and `error`. `fatal` is orchestrator-only.

**Section 2 — Log format.** All logs are structured JSON with exactly these fields:

```json
{
  "level": "warn",
  "msg": "Record skipped — no URL",
  "source": "swg3",
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "ts": "2026-06-02T14:23:01.123Z",
  "data": { "raw_title": "Mystery Night" }
}
```

- `level`: one of `info`, `warn`, `error`, `fatal`
- `msg`: plain English, verb-first (e.g. "Record skipped — no URL", "Feed fetched OK")
- `source`: the connector's slug
- `run_id`: the `ingest_runs.id` UUID for the active run
- `ts`: ISO 8601 with milliseconds
- `data`: optional object for structured context; omit the key entirely when empty

The `source` and `run_id` fields are injected by the orchestrator, not the connector
(see Section 5 below).

**Section 3 — The `fetchedCount` / `parsedCount` rule.** Define precisely:

- Increment `fetchedCount` for every raw record retrieved from the source, before any
  parsing. This is the count the break-detection baseline is compared against.
- Increment `parsedCount` (via `items.length`) only for records that produce a valid
  `RawEvent`: non-empty `externalId`, non-empty `externalUrl`, non-empty `title`.
- A record that is deliberately skipped (missing URL, ToS violation) counts in
  `fetchedCount` but not `parsedCount`. Push a `[SKIP]` error string and emit a `warn` log.
- A record that throws during parsing counts in `fetchedCount` but not `parsedCount`.
  Push a `[PARSE]` error string and emit an `error` log.
- A record where the fetch itself failed entirely contributes 0 to `fetchedCount`.
  Push a `[FETCH]` error string; `parsedCount` will be 0 for the run.

**Section 4 — `IngestResult.errors[]` format.** All error strings use a prefix:

```
[SKIP] <reason> — <context>
[PARSE] <reason> — <context>
[FETCH] <reason>
```

Examples:
```
[SKIP] No URL — title: "Mystery Night at The Arches"
[SKIP] Link-only source — imageUrl omitted per ToS
[PARSE] Invalid date "32 June 2026" — externalId: skiddle-98765
[PARSE] Unexpected response shape: missing dates.start.dateTime — externalId: vvG1abc
[FETCH] HTTP 429 Too Many Requests — connector will retry on next scheduled run
[FETCH] Network timeout after 10s
```

`[SKIP]` and `[PARSE]` are record-level; include enough context to identify the record.
`[FETCH]` is fetch-level; no record context is available.

**Section 5 — Logger interface.** The connector does not instantiate a logger.
The orchestrator injects one when calling `run()`. This keeps the connector free of
infrastructure concerns and allows the orchestrator to attach `source` and `run_id`
to every log line automatically.

Define the interface (to be implemented in `packages/shared`):

```ts
export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
}
```

When no logger is injected (e.g. in unit tests), the connector operates silently —
it does not fall back to `console.log`. This keeps test output clean.

**Step 2 — Update `docs/CONNECTOR_GUIDE.md`:**

In section 3 (Implement the interface), add a "Logging and errors" subsection
immediately after the interface listing. Summarise in one screenful:

- The four log levels with when-to-use rules
- The `fetchedCount`/`parsedCount` counting rule
- The `[SKIP]`, `[PARSE]`, `[FETCH]` error string format with one example each
- A note: "Do not use `console.log` in connector code — use the injected logger."
- Link to `docs/LOGGING.md` for the full spec.

**Step 3 — Update `packages/connectors/src/connector.ts`:**

Extend the `Connector` interface to accept an optional logger. Add `Logger` as an
import placeholder comment (the type will be exported from `@clydeculture/shared`
once INF-01 is complete; use an inline definition for now):

```ts
/** Minimal logger interface injected by the orchestrator. Connectors do not instantiate this. */
export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
}

export interface Connector {
  readonly slug: string;
  readonly type: SourceType;
  /**
   * Pull and parse upstream items. Must not throw — return errors in IngestResult.
   * @param logger Injected by the orchestrator. When undefined (e.g. in tests), operate silently.
   */
  run(logger?: Logger): Promise<IngestResult>;
}
```

Update the skeleton in `packages/connectors/CLAUDE.md` to accept the logger parameter
in the `run()` method signature.

---

## Acceptance criteria

- [ ] `docs/LOGGING.md` exists and covers all five sections
- [ ] All four log levels have unambiguous when-to-use rules; `fatal` is restricted to the orchestrator
- [ ] The log format JSON example is fully specified with all required fields
- [ ] The `fetchedCount`/`parsedCount` rule covers skip, parse failure, and fetch failure cases
- [ ] `IngestResult.errors[]` string format defines `[SKIP]`, `[PARSE]`, `[FETCH]` with examples
- [ ] The `Logger` interface is defined in the doc (not just referenced)
- [ ] `docs/CONNECTOR_GUIDE.md` has a logging subsection with a `console.log` prohibition
- [ ] `packages/connectors/src/connector.ts` `run()` accepts `logger?: Logger`
- [ ] The `Logger` interface is inlined in `connector.ts` with a note that it will move to `@clydeculture/shared`
- [ ] `packages/connectors/CLAUDE.md` skeleton `run()` signature includes the logger parameter
