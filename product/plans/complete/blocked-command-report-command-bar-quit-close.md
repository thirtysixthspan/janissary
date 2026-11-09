# Cover command-bar quit and close reports in the blocked-command RPC spec

Complexity 2/10 — a single-sentence spec correction with no code or behavior change and no PR description edit.

`product/specs/websocket-rpc.md`'s "Blocked-command reports" section opens by saying `reportBlockedCommand` reports "a keyboard shortcut the client blocked because its command appeared disabled in the client's last state snapshot". The RPC is also used for a command-bar `quit` or `close` line the client consumes because its command appeared disabled in that same snapshot: `useAppCommandLine` in `web/src/shared/command-bar/AppCommandBar.tsx` passes the line to `consumeBlockedCommand`, which reports the canonical word, and `src/controller.ts`'s `reportBlockedCommand` ignores an unknown tab and otherwise re-resolves the text and refuses it. The rest of the spec section already describes that request, validation, unknown-tab no-op, server re-resolution, acknowledgement, and no-dispatch behavior correctly, so only the caller description needs to widen.

## Goal

The spec's opening sentence names both callers — a blocked keyboard shortcut and a consumed command-bar `quit` or `close` line — while the section's request example, field validation, unknown-tab no-op, server re-resolution, acknowledgement, and no-dispatch guarantee stay exactly as written. The notification rules for a consumed quit/close line are not restated; the sentence cross-references `[[application-commands]]`, which already specifies that handling.

## Approach

In `product/specs/websocket-rpc.md`, replace the opening sentence of "Blocked-command reports" with one that reports "a keyboard shortcut, or a command-bar `quit` or `close` line, that the client blocked because its command appeared disabled in the client's last state snapshot", then point to `[[application-commands]]` for the disabled quit/close handling. Keep the JSON request example and the paragraph after it byte-for-byte unchanged.

## Implementation steps

1. Edit the one opening sentence in `product/specs/websocket-rpc.md`.
2. Confirm the example, validation, unknown-tab no-op, re-resolution, acknowledgement, and no-dispatch text is untouched.
3. Run `$janissary/scripts/run.mjs check-diff` (spec-only change; expected to have nothing scoped to lint or test).

## Tests

None — no code changed. The existing `src/message/handler.test.ts` and `src/client-params/core.test.ts` cases already cover the envelope and params validation, and `web/src/shared/command-bar/AppCommandBar.test.tsx` covers the client reporting `quit` and `close`.

## Out of scope

- Any code or test change — the behavior is already implemented and covered.
- `product/specs/application-commands.md`'s disabled quit/close paragraph, which is referenced rather than restated.
- The pull request's title and body — neither needs a correction for this entry.
