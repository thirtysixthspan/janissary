# Focused shell terminal status hook tests

**Complexity: 2/10** — this is a test-only addition around an existing hook and test harness.

## Goal

Pin the generation-bound mount-time status request and its response lifecycle in a direct hook test, while retaining the existing `ShellTab` integration coverage.

## Approach

Render `useShellTerminalStatus` with the testing library's `renderHook` and controlled intent promises. Assert that the hook requests status for its captured PTY id, closes only for a matching echoed id with `running: false`, ignores mismatched or cancelled replies, and reports rejected intents only while mounted.

## Implementation steps

1. Add `web/src/plugins/shell/useShellTerminalStatus.test.ts` with focused hook-level cases for the request, status decisions, cancellation, and rejection lifecycle.
2. Preserve the existing `ShellTab.test.tsx` integration tests that cover close behavior and replacement-generation responses.

## Tests

- Verify the request uses `{ ptyId }` captured at mount.
- Verify a matching `{ ptyId, running: false }` reply closes with `{ terminalExited: ptyId }`.
- Verify mismatched generation and `running: true` replies do not close.
- Verify a reply from a cancelled effect does not close.
- Verify a rejected intent reports failure while mounted and is ignored after unmount.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Changes to hook or shell behavior.
- Changes to `ShellTab.test.tsx`, product specs, help, or user documentation.
