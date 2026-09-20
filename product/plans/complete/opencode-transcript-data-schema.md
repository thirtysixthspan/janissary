# Opencode transcript adapter reads the `data`-column schema

**Complexity: 4/10** — one adapter, one schema probe, one JSON-unwrapping path, and fixture tests mirroring an existing suite. No wiring changes anywhere else.

## Bug

`investigate why opencode is repeatedly reporting a notification of "no harness transcript found"` — the first entry under `## ready` in `./product/backlog/bugs.md`.

Every opencode harness tab's transcript adapter fails against the opencode version installed here, so each tab silently degrades and the `no harness transcript found` line lands in the notifications feed once per tab — and again for every new opencode tab the user opens. The adapter was written against opencode's previous database layout; that layout has since changed, which is exactly the schema-drift scenario the extract-harness-transcripts plan anticipated (its open question 2) and its own comment documents ("opencode's schema has already changed once").

## Root cause

The opencode adapter (`src/harness/transcript/opencode.ts`) selects flat columns that no longer exist:

- `readMessages` selects `role` from `message` — the column is gone.
- `readParts` selects `type, text, tool, state` from `part` — all four are gone.

The current schema keeps each message's and each part's content as one JSON document in a `data` column: `message.data` carries `role`, and `part.data` carries `type`, `text`, `tool`, and `state` (with `state` already a nested object rather than a JSON string column). Verified against the live `~/.local/share/opencode/opencode.db`:

```sql
CREATE TABLE `message` (`id` text PRIMARY KEY, `session_id` text NOT NULL,
  `time_created` integer NOT NULL, `time_updated` integer NOT NULL, `data` text NOT NULL, ...)
CREATE TABLE `part` (`id` text PRIMARY KEY, `message_id` text NOT NULL, `session_id` text NOT NULL,
  `time_created` integer NOT NULL, `time_updated` integer NOT NULL, `data` text NOT NULL, ...)
```

Every poll therefore throws "no such column: role" inside `readMessages`, the adapter's catch-all treats it as "nothing new" and returns `[]` forever, the tab never produces a transcript entry despite resolving its session row, and the tab's only observable outcome is the fallback notification — once per tailer, seen again with every new tab, which is the "repeatedly reporting" the reporter sees.

## Replication (observed before the fix)

1. Against the live database read-only: the adapter's own queries were run with `node:sqlite`. The session-resolution query returns the tab's session row (`ses_f4039a62fffe5anofrZaJ8Yawg` for this cwd), and the message query fails with `no such column: role`.
2. As an automated test: `src/harness/transcript/opencode.test.ts` gained a fixture built with the real `data`-column shapes. All five new tests failed against the unfixed adapter — `poll()` returned `[]` for every scenario, so a tab on this schema yields no transcript and degrades to the notification path.

## Correct behavior

An opencode harness tab's transcript adapter reads the session's messages and parts whatever column layout the installed opencode uses: the current `data`-JSON layout and the older flat-column layout both resolve, render, and stream into the transcript, and only a genuinely unrecognized schema (missing tables) degrades to the once-per-tab `no harness transcript found` notification. This is what `product/specs/harness-recording.md` § Session transcripts already states for opencode — "rows in its session database, where a subagent is a session whose parent is the tab's own session" — so the code, not the spec, is what changes.

## Approach

1. **Schema probe, once per opened database.** After opening `opencode.db`, run `PRAGMA table_info(message)` and `PRAGMA table_info(part)` and record whether each table has a `data` column. The probe is memoized with the database handle, so it costs two tiny queries once per tab.
2. **Read through the `data` documents.** When the `data` column exists, `readMessages` selects `id, session_id, time_created, data` and takes `role` from the parsed document; `readParts` selects `data` and uses the parsed document as the part record — its `state` is already an object, so the existing `partRecord` unwrapping applies only to the old flat `state` column. A `data` value that does not parse is skipped, never thrown.
3. **Keep the old path intact.** When `data` is absent the adapter runs today's queries verbatim. Older opencode installs keep working, and the existing flat-schema tests guard that unchanged path.
4. **Failure behavior unchanged.** Any throw still means "nothing new" (`poll()` catches), and a database missing the expected tables still never resolves — the genuinely-unrecognized-schema degradation stays as is.

## Implementation steps

1. Add the data-column fixture suite to `src/harness/transcript/opencode.test.ts` (done first, watched failing).
2. In `src/harness/transcript/opencode.ts`: add the memoized schema probe (`PRAGMA table_info` + a `hasColumn` helper), a JSON-document helper, and the two read paths' branch on the probe result.
3. Update the adapter's header comment: the schema has now changed twice, and the adapter reads both layouts.
4. `./scripts/run.mjs check-diff` after each step; confirm the new suite passes and the old suite still passes.

## Regression test

`src/harness/transcript/opencode.test.ts`, describe block `OpencodeTranscriptSource with data-column schema` — five tests: role from the `data` JSON resolves and renders; a tool part with a nested `state` object renders call plus result; a child session's rows are labeled `subagent`; the second read returns only newer rows; a non-JSON `data` value is skipped. They fail against the unfixed adapter (observed) and pass with it. The pre-existing flat-schema suite proves the old layout still reads.

## Verification

- New and existing opencode adapter tests green under `check-diff`.
- Manual: run the adapter's query shapes against the live `~/.local/share/opencode/opencode.db` read-only — resolution and message/part reads both succeed on the real database after the fix.

## Out of scope

- Reading any new opencode content kinds beyond what the normalizer already renders (`step-start`/`step-finish`/`reasoning` documents are dropped by `normalizeOpencodePart` exactly as before).
- Distinguishing an unrecognized opencode version from a missing session with a more specific notification (open question 2 of the original plan).
- Any other harness adapter, the tailer, or the notification text.
