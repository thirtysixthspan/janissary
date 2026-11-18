# Replace the dock-cycle header's client prop with an onCycle callback

**Complexity: 3/10** — ~8 added lines in 3 production files, 4 behavioral requirements and 5 test scenarios, no new production units (p=4.45); a localized presentational-component prop change with no architecture.

## Goal

The shared dock-cycle header is a presentational component, but it currently takes a `JanusClient` plus a tab `index` and sends the `setDock` protocol call from its own button's click handler. That puts a protocol decision inside shared JSX (violating §5 — components render, they do not decide) and forces every new docked surface that wants a header to hand it the whole client. The fix must make the header a pure markup component: it takes an `onCycle(next: 'left' | 'right'): void` callback and invokes it with the next dock location, leaving the client-to-protocol wiring to the two container callers that already hold `client` and `index`. The rendered markup, the `nextDock`/`dockTooltip` helpers, and the user-visible behavior (clicking the button docks the tab to the other sidebar) stay byte-for-byte unchanged. No external `DockCycleHeader` callers exist beyond the two named below, and the same service-prop pattern in `QuestionPanel.tsx` and `ToastStack.tsx` is deliberately left for a separate entry.

## Approach

In `web/src/shared/DockCycleHeader.tsx`, drop the `JanusClient` type import and the `client` and `index` props, add an `onCycle(next: 'left' | 'right'): void` prop, and have the button's `onClick` call `onCycle(nextDock(dock))` instead of sending a protocol call. Everything else in the file — `dock`, `classPrefix`, `children`, the `nextDock`/`dockTooltip` helpers, the rendered elements and their class names — is unchanged.

In each of the two callers, `web/src/notifications/NotificationsTab.tsx` and `web/src/plugins/DockedPluginBody.tsx`, keep the existing props and pass `onCycle={(next) => client.send({ method: 'setDock', params: { index, dock: next } })}`. Both already hold `client` and `index`, so neither component's public props change. This keeps the exact `setDock` payload the header used to send.

Add a focused render test for the header's new callback seam and keep the two existing caller tests (which assert the end-to-end click → `setDock` behavior) passing.

## Implementation steps

1. In `web/src/shared/DockCycleHeader.tsx`, remove the `import type { JanusClient }` line, replace the `client` and `index` fields of `Properties` with `onCycle(next: 'left' | 'right'): void`, update the destructured parameters, and change the button's `onClick` to `onClick={() => onCycle(nextDock(dock))}`. Keep `dock`, `classPrefix`, `children`, `nextDock`, `dockTooltip`, the icon and every markup line unchanged. Run `$janissary/scripts/run.mjs check-diff` (expect the two callers to fail typecheck until the next step).
2. In `web/src/notifications/NotificationsTab.tsx`, change the `DockCycleHeader` usage to pass `onCycle={(next) => client.send({ method: 'setDock', params: { index, dock: next } })}` in place of `client` and `index`. Run `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/plugins/DockedPluginBody.tsx`, make the same replacement on its `DockCycleHeader` usage. Run `$janissary/scripts/run.mjs check-diff` — the full suite should be green again.
4. Confirm all three files stay under the 200-line `max-lines` limit (they already do by a wide margin) and that no other `DockCycleHeader` call site exists (verify with a repo-wide search before finishing).

## Tests

- `web/src/shared/DockCycleHeader.test.tsx` (new) — render `DockCycleHeader` with a `vi.fn()` `onCycle` and `dock="left"`; assert clicking the "Move to right sidebar" button calls `onCycle('right')`. Add a matching case for `dock="right"` asserting `onCycle('left')`, and a case with no `dock` asserting no dock-cycle button renders and `onCycle` is never called. Mirror the import and assertion style of `web/src/notifications/NotificationsTab.test.tsx`.
- `web/src/notifications/NotificationsTab.test.tsx` — keep the existing "when docked left … sends setDock to right" case passing unchanged; it now verifies the caller wires the new `onCycle` seam to `client.send`.
- `web/src/plugins/DockedPluginBody.test.tsx` — keep the existing "offers the host dock-cycle control above the plugin body" case passing unchanged for the same reason.

## Spec

No spec change. The dock-cycle button's user-visible behavior (shown only while docked, toggles left↔right, center reached by command) is already recorded in `product/specs/notifications.md` and `product/specs/tab-plugins.md`; this is an internal refactor that changes no observable behavior, and spec files must not describe implementation details such as a component's props.

## Out of scope

- Refactoring the identical service-prop pattern in `web/src/shared/questions/QuestionPanel.tsx` and `web/src/toasts/ToastStack.tsx` — a separate backlog entry owns those.
- Changing the `setDock` wire contract, the `nextDock`/`dockTooltip` helpers, `dockTooltip` strings, or any CSS class names.
- Changing either caller's public props, the sidebar/plugin bodies, or any key binding.
- Updates to `help/`, `documentation/user-documentation/`, or any spec: no user-visible behavior changes.
