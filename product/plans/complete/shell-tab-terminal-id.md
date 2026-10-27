# Shell tab terminal id

## Complexity

4/10. The change adds one focused core helper, rewires three call sites and the system-shell retry path, and adds direct tests for the helper. Existing caller tests already pin the behavior that must remain unchanged.

## Goal

Make core obtain a shell tab's PTY id through one shared function that checks both the plugin host's payload guard and the shell plugin's complete payload contract.

## Approach

Add `src/shell/shell-tab-terminal.ts` to own the shell plugin id, the no-workspace launch command, and `shellTabPtyId(tab, managers)`. The helper rejects non-shell tabs, payloads the host does not accept, malformed shell payloads, and valid provisioning payloads without a terminal. Keep PTY liveness and caller-specific lifecycle rules at their current call sites.

## Implementation steps

1. Add the shell tab terminal helper and the shared shell plugin and command constants.
2. Rebuild system-shell validation and recovery on the helper, then use it in launch-shell and the tab-close adapter while preserving each caller's other checks.
3. Update the launch and tab-close test fixtures from minimal PTY-shaped objects to valid shell terminal payloads, without changing their behavior assertions.
4. Add focused helper tests for valid local terminal payloads, provisioning payloads, invalid payloads, host-guard refusal, and non-shell tabs.

## Tests

- In `src/shell/shell-tab-terminal.test.ts`, verify that a valid shell terminal yields its PTY id only when both guards accept it.
- Verify a valid provisioning payload, an invalid shell payload, host-guard refusal, and a non-shell or missing tab all yield `undefined`.
- Keep the existing launch and tab-close accept/refuse assertions, using payload fixtures that satisfy the shell plugin's full guard.
- Keep `src/system-shell.test.ts` passing unchanged.

## Spec and documentation

This is a behavior-preserving refactor. The existing shell lifecycle description remains accurate, and no help or user-documentation page needs a wording change.

## Out of scope

- Changing shell plugin payload shapes or plugin API boundaries.
- Changing PTY liveness checks, remote-shell behavior, tab-close rules, or system-shell recovery behavior.
- Adding new user-visible behavior.
