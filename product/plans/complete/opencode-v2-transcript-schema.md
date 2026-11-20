# Read opencode v2 session transcripts

**Complexity: 5/10** — ~180 added lines across 2 new modules and one edited adapter, 9 requirements, 8 scenarios (p=5.47)

## Summary

Named `opencode` harness tabs extract a session transcript from opencode's own session database so that subagent activity and the full conversation survive beyond the terminal scrollback. opencode 2.0 replaced the old `session` / `message` / `part` tables with a new event-sourced layout (`session_v2` / `session_message` / `session_part`). The transcript adapter only knows the old layout, so against a fresh 2.0 store every query fails, the tab never resolves a session, no transcript file is written, and the tab emits the single `no harness transcript found` notification after the resolution deadline. This fix teaches the adapter to read the 2.0 layout.

## Root cause

`src/harness/transcript/opencode.ts` hard-codes the v1 schema: `resolve()` and `discoverChildren()` query `session`, and `readMessages()` / `readParts()` query `message` and `part`. A fresh opencode 2.0 database has none of those tables. Each `prepare(...)` throws, the shared `catch` in `poll()` swallows it, `poll()` returns `[]` and `resolved()` stays false. The tailer therefore never opens a transcript file and, after `RESOLVE_DEADLINE_MS`, calls `onUnavailable` — the `transcript-unavailable` notification rendered as `no harness transcript found`. The code already probes for one prior schema change (`data` JSON columns vs flat columns), so the adapter is the right place to add another layout.

## Correct behavior

An opencode harness tab resolves the session belonging to its own process (newest top-level session in the tab's cwd whose `time_created` is at or after the tab's spawn time), discovers that session's subagent children, and reads turns and tool parts from whichever schema the database actually uses. With opencode 2.0's layout this must produce the same normalized text as today — `user: …`, `assistant: …`, `assistant → <tool>(<input>)` plus `<tool> result: …`, and `[subagent <id>] …` prefixes — and mark the source resolved, so the transcript file is created and no `no harness transcript found` notification is emitted. Older v1 databases keep working unchanged.

## Reproduction

Added a fixture to `src/harness/transcript/opencode.test.ts` that creates a database at `<home>/.local/share/opencode/opencode.db` containing only the opencode 2.0 tables (`session_v2`, `session_message`, `session_part`), one session in the test cwd started at `spawnedAt`, and a `user` and an `assistant` turn. Against the unmodified adapter, `source.poll()` returned `[]` (expected `['user: v2 user prompt', 'assistant: v2 answer']`) and `source.resolved()` was false. Command: `npx vitest run --project server src/harness/transcript/opencode.test.ts` — 1 failed, 12 passed.

## Approach

1. Keep `OpencodeTranscriptSource` as the public `TranscriptSource` every caller already imports and keep its v1 logic in place. On its first `poll()` it checks the opened database for the `session_v2` table. When present it creates and delegates `poll()` / `resolved()` to a new v2 reader; otherwise the existing v1 path runs unchanged. Detection is by table presence, not a CLI version string, matching the pinned opencode schema.
2. Extract the small SQLite helpers (`query`, `placeholders`, `hasColumn`, `jsonRecord`, `partRecord`) from `opencode.ts` into `src/harness/transcript/opencode-db.ts` so both readers share the same defensive value narrowing. No behavior change; `opencode.ts` imports them back. This also keeps `opencode.ts` well under the 200-line `max-lines` limit after delegation is added.
3. Add `src/harness/transcript/opencode-v2.ts` with a `TranscriptSource` that mirrors the v1 reader's state machine (private session list and `(time_created, id)` cursor) against the 2.0 tables:
   - resolve from `session_v2` by `directory`, `time_created >= spawnedAt`, and `parent_id IS NULL` (top-level only, newest first);
   - discover children by `parent_id IN (…)` on every poll;
   - read `session_message` rows for those sessions ordered by `(time_created, id)` past the cursor;
   - render `user` turns from `data.text`, `assistant` turns from inline `data.content` or, when present, from `session_part` rows ordered by `ordinal`; text, reasoning and tool blocks render through the shared `render.ts` vocabulary so output matches v1 exactly;
   - ignore opencode's bookkeeping message types (`synthetic`, `system`, `idle`, `skill`, `shell`, compaction and switch messages), matching today's v1 coverage.
4. Extend `src/harness/transcript/opencode.test.ts` with the v2 fixture (already added as the failing reproduction) plus cases for tool parts, `session_part` overrides, subagent children, incremental polling, and ignored bookkeeping types.
5. Update the `harness-recording.md` spec's opencode bullet to note that both the original and current opencode database layouts are read.

## Implementation steps

1. Create `src/harness/transcript/opencode-db.ts` with the shared helpers, importing from `./json.js`; change `opencode.ts` to import them.
2. Create `src/harness/transcript/opencode-v2.ts` with the v2 reader described above.
3. Add layout detection and delegation to `src/harness/transcript/opencode.ts`, keeping the constructor and exports unchanged.
4. Extend `src/harness/transcript/opencode.test.ts` with the v2 cases.
5. Update `product/specs/harness-recording.md`.
6. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Regression test

`src/harness/transcript/opencode.test.ts`, describe block `OpencodeTranscriptSource with opencode v2 schema`. The primary test fails before the fix (`[]` instead of the two rendered turns) and passes after it. Additional cases pin tool rendering, `session_part` overrides, subagent labels, incremental polling, and skipping opencode's bookkeeping message types.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes, including the new v2 tests and all existing v1 tests.
- The reproduction command above now reports all tests passing; the v2 fixture resolves and yields the expected text.
- Live end-to-end: start a scratch instance (`./temp/fix-a-bug/`), and use one `e2e-driver` batch under `./temp/fix-a-bug-drivers/` to open a `harness opencode` tab, drive a first turn, and confirm a `.janissary/harness-transcripts/` file appears containing the turn with no `no harness transcript found` notification. This needs a real opencode 2.0 session to be produced inside the scratch HOME; if the sandbox cannot produce one (offline model, missing credentials, or browser connection failure), record the live check as not possible with that reason rather than as a pass.
- No other manual steps.

## Out of scope

- Writing to or migrating opencode's database — the adapter stays read-only.
- Rendering every v2 message kind; only user and assistant turns and their text/reasoning/tool parts render, matching today's v1 coverage.
- Image/media blocks and `media:` blob references; a missing image becomes no rendered block rather than an error.
- Changing the transcript file format, naming, lifecycle, or the notification wording and deadline.
- Shell/ssh transcripts and the other two harnesses.
- opencode's own data-directory resolution (`XDG_DATA_HOME` and the private workspace OAuth data home) — unchanged.
