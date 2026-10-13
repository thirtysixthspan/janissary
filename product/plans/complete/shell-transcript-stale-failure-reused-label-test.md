# Shell transcript manager: pin the failure guard's identity check with a reused-label test

**Complexity: 1/10** — one new case in `src/shell/transcript/manager.test.ts`; no production code changes.

## Goal

Pin the identity comparison in `ShellTranscriptManager.install`'s failure callback (`this.tabs.get(label) === state`), which is what makes a later tab reusing a closed tab's label start with fresh failure state. Today both late-failure cases fire the stale failure while no tab holds the label, so a guard reduced to a presence check (`this.tabs.has(label)`) would pass every test while letting an old writer's late failure notify for, and mark as notified, the new tab that reused its label.

## Problem (verified against the code)

- `closeTab(label)` deletes the label's `TabFailureState`; the next `install` under that label creates a new one via `tabState`.
- The callback reports only when the writer is not released and the captured state is still the label's current state.
- "ignores a late failure from a writer whose PTY exited before its tab closed, so a later tab with that label still notifies once" abandons the old file before `pty-2` is installed, so at the moment of the stale failure `this.tabs.has('shell')` is false and a presence check drops it just as the identity check does.
- "ignores a failure from a writer its closed tab released, ..." is guarded by the `released` `WeakSet` first, so it cannot pin the identity check at all.

## Approach

Add a case where the stale failure arrives after a same-labelled tab has opened, using the exited-writer path (not released, so only the identity check can drop it). Then force a genuine failure for the new tab and assert exactly one notice, proving the stale failure neither notified nor set the new tab's `notified` flag.

The mirror case for the released-writer path is not added: the `released` set alone drops that failure, so it adds no coverage of the identity check.

## Implementation steps

1. `src/shell/transcript/manager.test.ts`: add the case below beside the exited-before-close late-failure case.
2. Verify by temporarily changing the guard in `ShellTranscriptManager.install` to `this.tabs.has(label)`, confirming the new case fails, then restoring the identity check and confirming it passes.

## Tests

- New case "ignores a closed tab's late failure that arrives after a new tab reused its label, so the new tab still notifies once": install `pty-1` under `shell`, send output, spy on `ShellTranscriptWriter.prototype.dispose` and `BoundedAppendFile.prototype.dispose`, emit `exit` for `pty-1`, `closeTab('shell')`, wait for and await the recorded file dispose promise, assert the writer's own `dispose` was not called; install `pty-2` under `shell` and send it output so the new tab's state exists and its file opens; only then abandon the old writer's file (the first recorded `this`) and assert `notify` was not called. Lock the transcript directory, install `pty-3` under `shell` (a second writer of the same open tab), send it output, and assert `notify` was called exactly once with `'shell-transcript-failed'` and `'shell'`.
- Existing cases "notifies a tab's failure once across its writers, and again after the tab is closed", "notifies a failure from a writer whose PTY exited while its tab is still open" and both late-failure cases keep passing unchanged.

## Spec

Test-only change pinning existing behaviour; no spec text changes.

## Out of scope

- `src/shell/transcript/manager.ts` and every other production file.
- A mirror case for the released-writer path.
