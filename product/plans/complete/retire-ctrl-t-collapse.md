# Retire the dead Ctrl+T tool-step collapse shortcut

**Complexity: 4/10** — remove one window shortcut and an entire unused client RPC/state projection, update fixtures and documentation, and add focused coverage that Ctrl+T now reaches the focused surface.

## Goal

Ctrl+T stops being intercepted by Janissary. No visible surface renders collapsed ACP tool steps, so the key no longer sends an RPC, toggles invisible state, or prevents the chord from reaching a shell terminal or another focused surface. The connection tab keeps its own native expandable thought and tool entries.

## Background (verified)

- `web/src/useWindowKeys.ts` intercepts bare Ctrl+T in `ctrlLetterShortcut` and sends `toggleCollapse`; the only removed consumer was the response panel.
- The remaining `bufferLines` renderer is the notifications feed, whose entries are not ACP tool steps, and the agent monitor maps activity to plain output/Markdown lines. Neither passes the collapse callback anywhere but a no-op.
- `web/src/plugins/connections/ConnectionHistory.tsx` already renders thought and tool entries as native `<details>` elements, independent of `Tab.toolStepsExpanded`.
- `src/tab/view.ts` projects `flattenBuffer(tab.log, !tab.toolStepsExpanded)` and `toolStepsExpanded` onto every `TabView`, but no client reads the field.
- `src/tab/operations.ts`, `src/tab/manager.ts`, the message dispatcher, client parameter validation, and the controller adapter all carry the `toggleCollapse` action.
- `help/keys.md`, `product/specs/keyboard-navigation.md`, `product/specs/transcript.md`, `product/specs/tab-plugins.md`, and a few related specs/user pages still describe the shortcut or collapsed rendering.

## Approach

Retire the shortcut and its state rather than inventing a new collapse surface. Remove the window interception, the `toggleCollapse` RPC and its dispatch plumbing, the per-tab `toolStepsExpanded` field, and the client projection. Leave the shared transcript renderer and notifications feed in place; its collapse callbacks become inert no-ops. Update the documentation to describe the actual surfaces: shell answers are settled Markdown, connection-tab thought/tool entries expand individually, and transcripts do not collapse ACP steps.

## Implementation steps

1. Remove the Ctrl+T branch and `ctrlLetterShortcut` from `web/src/useWindowKeys.ts`, and remove the stale Ctrl+T mention from transcript tooltips.
2. Remove the `toggleCollapse` client RPC from `src/protocol/core-rpc.ts`, `src/client-message.ts`, `src/client-params/core.ts`, `src/message/handler.ts`, `src/message/tabs.ts`, and `src/controller/tab-adapter.ts`.
3. Remove `Tab.toolStepsExpanded` from `src/tab/types.ts`, the toggle from `src/tab/operations.ts` and `src/tab/manager.ts`, the wire field from `src/protocol/tab.ts`, and the collapse argument/projection from `src/tab/view.ts`.
4. Remove `onToggleCollapse` from the harness metadata intents and update test fixtures that carried the removed wire field.
5. Update `help/keys.md`, `product/specs/keyboard-navigation.md`, `product/specs/transcript.md`, `product/specs/tab-plugins.md`, and other affected specs and user documentation to match the retired behavior.

## Tests

- Update `web/src/useWindowKeys.test.ts` to assert Ctrl+T is not prevented and sends no RPC.
- Add a `src/tab/view.test.ts` case asserting ACP prompt/output lines are projected expanded and no collapse state is on the view.
- Remove the retired RPC/toggle assertions from server dispatch, operations, and controller tests; keep `src/tab/transcript/events.test.ts` coverage unchanged.
- Run `$janissary/scripts/run.mjs check-diff` after implementation and documentation changes.

## Out of scope

- Removing the shared transcript renderer's inert `collapsed` line branch or the generic `flattenBuffer` collapse helper; no production caller requests it after this change.
- Re-targeting Ctrl+T to the connection tab's details elements.
- Changing connection-tab thought/tool rendering or any ACP record data.
- Any other keyboard shortcut.
