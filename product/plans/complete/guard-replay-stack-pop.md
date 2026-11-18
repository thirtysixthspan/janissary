# Guard the replay stack pop so a partial success cannot drop the wrong history step

**Complexity: 2/10** — ~2 added production lines in 1 file, 3 behavioral requirements and 3 test scenarios, no new production units (p=3.60); a single guarded condition inside the shared replay protocol.

## Goal

When a file-navigator undo or redo replays a history step and at least one item succeeds, `applyReplayProtocol` always pops the source history stack and pushes rebuilt steps onto both stacks. It never checks that the stack's top is still the step that is being replayed. If another action changes that stack while the replay is running, the pop removes the wrong entry and the rebuilt history no longer matches the files, so a later undo or redo restores the wrong set of changes. The pop and its paired pushes must happen only while the top of the source stack is still the step captured when the replay began. No command, flag, key binding, or user-facing message changes.

## Approach

`src/file-navigator/replay-protocol.ts` owns `applyReplayProtocol`, the shared protocol used by both `applyStackMove` and `applyStackPaste`. At the top of the function, capture `options.fromStack.at(-1)` as the step being replayed. The existing success block (`successful.size > 0`) currently pops and pushes unconditionally. Add two conditions to that block: the captured step must be defined (an empty source stack has nothing to pop) and the source stack's current top must still be that same step object. The pop, the remaining-step push, the `toStack` push, and the `rebuild` call all stay together inside the single guarded branch, so a stack that changed mid-replay is left entirely untouched.

The guard needs no new parameter and no call-site change in `src/file-navigator/moves.ts`: the step being replayed is the array's own top at entry, captured by identity, which is exactly the object `src/file-navigator/manager/history.ts` passes in as `group`. Keeping the capture inside the protocol avoids breaking callers that supply a structurally equal but distinct step object on a later replay (for example, undo followed by redo in `moves.test.ts`).

## Implementation steps

1. In `src/file-navigator/replay-protocol.ts`, capture `const replayedStep = options.fromStack.at(-1);` at the top of `applyReplayProtocol`, before the conflict-preflight early returns. Run `$janissary/scripts/run.mjs check-diff`.
2. In the same function, extend the `if (successful.size > 0)` block's condition so the pop and its pushes run only when `replayedStep !== undefined` and `options.fromStack.at(-1) === replayedStep`. Leave the body of the block unchanged. Run `$janissary/scripts/run.mjs check-diff`.
3. Confirm `src/file-navigator/replay-protocol.ts` stays under the 200-line limit (it is ~80 lines); no extraction needed. Run `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- Add `src/file-navigator/replay-protocol.test.ts` with focused cases driving `applyReplayProtocol` directly:
  - A successful replay whose `apply` callback leaves the source stack alone still pops that stack, pushes the rebuilt steps to the destination stack, and calls `rebuild` — the guarded branch runs on the normal path.
  - A successful replay whose `apply` callback replaces the source stack's top with a different step leaves both stacks unchanged and does not call `rebuild` — the mismatch case keeps the stack untouched.
  - A successful replay with an empty source stack leaves the destination stack unchanged and does not call `rebuild`.
- Keep every existing case in `src/file-navigator/moves.test.ts` green without changes, including the undo-then-redo case that reuses a structurally equal step object.

## Spec

Update `product/specs/file-navigator-tab.md` in the "Undoing and redoing a move" subsection: a replay advances the history stacks only while the step it is replaying is still the most recent entry on the source stack; if that stack changed while the replay ran, the files still move but neither history stack is changed, so a later undo or redo cannot apply to a mismatched step.

## Out of scope

- Changing `src/file-navigator/moves.ts`, `src/file-navigator/manager/history.ts`, or their public signatures.
- Changing how success and failure items are keyed by object identity, or the conflict preflight and refusal messages.
- Any command, flag, key binding, help page, or public documentation change.
