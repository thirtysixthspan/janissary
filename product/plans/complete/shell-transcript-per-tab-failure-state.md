# Shell transcript manager: keep failure state per open tab, not per label

**Complexity: 2/10** — `ShellTranscriptManager` replaces its label-keyed `notified` set with one small state object per open tab, which each writer captures at install and which `closeTab` discards; one class-comment paragraph and two manager tests. The writer, the file, the exit path's no-dispose behaviour, the reinstall path and shutdown are untouched.

## Goal

Make the once-per-tab notification rule of subplan 05 (`product/plans/complete/shell-tab-text-transcript-05-transcript-manager.md`, "Once per tab") hold whatever the order of a writer's PTY exit and its tab's `closeTab`. A failure surfacing after the tab has closed must post nothing and must not suppress the notice of a later tab given the same label — including from a writer whose shell exited just before its tab closed, the common case, since a shell tab closes itself when its shell exits.

## Problem (verified against the code)

- The earlier repair (`product/plans/complete/shell-transcript-ignore-released-writer-failures.md`) marks a writer as released in the private `release(id)`, which only `closeTab` and a reinstall call, and the `install` callback skips released writers.
- The `pty` `exit` subscription only deletes the entry from `entries`; it does not release the writer, so the writer's own exit listener runs its finishing path unmarked.
- `web/src/plugins/shell/useShellTabTerminal.ts` closes the shell tab from its `onExit`, so after `exit` the order is: PTY exit drops the entry → `closeTab(label)` finds no entry for the label, marks nothing, and deletes the label from `notified` → the finishing path's stream errors on `end()` (full or stalled disk) → the callback sees an unreleased writer and calls `reportFailure(label)`, which notifies for the vanished tab and re-adds the label to `notified`, silencing the next tab with that label for the life of the process.

## Approach

Attribute a writer's failure to the tab that was open when it was installed, rather than to its label:

- Replace `notified = new Set<string>()` with `tabs = new Map<string, TabFailureState>()`, where `TabFailureState` is `{ notified: boolean }`, one per open tab label.
- `install(ptyId, label)` takes the label's current state (creating it if absent) and the writer's failure callback closes over it.
- The callback reports only when the writer is not released and the captured state is still the label's current state; `reportFailure(state, label)` returns when `state.notified` is set, otherwise sets it and notifies.
- `closeTab(label)` keeps releasing the label's held writers, then deletes the label's state. Every writer installed under that tab — still held, already exited, or reinstalled-away — now holds a state no longer current, so its late failure is dropped regardless of whether its PTY exited before or after the close. A later tab with the label gets a fresh state and is reported afresh.
- Nothing retains exited writers: the map holds one small object per open label, and the writers hold their state, not the reverse. No per-label writer collection or dispose-settle bookkeeping is needed, which the backlog proposal suggested.
- The `released` `WeakSet` stays for the reinstall path, where the tab is still open and the newer writer speaks for it.
- Update the class comment's once-per-tab paragraph: failure state belongs to the open tab, and any failure from a writer of a tab that has since closed reports nothing, whether its shell exited first or not.

## Implementation steps

1. `src/shell/transcript/manager.ts`: the `tabs` map and `TabFailureState` type, the captured state in `install`, the guarded callback, `closeTab` deleting the state, `reportFailure` taking the state, and the comment update.
2. `src/shell/transcript/manager.test.ts`: the cases below.

## Tests

- New case "ignores a late failure from a writer whose PTY exited before its tab closed, so a later tab with that label still notifies once": install `pty-1` under `shell`, send output, spy on `BoundedAppendFile.prototype.dispose` (the exited writer's finishing path calls it; the writer's own `dispose` is never called on this path), emit `exit` for `pty-1`, `closeTab('shell')`, await the recorded close promise, then run that file's own abandon path through the spy's recorded `this` (the path a stream `'error'` after `end()` takes); assert `notify` was not called. Restore spies, lock the transcript directory, install `pty-2` under `shell`, send output, assert exactly one `'shell-transcript-failed'` notice for `'shell'`.
- New case "notifies a failure from an exited writer while its tab is still open": install `pty-1` under `shell`, send output, emit `exit`, capture and abandon the file as above without closing the tab, assert one notice for `'shell'`.
- Existing cases "drops a writer whose PTY exited without disposing it again on tab close", "notifies a tab's failure once across its writers, and again after the tab is closed" and "ignores a failure from a writer its closed tab released, so a later tab with that label still notifies once" keep passing unchanged.

## Spec

The shell transcript's user-facing spec is still to be written by subplan 08 (`product/plans/draft/shell-tab-text-transcript-08-specs-docs-and-end-to-end.md`), whose decision-10 wording already says "nothing for a failure that surfaces only after the tab has closed, and a later tab reusing the label is reported afresh"; this fix makes the code match it, so no spec text changes.

## Out of scope

- `ShellTranscriptWriter`, `BoundedAppendFile`, and the client's close-on-exit behaviour.
- The exit path's no-dispose behaviour, the reinstall path and shutdown's `dispose()`.
