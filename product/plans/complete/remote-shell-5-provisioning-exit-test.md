# Test remote shell provisioning exit behavior

**Complexity: 4/10** — add a focused client lifecycle test around the existing shell terminal hook and its tab-close callback.

## Goal

Pin that the SSH PTY exiting during provisioning does not close the shell tab, while the remote zsh PTY exiting after readiness does close it.

## Approach

Exercise `useShellTabTerminal` with the existing xterm and terminal-attachment fakes in `web/src/plugins/shell/useShellTerminal.test.ts`. Use the actual hook composition so the provisioning payload guard and the attached PTY's exit callback are tested together.

## Implementation

- Import `useShellTabTerminal` and the shell payload and client capability types in the existing test file.
- Render with a remote provisioning payload and a fake capability object whose `attachTerminal` records exit handlers.
- Trigger the SSH attachment's exit handler and assert `close` is not called.
- Rerender with the ready remote shell payload, trigger its PTY exit handler, and assert the tab closes after the early-exit intent completes.
- Keep the existing assertions for SSH attach selection, no provisioning color report or marker registration, and switching to the remote PTY.

## Tests

- Run `./scripts/run.mjs check-diff` and verify both exit lifecycle assertions pass.

## Out of scope

- Changes to runtime exit behavior.
- Host-side handling of an early exit when no browser is attached.
