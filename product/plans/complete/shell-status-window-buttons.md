# Put the connections and schedule buttons on the shell tab's row

**Complexity: 3/10** — publish four already-existing surfaces and add the two controls, then extract the row so the body file stays inside the file-size limit.

**Goal.** Make the two status windows the shell tab renders reachable. The host pushes connection and schedule rows into the payload on every change and the row renders panels for them, but with no control to open either window the rows were computed, shipped and drawn nowhere — a browser run counted `.shell-tab .tab-connections` and found none.

**Approach.** Publish what `AgentTabMeta` already uses rather than inventing a second button. `StatusWindowButton` and `statusButton` are the host's own pair, and `connectionsWindowIcon`/`scheduleWindowIcon` join the icon already published for the workspace flag.

## Implementation

1. In `web/src/plugins/api.ts`, publish `StatusWindowButton`, `statusButton` and its props type, and the two window icons.
2. Move the row out of `ShellTab.tsx` into `web/src/plugins/shell/ShellTabMeta.tsx`, adding both buttons there. The move is forced rather than cosmetic: the body file passes 200 lines once the buttons are added, and the row is the larger half of it, so this is the seam with the clean boundary.
3. Each button takes its `hasContent` from the matching row list in the payload and its handlers from the window `ShellTabMeta` already holds — the same pairing the agent row uses.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`: the row carries both window controls; the connections button offers its window when the tab has a connection and says so when it does not. `web/src/plugins/shell/ShellTab.test.tsx`'s existing row assertions and the `StatusPanels` cases are untouched.

## Out of scope

- A new icon or button design. The host's own is published rather than redrawn, which is the point of the surface.
- The capability counts. These are published components rather than members of the client capability object, so the documented client count is unchanged.
- The file-navigator button's separate failure, recorded as its own entry and not established.