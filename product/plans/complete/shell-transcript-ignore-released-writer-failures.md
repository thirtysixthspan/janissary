# Shell transcript manager: ignore failures from writers already released

**Complexity: 2/10** — one guard in `ShellTranscriptManager`'s failure callback, backed by a per-manager `WeakSet` filled by its private `release` method, and one test that forces a failure on the close path; the writer, the file and the exit-release path are untouched.

## Goal

Keep the once-per-tab notification rule of subplan 05 (`product/plans/complete/shell-tab-text-transcript-05-transcript-manager.md`, "Once per tab") true across a tab's close: a writer released by `closeTab` that fails later during its asynchronous finishing path must not post a notice for a tab that no longer exists, and must not re-add the label to the notified set, where nothing would remove it and a later tab reusing the label would never be told its own transcript stopped.

## Problem (verified against the code)

- `ShellTranscriptManager.closeTab` calls `release(id)` for each of the label's writers, which runs `void writer.dispose()` without awaiting, and then calls `this.notified.delete(label)`.
- `ShellTranscriptWriter.dispose()` → `finish()` queues an empty xterm write; its drained callback runs `close(flush)`, which writes the cursor's unfinished row through `TranscriptRowTracker` and then `BoundedAppendFile.dispose()` ends the stream. Both can fail after `closeTab` returns: the final row can trip the 4 MiB pending-byte cap (`write` → `abandon`), and the stream can emit `'error'` on `end()` against a full or stalled disk (`abandon`). Either path fires the file's `onFailure` → the writer's `fail()` → the manager's `onFailure` callback → `reportFailure(label)`.
- That late `reportFailure` notifies for the closed tab and adds the label back to `notified` after `closeTab` already deleted it.

## Approach

- `ShellTranscriptManager` keeps a `released = new WeakSet<ShellTranscriptWriter>()`. The private `release(id)` adds the held writer to it before disposing it. `release` is used by `closeTab` and by a reinstall under a held id; a reinstalled id's new writer speaks for the tab from then on, so the old writer's late failure is equally not worth a notice.
- The `onFailure` callback built in `install` returns early when its writer is in `released`; otherwise it calls `reportFailure(label)` as before. The callback refers to the `writer` constant it is passed to, which is safe because no failure can fire during the constructor (the file opens on the first output).
- The PTY `exit` path keeps dropping the entry without calling `release`, so a writer that finishes because its shell exited still reports a failure: its tab is still open.
- `dispose()` (shutdown) is unchanged; notices raised while quitting are not this entry's concern.
- A `WeakSet` rather than a `Set` so released writers are not retained after they finish.

## Implementation steps

1. `src/shell/transcript/manager.ts`: add the `released` field, add the writer to it in `release`, and guard the `install` callback. Extend the class comment's once-per-tab paragraph by a sentence saying a writer released by its tab closing or by a reinstall reports nothing afterwards.
2. `src/shell/transcript/manager.test.ts`: the case below.

## Tests

- `src/shell/transcript/manager.test.ts` — new case "ignores a failure from a writer its closed tab released, so a later tab with that label still notifies once": install `pty-1` under `shell` and send output so its file opens; spy on `ShellTranscriptWriter.prototype.dispose` to capture the released writer and its finish promise; `closeTab('shell')` and await that promise; then run the writer's file's own abandon path (the path a stream `'error'` after `end()` takes) through the spy's recorded `this`; assert `notify` was not called. (A `BoundedAppendFile.prototype.dispose` mock that abandons from inside would need a `this`-using function, which `unicorn/no-this-outside-of-class` forbids in the test file.) Restore the spies, lock the transcript directory, install `pty-2` under `shell`, send output, and assert `notify` was called exactly once with `'shell-transcript-failed'` and `'shell'`.
- The existing "notifies a tab's failure once across its writers, and again after the tab is closed" case stays unchanged and green, proving a live writer still reports.

## Spec

The shell transcript's user-facing spec is written by subplan 08 (`product/plans/draft/shell-tab-text-transcript-08-specs-docs-and-end-to-end.md`); extend its decision-10 wording so the spec it produces states that the failure line is recorded at most once per tab and that a failure surfacing only after the tab has closed records nothing.

## Out of scope

- `ShellTranscriptWriter`, `BoundedAppendFile`, and `closeTab`'s non-awaiting disposal.
- The exit-release path and shutdown's `dispose()`.
- Reporting close-time failures anywhere else (the tab is gone, so there is nowhere meaningful to report them).
