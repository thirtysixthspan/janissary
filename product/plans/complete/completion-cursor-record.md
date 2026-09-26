# Parse the command-line cursor once into a named record for tab completion

**Complexity: 4/10** — a mechanical signature change confined to `src/completion/` plus one caller rename in `src/controller/completion.ts`. No new architecture, no behavior change; the colocated completion suites pin every handler's output, and a missed or transposed field becomes a compile error once the handlers take a record.

`completeCommandLine` in `src/completion/index.ts` derives `before`, `after`, `tokenStart`, `token`, `preceding`, `command`, and `argumentIndex` from the input and cursor, then passes a different positional subset of them to each of nine handlers, each of which ends in `completeWord(partial, keepPrefix, candidates, suffix, before, after, tokenStart)`. Meaning is carried by position alone — three adjacent strings (`keepPrefix`, `before`, `after`) and a candidate list — and the `agents` parameter actually receives every open tab label.

## Goal

The cursor is parsed once into a `CompletionCursor` record and each handler takes `(cursor, candidates)`, where `candidates` is the one data source it needs (labels, connections, the monitor catalog, themes) or nothing at all. `completeWord` and `replaceToken` read `before`/`after`/`tokenStart`/`token` from the cursor, with the rarely varied parts (`keepPrefix`, `suffix`, `partial`) passed by name. No completion output changes.

## Approach

1. **`src/completion/types.ts`**: add `CompletionCursor = { before; after; tokenStart; token; preceding; command; argumentIndex }`.
2. **`src/completion/cursor.ts`** (new): a pure `readCompletionCursor(input, cursor): CompletionCursor` holding the derivation now inline in `completeCommandLine`, so it can be tested and reused by the handler tests to build realistic cursors. While the command word itself is being typed there is no preceding word; `command` is then the empty string (today it is an `undefined` the `string` type hides), which no handler matches, exactly as before.
3. **`src/completion/handlers.ts`**: name the monitor catalog shape `MonitorCompletions` so `completeCommandLine` and `completeMonitorCommand` share one declaration instead of restating it inline.
4. **`src/completion/helpers.ts`**: `replaceToken(cursor, newToken, matches)`; `completeWord(cursor, candidates, { keepPrefix = '', suffix = ' ', partial = cursor.token } = {})`. A space suffix is the default because every caller but `broadcast` uses it; a short comment states the defaults.
5. **Handlers** — `completeAgentName(cursor, labels)`, `completeSendTarget(cursor, labels)`, `completeScheduleTarget(cursor, labels)`, `completeConnectionClose(cursor, connections)` (`target-handlers.ts`); `completeBrowserCommand(cursor, connections)` (`browser.ts`); `completeMonitorCommand(cursor, monitor)`, `completeSearchCommand(cursor)`, `completeSyntaxTheme(cursor, themes)`, `completeHarnessModel(cursor)` (`handlers.ts`). The `broadcast` comma-segment case passes `{ partial, keepPrefix, suffix: '' }`.
6. **`completeFilePath(cursor, cwd)`** in `fs.ts`: its extra `input`/`cursor` parameters are always `before + after` and `before.length`, so it takes the cursor record too and derives them.
7. **`completeCommandLine`**: rename `agents` to `labels`; build the cursor with `readCompletionCursor` and hand it to every handler. Its public signature (`input, cursor, cwd, labels, connections, monitor`) is otherwise unchanged, so `src/controller/completion.ts` only renames its local `agents` to `labels`.

The backlog entry also asked to delete handler re-exports at the top of `src/completion/handlers.ts`; those are already gone on master (removed by the re-export retirement in #1307), and `index.ts` already imports each handler from its defining file.

## Implementation steps

1. Add `CompletionCursor` to `types.ts` and create `cursor.ts` with `readCompletionCursor`.
2. Change `replaceToken` and `completeWord` in `helpers.ts`.
3. Change the nine handlers and `completeFilePath` to the new signatures.
4. Rewire `completeCommandLine` and rename `agents` → `labels` there and in `src/controller/completion.ts`.
5. Rewrite the direct-call tests in `handlers.test.ts` and `helpers.test.ts` to build cursors with `readCompletionCursor` from a real input line; `index.test.ts` must pass unchanged.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/completion/cursor.test.ts` (new): `readCompletionCursor` splits before/after at the cursor, finds the token start after the last space or tab, derives `preceding`, lowercases the command word and strips a leading `/`, and counts `argumentIndex` from the preceding words.
- `src/completion/helpers.test.ts`: `completeWord` defaults to a space suffix and the cursor token as the partial, and honors a `partial`/`keepPrefix` override; `replaceToken` splices at the cursor's token start.
- `src/completion/handlers.test.ts`: every existing case, re-expressed as `(readCompletionCursor(line, pos), candidates)`, keeps its expected output, plus a direct `completeAgentName` case for the `broadcast` comma segment, the one caller that overrides `partial` and `keepPrefix`.
- `src/completion/index.test.ts`: unchanged, and must pass as-is.

## Out of scope

- Any change to what is completed or how candidates are gathered in `src/controller/completion.ts`.
- The client-side completion UI (`CommandInput`) and the RPC shape of `complete`.
