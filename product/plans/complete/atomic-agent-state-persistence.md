# Make agent-state persistence atomic and observable

**Complexity: 5/10** — the write path is localized to the agent-state store and `TabManager.persist`, with existing atomic-write and stderr-warning conventions available. Tests and relaunch documentation need focused updates, but no new persistence or notification architecture is required.

## Goal

Saving agent state must either replace the state file with complete valid JSON or leave its last valid contents untouched. A persistence failure must be visible without flooding the server log during frequent state updates, and a later successful save must reset warning suppression so a new failure is reported.

## Approach

Use the shared `atomicWriteFile` helper after ensuring the state directory exists. Keep persistence non-fatal, but have `TabManager` track agent names currently in a failed-save period: write one concise stderr warning for the first failure per name, suppress repeats, and clear the name after a successful save. Loading remains tolerant of state files that predate this protection or were externally corrupted.

## Implementation steps

1. Update `src/agent/state.ts` to serialize agent JSON through `atomicWriteFile` instead of overwriting the destination directly.
2. Update `src/tab/manager.ts` to report a bounded persistence warning on save failure and reset suppression after a successful save; extract the focused behavior if needed to preserve the 200-line limit.
3. Add unit coverage in `src/agent/state.test.ts` for temporary-file-plus-rename persistence and in `src/tab/manager.test.ts` for warning suppression and recovery.
4. Update `product/specs/application-state.md` and the relaunch troubleshooting section in `documentation/user-documentation/getting-started/startup.md` to describe last-valid-state retention and the server-log warning.
5. Remove the resolved backlog entry and promote this plan after all checks pass.

## Tests

- `src/agent/state.test.ts`: saving writes JSON to a temporary sibling and atomically renames it over the agent's state file.
- `src/tab/manager.test.ts`: repeated failures for one agent emit one warning, a different agent has its own warning bound, and a success allows a later failure to warn again.
- Existing load and relaunch tests continue to cover malformed-file tolerance and state restoration.

## Out of scope

- Recovering an already-corrupted historical state file with no valid predecessor.
- Changing the state schema or which tab fields persist.
- Creating or automatically opening a notifications tab for persistence failures.
- Making transcript, global-history, config, or other persistence stores part of this change.
