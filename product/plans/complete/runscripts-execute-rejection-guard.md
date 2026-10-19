# Runscripts execute rejection guard
**Complexity: 2/10** — one chained call gets a catch, and one test case covers it. The catch reuses the helper the action module already has, and no other path changes.

## Goal

Keep a fault after the execute run starts from escaping as an unhandled rejection. Node treats an unhandled rejection as fatal, so one throw from the enqueue or from the feed post would end the server and every open tab with it. A fault on this path should leave a cause line in the server log and leave the feed as it is.

## Design decisions

- The execute arm in `src/plugins/runscript-topic-actions.ts` starts `runRunscriptNow` with `void` and attaches a `then` with no catch. `runRunscriptNow` in `src/commands/execute.ts` guards only the file read. Its `systemShell.ensure()`, its `enqueueSystemBatch` call, and the feed post in the `then` are all unguarded.
- The subplan `04` says `ensure()` never rejects, and that holds, because `runEnsure` in `src/system-shell.ts` turns a failure into a failed status. The subplan says nothing about the enqueue or the feed post in the same chain, so the guard covers them too.
- The guard lives in the topic action, not in `runRunscriptNow`. The command and its tests rely on that function's contract, so it stays as it is, and `src/commands/execute.ts` and `src/commands/execute.test.ts` do not change.
- The catch calls the `reportCause` helper that the action module already defines. Its signature is `(action, error, name?)`, and it fits a rejection without change: `reportCause('execute', error, name)` writes `Runscript execute "<name>" failed: <message>` to stderr. That is the same line shape the delete, clone, and open failures already write, so no second logger is needed.
- The catch posts no feed text. The subplan specifies none for this path, so a failed run that gets this far shows no line in the feed, and the cause appears only in the server log. That is the tradeoff the entry accepted.
- The catch goes after the `then`, so it covers a rejection from the run and a rejection from the post callback alike.

## What already exists

| Existing piece | Where | How this fix uses it |
| --- | --- | --- |
| Execute arm | `src/plugins/runscript-topic-actions.ts` | Extended with one catch. |
| `reportCause` | `src/plugins/runscript-topic-actions.ts` | Reused as the stderr writer. Its signature fits. |
| `runRunscriptNow` | `src/commands/execute.ts` | Unchanged. Its contract stays as the command and its tests expect it. |
| `notify` mock | `src/plugins/runscript-topic-actions.test.ts` | Reused with `mockImplementationOnce` to make the feed post throw once. |

## Proposed changes

1. In `src/plugins/runscript-topic-actions.ts`, the execute arm appends `.catch((error: unknown) => { reportCause('execute', error, action.name); })` to its existing `then`. The file stays well under the 200-line limit.
2. No other source file changes.

## Tests

In `src/plugins/runscript-topic-actions.test.ts`, add one case to the `the runscripts execute action` block:

- The project directory is empty, so `execute deploy` takes the missing-file path and calls `notify` once with `No runscript named "deploy".`.
- The `notify` mock throws once through `mockImplementationOnce`.
- `process.stderr.write` is spied with a no-op implementation.
- A temporary `unhandledRejection` listener is attached before the call and removed in a `finally`.
- After the settle step, the case asserts that the feed call happened with the missing-file text, that stderr received `Runscript execute "deploy" failed: feed unavailable`, and that the listener was never called.

Every existing assertion stays as it is. Before the fix, the case fails on the stderr assertion, which records no call, and the test run reports that failure with the other 25 cases in the file still passing.

## Verification

- Run `./scripts/run.mjs check-diff` after the test is added and after the source change.
- Confirm by diff that `src/commands/execute.ts` and `src/commands/execute.test.ts` are unchanged.

## Spec and documentation

No user-visible behavior changes. The feed text, the silence of a successful run, and the command output stay the same. The new cause line goes only to the server log. `product/specs/scripts-tab.md` and `help.md` need no change.

## Out of scope

- Catching inside `runRunscriptNow` or `src/commands/execute.ts`. That would change the contract the command depends on.
- A process-wide `unhandledRejection` handler. The guard belongs at the one call that starts the chain, and a global handler would hide faults in other places.
- A feed line for a failed run. The subplan specifies none for this path.
- A dedicated test for the enqueue-throw path. The catch sits on the whole chain and covers it, and the entry asks for the feed-post case only.
