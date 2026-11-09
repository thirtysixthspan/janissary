# Report a blocked shortcut once per key press

**Complexity: 2/10** — one guard in one function and one test case; no contract or wire change.

`handleChordKeys` in `web/src/useWindowKeys.ts` sends `reportBlockedCommand` on every keydown of a chord whose command is disabled. Holding the key fires auto-repeat keydowns (`KeyboardEvent.repeat === true`), so one RPC and one `command-disabled` notification are produced per repeat.

## Goal

A held blocked shortcut is reported once, on the initial keydown. Every keydown, repeated or not, is still prevented and consumed.

## Approach

1. In `handleChordKeys`, keep `e.preventDefault()` and `return true` for every keydown of a blocked chord, and send `reportBlockedCommand` only when `e.repeat` is false.

## Tests

- `web/src/useWindowKeys.test.ts`, beside the blocked-shortcut cases: a repeated keydown of a blocked chord is default-prevented and sends no extra report, while the initial keydown sends exactly one.

## Specs

- `product/specs/keyboard-navigation.md` and `product/specs/notifications.md`: a held blocked shortcut is reported once per key press.

## Out of scope

- Server-side de-duplication of `command-disabled` notifications.
- Any change to the report payload or to non-blocked chord handling.
