# Test the blocked-command report and settings re-broadcast

**Complexity: 2/10** — two test files gain coverage for existing seams: the controller's blocked-command guard and notification, and the manager subscription that turns a settings publication into a state re-broadcast. No production behavior changes.

## Goal

Pin the two server-side seams that currently have no test beyond their handler mock: `ControllerCore.reportBlockedCommand` (unknown-tab guard, disabled-command notification, enabled no-op) and the `createManagers` subscription that re-broadcasts state whenever the native command settings manager publishes a new snapshot. The state event built after that publication must carry the `disabledApplicationCommands` projection.

## Approach

Add focused controller tests using a temporary project whose `.janissary/commands.json` controls `hist` availability, and a temporary home for the settings re-broadcast test so no real user file is read or written. Enable the ambient `commandDisabled` notification through a `getConfig` spy, modeled on the disabled-command cases in `src/command/manager.test.ts`. Assert the exact notification message and attribution, and assert the re-broadcast through a spy `emitState` sink plus `stateEvent().disabledApplicationCommands`.

No production file changes: the tests pin the existing behavior.

## Implementation steps

1. Add a `Controller reportBlockedCommand` describe to `src/controller.test.ts` with a helper that creates a controller against a temporary project containing a `commands.json` snapshot, seeds the root tab, and registers the controller for teardown.
2. Cover three cases: `reportBlockedCommand('hist', 'ghost')` with no open `ghost` tab throws nothing and records no notification even while `hist` is disabled and the ambient toggle is on; `reportBlockedCommand('hist', 'worker')` with a background worker tab and `hist` disabled records exactly `Command is disabled: hist.` on `worker`; the same call with `hist` enabled records nothing.
3. Add a `createManagers native command settings wiring` describe to `src/controller/create-managers.test.ts`. Stub `HOME` to a temporary home containing a `commands.json`, create a controller through `createControllerTestProject` with a spy `emitState` sink, edit `hist` to disabled, and assert the sink fired once and `stateEvent().disabledApplicationCommands` includes `hist`.
4. Update `product/specs/application-commands.md` with the client-visible consequence of a successful settings publication: the state snapshot is re-broadcast so every connected client's disabled-command list matches the server.
5. Remove the resolved backlog entry and restore the pull-request backlog skeleton when the file is empty.

## Tests

- `src/controller.test.ts`: unknown tab is a no-op; disabled `hist` on a background worker records the exact `command-disabled` notification and toast; enabled `hist` records nothing.
- `src/controller/create-managers.test.ts`: a settings `edit()` publishes, triggers the `emitState` sink, and the state event carries `disabledApplicationCommands` with `hist`.

## Out of scope

- Any production code change to the controller, settings manager, notification delivery, or state builder.
- New notification events or changes to the ambient focus and toggle rules.
- Client-side tests for the picker and shortcut interception, which already exist.
