# Persist only agent tabs, decided at the single save path

Backlog: technical debt — "Decide once, at the single agent-state save path, that only agent tabs are persisted, instead of leaving each of a dozen save call sites to remember the rule."

Complexity rating: 4/10

## Goal

`product/specs/application-state.md` says only agent tabs are written to the state directory and restored on `--relaunch`. Today that rule is enforced by individual callers: `reorderTabToOp` checks `!tab.view`, `ScheduleManager` checks `view !== 'harness'` three times (so editor and plugin tabs pass), and `reorderTabOp`, `renameTabOp`, the editor retarget, the editor file rename and the `entry:appended` listener persist whatever tab they are handed. A reorder, rename, retarget, scheduled tick or appended entry on an editor, plugin or harness tab therefore writes a state file that `--relaunch` turns into an empty agent tab.

Move the rule into the one function every write passes through, so no caller can forget it.

## Approach

`persistAgentState` in `src/tab/manager-persistence.ts` is called by `TabManager.persist` for every write. It already looks at the live tab list to lift the closed-tab refusal. Have it find the live tab named by `state.name` and return without saving when that tab carries a `view` other than `'agent'`. An agent tab (no `view`, or `'agent'`) keeps today's path: lift the closed refusal and save. A state with no live tab keeps today's path too, so `AgentStatePersistence.save` still applies its closed-tab and remote refusals.

With the rule at the save path, the caller-side checks are redundant and are deleted: the `!tab.view` guard in `reorderTabToOp` and the three `view !== 'harness'` guards in `ScheduleManager` (`cancel`, `clearAll`, `tick`).

## Implementation steps

1. `src/tab/manager-persistence.ts`: look up the live tab once; return early for a non-agent view; reopen only when a live tab exists; update the header comment to describe the agent-only rule.
2. `src/tab/navigation-commands.ts`: drop the `!tab.view` guard in `reorderTabToOp`.
3. `src/schedule/manager.ts`: drop the three `view !== 'harness'` guards and the "harness tabs excepted" note on `tick`.
4. `src/schedule/manager.test.ts`: rewrite the harness cancel and clearAll cases to run through a real `TabManager.persist` and assert that `saveAgentState` is never called, instead of asserting on a mocked `persist`.

## Tests

- `src/tab/manager.test.ts`: persisting the state of a live editor, plugin or harness tab writes nothing; persisting a live agent tab (no `view`, and `view: 'agent'`) still writes.
- `src/schedule/manager.test.ts`: cancel and clearAll on a harness tab reach the real `TabManager.persist` and write nothing.
- Existing `src/controller.test.ts` (reorder does not persist view tabs; image tab not persisted), `src/tab/cleanup.test.ts` and the rest of `src/tab/manager.test.ts` keep passing.

## Out of scope

- Adding `view` to `AgentState`, so that state files written by an older build before this fix no longer rehydrate as ghost agent tabs.
- The remote refusal in `AgentStatePersistence.save`, which stays where it is.

## Specs and docs

- `product/specs/application-state.md`: names harness and plugin tabs alongside the view tabs that are never saved, and states that no kind of change to a non-agent tab writes a state file.
- `help.md` and `documentation/user-documentation/`: `getting-started/startup.md` already says view and harness tabs do not come back on `--relaunch`; no edit.
