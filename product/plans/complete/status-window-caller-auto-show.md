# Status-window auto-show for agent, editor and harness tabs

**Complexity: 3/10** — four callers pass the visibility and content inputs the shared hook already accepts, and the hook stops reporting a window visible while its tab is inactive.

## Goal

Restore the connections and schedule windows' auto-show behavior that agent, editor and harness tabs had before the shell-tab branch changed `useStatusWindows`:

- An agent or editor tab whose window was empty auto-shows it again when the window gains its first row, as it did before.
- A harness tab that is not the current tab never auto-shows its windows, so a harness visible in the other split pane does not pop its schedule panel for five seconds each time the other pane's tab changes.
- A harness tab that is not the current tab shows no status window at all, including one pinned while it was current.

## Approach

`useStatusWindows(activeKey, options)` in `web/src/shared/status-windows/useStatusWindows.ts` takes `{ active, connectionsHaveContent, scheduleHasContent }`, defaulting to `true`, `false` and `false`. Only the shell plugin's `ShellTabMeta` passes them. The other four callers pass nothing, so the hook never sees a window gain content, and every mounted `HarnessTabLayer` (keyed on `current.label`) treats itself as active and arms its auto-show whenever the current tab changes.

Each caller passes its own inputs, reproducing what it passed before the change:

- `AgentTabBody` and `InactiveAgentTabBody`: content from the tab's `connections.length > 0` and `schedule.length > 0`; `active` keeps its default, since each body is only mounted while its tab is shown.
- `useEditorConnections`: connections content from `tab.connections.length > 0`; the editor has no schedule window.
- `HarnessTabLayer`: `active: t.label === current.label`, connections content only when the tab is not schedule-only, schedule content when it has rows. The key stays `current.label`.

Before the change, a harness tab that was not current reported no content and so was never visible, even if its window had been pinned. The hook now hides such a window through `active` alone, by reporting `visible` only while `active` is true. No other caller changes: agent and editor bodies are always active, and a shell tab is inactive only when it is hidden, where nothing it renders can be seen anyway.

`StatusPanels` already refuses to draw a window with no rows, and `StatusWindowButton` is inert without content, so an empty window stays hidden without the hook's old `hasContent` gate on `visible`. The hook's comment saying it takes no content argument is stale and is corrected.

## Implementation steps

1. In `web/src/shared/status-windows/useStatusWindows.ts`, report `visible` only when `active` is true, and rewrite the `useStatusWindows` comment to describe the `active` and content options.
2. In `web/src/agent-tabs/AgentTabBody.tsx` and `web/src/agent-tabs/InactiveAgentTabBody.tsx`, pass `{ connectionsHaveContent, scheduleHasContent }` from the tab's rows.
3. In `web/src/editor/useEditorConnections.ts`, pass `{ connectionsHaveContent: tab.connections.length > 0 }`.
4. In `web/src/harness/HarnessTabLayer.tsx`, pass `{ active: isActive, connectionsHaveContent: !scheduleOnly && t.connections.length > 0, scheduleHasContent: t.schedule.length > 0 }`.
5. Update `product/specs/connection.md` and `product/specs/scheduling.md` to state that a window also auto-shows when it gains its first row on the active tab, and that a harness tab that is not the active tab shows neither window.

## Tests

- `web/src/shared/status-windows/useStatusWindows.test.ts`: a window pinned while active is not visible after `active` turns false.
- `web/src/harness/HarnessTabLayer.test.tsx` (new, with `HarnessTab` mocked as in `MountedViewLayers.test.tsx`): a harness tab with schedule rows that is not the current tab shows no schedule panel when the current tab changes; the current harness tab auto-shows its schedule panel.
- `web/src/agent-tabs/InactiveAgentTabBody.test.tsx`: after the initial auto-show fades, a tab gaining its first connection shows the connections panel again.
- The existing `useStatusWindows`, `StatusPanels`, `ShellTab` and `InactiveAgentTabBody` tests keep passing.

## Out of scope

- Clearing a window's pin when its rows drop to zero or when a harness tab stops being current; before the change both reset the pin, and now a pin survives both. A pinned harness window is still hidden while its tab is not current.
- Changing the shell tab's own status-window inputs.
- Changing the user documentation, which describes the activation auto-show this fix keeps.
