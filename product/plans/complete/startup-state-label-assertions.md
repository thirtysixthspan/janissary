# Startup state label-based assertions

**Complexity: 2/10** — The behavior is already correct; tighten the existing WebSocket assertions so they express the tab identity contract without relying on array positions or order.

## Goal

Keep the startup-state test passing when notifications add tabs before `janus`, while asserting that `janus` is visible and active and the managed `system` tab is hidden.

## Approach

Find `janus` by label in startup states and compare its index with `activeTab`. Assert the managed system tab by label and its `hidden` and `systemShell` flags, without requiring an exact tab list or order. Locate `janus` by label for the subsequent Markdown assertion as well.

Timeout diagnostics will contain event types, only a status for RPC replies, and state summaries limited to `label`, `hidden`, `systemShell`, and `activeTab`. They will never include RPC reply identifiers or results.

## Implementation steps

1. Update the existing token-gated WebSocket test to wait for and assert the startup contract by tab label, and locate `janus` by label when checking the help output.
2. Restrict timeout diagnostics to the approved event, reply-status, and state-summary fields.
3. Clarify the existing startup focus and hidden system-shell contract in `product/specs/tabs.md`.

## Tests

- Run the focused startup WebSocket test in `src/index.test.ts`.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

Do not change production startup behavior, WebSocket authentication, timeout values, tab ordering, or system-shell visibility and focus behavior.
