# Runscripts action failure cause in the server log
**Complexity: 2/10** — five failure catches in one action module each gain a bound error and one stderr line through a single helper, and six existing test cases gain a stderr assertion. No feed text, control flow, or file-operation code changes.

## Goal

Each failure catch in the runscripts action module writes its cause to the server's stderr, so a permission, write, or directory fault can be diagnosed from the server log and not only by reproducing it. The feed keeps its generic line, with the text the subplan specifies.

## Design decisions

- **Logging call.** The server has no shared logger for error reports. `src/transcript/logger.ts` is the agent transcript writer, not a diagnostics log. Server error reports are written with `process.stderr.write` as one line ending in `\n`, as `excludeScriptsFromGit` in `src/schedule/system/runscript-files.ts` does, and as `src/schedule/system/firing.ts`, `src/bus.ts`, `src/global-history.ts`, and `src/conversations/store.ts` do. The cause text comes from `errorText` in `src/error-text.ts`, which returns the same value as the inline `error instanceof Error ? error.message : String(error)` that `excludeScriptsFromGit` computes. The shared helper is used instead of repeating that ternary in five catches.
- **Correction to the entry.** The entry says all five catches bind no error. The `createOne` catch already binds `error`, and `untitledName(error)` reads the attempted name from it. That catch only gains the stderr write. The other four catches gain a new binding.
- **Line format.** The line is `Runscript <action> "<name>" failed: <cause>` followed by a newline, where `<action>` is `delete`, `clone`, `open`, or `create`. `ensureDirectory` has no runscript name, so its line is `Runscript ensureDirectory failed: <cause>`. The create line uses the same `untitledName(error)` value that the feed line uses, so the log and the feed name the same runscript.
- **Helper placement.** The helper `reportCause` goes in `src/plugins/runscript-topic-actions.ts`. The module is about 100 code lines today and about 115 after the change, under the 200-line limit, so no new module is needed.
- **Scope.** The execute arm and its `runRunscriptNow` chain are not touched; that belongs to the other pull-request entry. The `missing(...)` paths do not throw and get no stderr line. `src/schedule/system/runscript-files.ts`, `src/commands/execute.ts`, and the topic routing are not changed.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this fix uses it |
| --- | --- | --- |
| Action module | `src/plugins/runscript-topic-actions.ts` | Five catches gain a bound error and a `reportCause` call. |
| Cause text helper | `src/error-text.ts` (`errorText`) | Produces the cause text for the stderr line. |
| Stderr convention | `src/schedule/system/runscript-files.ts` (`excludeScriptsFromGit`) | The line form and the `process.stderr.write` call. |
| Failing test cases | `src/plugins/runscript-topic-actions.test.ts` | Six existing cases already reach the five catches and gain a stderr assertion. |

## Proposed changes

In `src/plugins/runscript-topic-actions.ts`:

- Import `errorText` from `'../error-text.js'`.
- Add `reportCause(action: string, error: unknown, name?: string): void`. It writes `Runscript ${subject} failed: ${errorText(error)}\n` to `process.stderr`, where `subject` is `action` when `name` is `undefined`, and `` `${action} "${name}"` `` otherwise.
- `deleteOne`: bind `error` in the catch and call `reportCause('delete', error, name)` before the existing post.
- `cloneOne`: bind `error` in the catch and call `reportCause('clone', error, name)` before the existing post.
- `createOne`: keep the existing `error` binding. Compute `const attempted = untitledName(error);`, call `reportCause('create', error, attempted)`, then post `failed('create', attempted)`. The post text is the same as before.
- `openOne`: bind `error` in the catch and call `reportCause('open', error, name)` before the existing post.
- `ensureDirectory`: bind `error` in the catch and call `reportCause('ensureDirectory', error)` before the existing post.

Every `post(...)` call and its text stay as they are, so the feed lines still match the subplan verbatim.

## Tests

No new test cases. The six existing cases that already reach the five failing catches gain a `process.stderr.write` spy, mocked to return `true` so test output stays clean, and an assertion that the cause appears in the written line. Their feed assertions are not changed.

| Existing case | Catch reached | Asserted stderr line contains |
| --- | --- | --- |
| delete of a symlink | `deleteOne` | `Runscript delete "deploy" failed: Runscript path is not a regular file` |
| clone of a symlink source | `cloneOne` | `Runscript clone "deploy" failed: Runscript path is not a regular file` |
| open of a symlink | `openOne` | `Runscript open "deploy" failed: Runscript path is not a regular file` |
| create with a symlinked `untitled-2.rs` | `createOne` | `Runscript create "untitled-2" failed: Runscript path is not a regular file` |
| create with a symlinked `.janissary` | `createOne` | `Runscript create "untitled" failed: Runscript path is not a real directory` |
| ensureDirectory with a symlinked `.janissary` | `ensureDirectory` | `Runscript ensureDirectory failed: Runscript path is not a real directory` |

The file's existing `afterEach` gains `vi.restoreAllMocks()` so that the spies never leak into other cases. The `notify` mock is a `vi.fn()` and is not affected by that call.

## Verification

Run `./scripts/run.mjs check-diff` after the change and fix any failure before finishing. Confirm by reading the diff that every `post(...)` call and its text is unchanged and that no existing `expect` line in the test file changed. Confirm that `src/plugins/runscript-topic-actions.ts` stays under 200 code lines, since `max-lines` applies to it.

## Spec

No spec change. The change is server-side diagnostics only. The feed text, the actions, and what the user sees do not change, and no scripts-tab spec exists on this branch.

## Out of scope

- The execute chain's rejection handling, which is the other entry on this pull-request backlog.
- Any change to `src/schedule/system/runscript-files.ts`, `src/commands/execute.ts`, or the topic routing.
- Help or user-documentation changes, since no documented behavior changes.
- A pull-request description change, since the entry names none.
