# Split-pane agent body parity

**Complexity: 4/10** — the inactive pane already renders a dedicated agent body, but it currently omits the command line and most metadata actions. The fix fills those gaps without moving focused-only global overlays.

## Goal

Keep a command line visible in both panes when two agent tabs are selected, and show the same metadata actions for an agent whether its pane is focused or not.

## Approach

- Extend the inactive agent body with the same file navigator, new-agent, transcript, connections, schedule, and Split metadata actions as the focused body.
- Render a normal command input using the inactive tab's own history, busy state, completion endpoint, and command submission endpoint.
- Keep search, modal pickers, question dialogs, and other globally focused UI on the focused body only.
- Preserve pane-focus ordering: pointer interaction focuses the pane before a command can be submitted from it.

## Implementation steps

1. Bring `InactiveAgentTabBody` metadata and command input to parity with the focused agent body and add focused component tests.
2. Update the split-view tabs functional spec and existing public tabs guide.
3. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `web/src/InactiveAgentTabBody.test.tsx`: renders a command line; uses the tab's busy/history metadata; exposes the same agent metadata actions; sends the matching RPCs; submits commands; and invokes Split.

## Out of scope

- Moving global pickers, transcript search, or dialogs into both panes.
- Adding command bars to view tabs, harness terminals, editor tabs, or shell takeover tabs.
- Changing pane focus selection or server command routing.
- Changing the inactive pane border color.
