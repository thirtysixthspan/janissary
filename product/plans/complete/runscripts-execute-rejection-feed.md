# Runscripts execute rejection feed
**Complexity: 2/10** — one catch in the execute arm gains a guarded feed post, and the rejection test gains one assertion plus one case for the guard. The wording reuses the module's `failed` helper, and no other path changes.

## Goal

When a runscripts execute run is rejected, the user sees a line in the notifications feed, not only a line in the server log. The repair that guarded the execute chain wrote the cause to the server stderr alone, so a run that never started looked like a silent success. Subplan 04's Goal says failures go to the notifications feed.

## Design decisions

- The execute arm's catch keeps its `reportCause('execute', error, action.name)` call first, so the server log still records the cause.
- The feed line is `Could not run runscript "<name>".`, produced by the existing `failed('run', name)` helper beside the other failure texts. Subplan 04 names no text for this path, so the wording is new and is flagged for the owner to confirm.
- The feed post runs in a small helper, `postRunFailure`, with its own try. Its catch calls `reportCause('execute', error, name)`, so a feed that is itself broken still leaves the cause in the server log, and the outer catch cannot reject and reintroduce the unhandled rejection that the repair removed.
- `runRunscriptNow` in `src/commands/execute.ts` and its tests stay unchanged, as the repair required.
- Every other `post` call and its text stay unchanged.

## What already exists

| Existing piece | Where | How this fix uses it |
| --- | --- | --- |
| Execute arm and its catch | `src/plugins/runscript-topic-actions.ts` | Extended. The catch gains the guarded feed post. |
| `reportCause` | `src/plugins/runscript-topic-actions.ts` | Reused for the run's cause and for a failed post. |
| `failed` and `post` | `src/plugins/runscript-topic-actions.ts` | Reused. `failed('run', name)` produces the new line. |
| `notify` mock | `src/plugins/runscript-topic-actions.test.ts` | Reused with `mockImplementationOnce`, as the repair does. |

## Proposed changes

1. In `src/plugins/runscript-topic-actions.ts`, add a helper `postRunFailure(managers, origin, name)`. It calls `post(managers, origin, failed('run', name))` inside a try, and its catch calls `reportCause('execute', error, name)`. The execute arm's catch calls `reportCause('execute', error, action.name)` first, then `postRunFailure(managers, origin, action.name)`.
2. In `src/plugins/runscript-topic-actions.test.ts`, extend the existing case `reports a feed-post rejection to stderr and leaves no unhandled rejection` with one assertion that the second `notify` call carries the origin `janus` and the text `Could not run runscript "deploy".`. Its existing assertions stay as they are. Add one case after it for a feed that throws on both posts.
3. No other source file changes. `src/commands/execute.ts` and `src/commands/execute.test.ts` stay unchanged.

## Tests

- Existing case extended: after the first `notify` call, which throws, a second call goes to `plugin-note` with origin `janus` and the text `Could not run runscript "deploy".`. The stderr and unhandled-rejection assertions stay unchanged.
- New case: `notify` throws on the missing-file post and again on the run-failure post. Stderr receives `Runscript execute "deploy" failed: feed still unavailable`, and no unhandled rejection is raised. This case exercises the try inside `postRunFailure`, which the existing case does not reach.

## Verification

- Run `./scripts/run.mjs check-diff` after the source change and again after the tests. All tests pass.
- Confirm by diff that `src/commands/execute.ts` and `src/commands/execute.test.ts` are unchanged, and that the other `post` calls in `src/plugins/runscript-topic-actions.ts` keep their text.

## Spec and documentation

No spec change. `product/specs/scripts-tab.md` does not exist yet, because subplan 09 writes it. Help and user documentation need no change for this task.

## Out of scope

- Removing the stderr write or the `reportCause` call. The cause stays in the server log.
- Changing `runRunscriptNow` or `src/commands/execute.ts`.
- Changing any other feed text or any other `post` call.
- A process-wide `unhandledRejection` handler.
- Changing the new wording. The owner is asked to confirm it, and it stays as shipped unless the owner changes it later.
