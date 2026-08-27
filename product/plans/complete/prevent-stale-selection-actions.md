# Prevent stale file-selection actions

**Complexity: 4/10** — the fix is localized to one hook and its menu integration, with focused asynchronous race coverage.

## Goal

Only the selection-action reply for the currently open file-navigator context menu may add an entry. Closing the menu or opening another menu must invalidate any older pending reply.

## Approach

Track a monotonically increasing request generation inside `useSelectionAction`. Each query captures its generation and installs its reply only while still current. Expose a clear operation that advances the generation and removes the current entry, then call it whenever the context menu closes.

## Implementation steps

1. Add generation-based reply validation and an explicit clear operation to `web/src/useSelectionAction.ts`.
2. Route file-navigator menu dismissal through the selection-action clear operation before closing the menu.
3. Add focused hook tests for out-of-order replies and dismissal while a reply is pending.
4. Clarify the context-menu behavior in `product/specs/file-navigator-tab.md`.

## Tests

- Resolve two selection queries out of order and verify only the newest reply appears.
- Clear the selection action while its query is pending and verify the late reply is ignored.
- Run `./scripts/run.mjs check-diff` after each code, test, spec, and backlog change.

## Out of scope

- Cancelling the underlying RPC on the server or transport.
- Changing plugin selection-action eligibility or execution semantics.
- Changing other context-menu entries or selection behavior.
