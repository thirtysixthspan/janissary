# Remove `dispatchLine` and share one command-output capture

**Complexity: 3/10** — a removal across the plugin contract's capability list, the line capabilities, `CommandManager` and the shell manifest, plus one extracted helper used by two callers whose observable behavior stays the same.

## Goal

The pull request added two dispatch capabilities for the shell tab, `dispatchLine` and `dispatchLineWithOutput`, but the shell only ever calls the second. `dispatchLine` is a public capability with no caller, a manifest entry requesting it, and a `CommandManager.dispatchLine` method nothing else reaches. Neither capability exists on master, so removing the unused one is not a breaking change to the released v1 contract and the API integer stays where it is.

Separately, `CommandManager.dispatchLineWithOutput` copies the subscribe, execute, unsubscribe capture that `CaptureManager.runCommand` already does for messaged commands. Two copies of that seam drift: a fix to one misses the other. The shell's shared module also still exports `ShellIntent`, a stale union of intent names nothing reads, and `isTerminalStatus` with its `ShellTerminalStatus` type, which have no production caller (the `terminal-status` intent takes an empty payload and the client never validates a status object).

## Approach

Extract `executeAndCapture(label, run, limitMs?)` into `src/capture/execute-and-capture.ts`. It subscribes to `entry:appended` on the transcript channel for `label`, awaits `run()` (raced against `limitMs` when one is given), unsubscribes in a `finally`, and returns the output of every entry appended to that tab while it ran, in order. Returning the list rather than a joined string lets each caller keep its own reading of it without changing behavior:

- `CommandManager.dispatchLineWithOutput` joins the list with newlines and passes its 30-second capture limit, exactly as today.
- `CaptureManager.runCommand` keeps answering with the tab's last transcript entry when anything was appended and with an empty string otherwise, with no limit. The count still comes from the append events, so a tab at its transcript cap still answers.

Rejected alternative: having the helper return the joined output for both callers. That changes what a messaged command answers when its command appends more than one entry, which is a behavior change the backlog entry did not ask for.

Remove `dispatchLine` from the capability union and set in `src/plugins/api-capabilities.ts`, the interface in `src/plugins/api.ts`, the implementation in `src/plugins/line-capabilities.ts`, `CommandManager`, and the shell manifest. Update the shell's activate comment that names it. In the developer documentation, drop its bullet, lower the capability count from twenty-seven to twenty-six in both places `src/plugins/documentation.test.ts` pins, and stop listing it in the changelog entry for the shell's additions.

## Implementation steps

1. Add `src/capture/execute-and-capture.ts` with `executeAndCapture`.
2. Use it from `CaptureManager.runCommand` in `src/capture/manager.ts` and from `CommandManager.dispatchLineWithOutput` in `src/command/manager.ts`; drop the now-unused `messageBus` import from the command manager if nothing else uses it.
3. Delete `CommandManager.dispatchLine`, the `dispatchLine` capability from `src/plugins/api.ts`, `src/plugins/api-capabilities.ts`, `src/plugins/line-capabilities.ts` and `src/plugins/shell/manifest.ts`, and reword the comment in `src/plugins/shell/activate.ts` that names it.
4. Remove `ShellIntent`, `ShellTerminalStatus` and `isTerminalStatus` from `src/plugins/shell/shared.ts`.
5. Update `documentation/developer-documentation/tab-plugins.md`: remove the `dispatchLine` bullet, change "twenty-seven" to "twenty-six" in the capability count and the changelog, and drop `dispatchLine` from the changelog line naming the shell's additions.

## Tests

- New `src/capture/execute-and-capture.test.ts`: collects every entry appended to the named tab in order; ignores entries appended to another tab; stops collecting once the run finishes (an append after it resolves is not captured); with a limit, returns what was captured so far when the run outlives it; unsubscribes even when the run rejects.
- `src/plugins/shell-capabilities.test.ts`: remove the `dispatchLine` block and its line in the declaration-gated case; retarget its routing cases onto `dispatchLineWithOutput` (no answering tab runs in the invoking tab; a closed answering tab falls back to the invoking tab), which today has only the answering-tab and disabled cases.
- Existing `src/capture/manager.test.ts` and the `CommandManager dispatchLineWithOutput` cases in `src/command/manager.test.ts` keep passing unchanged, as do `src/plugins/documentation.test.ts` and `src/plugins/dispatch-deadline.test.ts`.

## Spec

`product/specs/messaging.md`: name the shared helper as the place the append-event capture lives. `product/specs/tab-plugins.md`: say the reply `dispatchLineWithOutput` hands back is every entry the command appended to that tab, joined by newlines, collected by the same capture a messaged command's reply uses.

## Out of scope

- Honoring `Command.capture` hooks from the shell's dispatch path. The shared helper makes that a one-place change later, but it is a behavior change of its own.
- Any change to what a messaged command answers.
- Help and user documentation, which describe neither capability.
