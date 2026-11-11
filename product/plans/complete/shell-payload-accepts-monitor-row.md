# Accept a monitor connection row in the shell tab payload

**Complexity: 2/10** — ~6 added lines in 1 production file, 3 requirements and 5 scenarios (p=3.94).

## Summary

Typing `monitor activity` in a shell tab starts the monitor and then disables the shell plugin with `Tab plugin "shell" disabled: produced an invalid tab payload.`, closing the tab. `monitorConnections` in `src/monitor/info.ts` gives the owning tab a `{ text: 'monitor:<name>', kind: 'acp', acpRef: { scope: 'monitor', name } }` row, and the shell's `hostState` handler merges it into the payload. The shell's re-declared `ShellAcpRef` union and its `isAcpRef` guard in `src/plugins/shell/shared.ts` admit only the `tab` and `editor` scopes, so `isShellPayload` refuses the merged payload and `validateTabValue` disables the plugin through `updateTab`.

## Goal

A shell tab that starts a monitor keeps running, with the monitor's row shown in its connections window as a plain row.

## Approach

Bring the shell's re-declared reference back in line with the protocol's `AcpRef`, which already has a `{ scope: 'monitor'; name: string }` member. Add that member to `ShellAcpRef` and accept it in `isAcpRef`, requiring a string `name` and nothing else. The tab and editor members keep requiring their `label`, so the guard's label check moves inside those branches.

The backlog proposal also asked for a monitor row to open the monitor view when clicked. That is not done here. The shared `StatusPanels` (`rowCanOpen`), the plugin `openConnection` capability, the harness and editor row openers, and the `openConnectionRecord` RPC all treat monitor and editor rows as snapshot-only on purpose, and `product/specs/shell-tab.md` and `product/specs/tab-plugins.md` already state that a monitor row stays a plain row. Making it openable would be a host-wide behavior change, not a fix to this crash.

## Implementation steps

1. In `src/plugins/shell/shared.ts`, add `{ scope: 'monitor'; name: string }` to `ShellAcpRef` and teach `isAcpRef` to accept it, keeping the label requirement on the tab and editor scopes.
2. Extend `src/plugins/shell/shared.test.ts` so the protocol-pinning cases include a monitor row and a monitor `AcpRef`, and refuse a monitor reference without a string `name`.
3. Add a `src/plugins/shell/activate.test.ts` case where `hostState` merges a monitor row and the updated payload passes `isShellPayload`.
4. Add a `web/src/plugins/shell/ShellTabMeta.test.tsx` case showing a monitor row renders as a plain, non-button row that never calls `openConnection`.
5. Update `product/specs/shell-tab.md` to say a monitor started from the shell adds its row and the shell tab stays open.

## Tests

- `isShellPayload` accepts a payload whose connections carry a `{ scope: 'monitor', name }` row, as part of "every ConnectionView the protocol admits".
- The `AcpRef` pinning test includes the monitor member and refuses `{ scope: 'monitor' }` and `{ scope: 'monitor', name: 7 }`.
- `hostState` merging a `monitor:activity` row produces one update whose payload passes the shell's own guard.
- The rendered connections window shows the monitor row with no button role, and clicking it does not call `openConnection`.
- Run `$janissary/scripts/run.mjs check-diff` after each step.

## Spec and documentation impact

- `product/specs/shell-tab.md`: a monitor started from the shell adds its `monitor:<name>` row to the connections window, and the shell tab stays open and usable.
- No help page or user documentation describes the shell's payload validation, so none changes.

## Out of scope

- Making monitor or editor rows openable from any connections window.
- Changing the `openConnectionRecord` RPC, the plugin `openConnection` capability, or the shared `StatusPanels`.
- Bumping `SHELL_PAYLOAD_SCHEMA_VERSION`: the guard only widens to a shape the host already sends.
- Updating the pull request description.
