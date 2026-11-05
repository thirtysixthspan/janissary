# Connections list rows styled and driven like the sessions list

Issue: in the connections tab, follow the row styling and keyboard interactions of the sessions tab.

Complexity rating: 4/10

## Goal

The connections list already has the sessions table's columns, heading row, and metadata bar, but its rows still carry the conversations list's look: inset rounded cards with 8px padding, a coloured accent stripe on the selected row, the same soft background for hover and selection, centred cell alignment, and a scrolling region that starts below the header. Every row also reads the same whatever its status, and a docked list squeezes the six-column grid into the sidebar. Make the rows look and behave the way the sessions list's rows do, centred and docked, and pin the keyboard and pointer gestures the two lists share so they stay the same.

## Approach

`web/src/plugins/sessions/sessions.css`, `SessionList.tsx`, and `SessionRowBody.tsx` are the model.

Row styling, centred:

- The list itself scrolls as one flex column with no focus ring (`.session-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; outline: none; }`), and the rows container is a plain flex column with no inset padding. `.connections-list` and `.connections-rows` take the same rules.
- Heading row and rows share the grid with `gap: 12px; align-items: baseline; padding: 0 12px; color: var(--muted); font-size: 12px; text-align: left`. A row then overrides to `width: 100%; padding: 4px 12px; white-space: nowrap; cursor: pointer; color: var(--fg)`. The connections grid keeps its own track widths, which the earlier columns run chose for its columns and its one-button actions cell.
- Rows are full-bleed: no border radius and no accent stripe. Hover is `background: var(--border)` and the selected row is `background: var(--bg-soft)`, so hover and selection read differently.
- The empty message takes the sessions list's `padding: 8px 12px`.
- Cells that repeated `font-size: 12px` drop it, since the grid sets it. Host, Tab, and Connection State stay muted, Last activity stays faint, and the actions cell gets `flex-shrink: 0`.

State styling: the sessions row carries `data-state` and the stylesheet makes a row that is parked or over read differently from one that is working. The connections row gains `data-status` with its status, and the stylesheet uses the same split. `Idle` is a session open between prompts, waiting the way a detached session waits, so its status cell takes `var(--accent)`, as the sessions detached state does. `Closed`, `Completed`, `Failed`, and `Terminated` are over, so the whole row reads `var(--muted)`, as a terminated session row does. `Open` and `Running` are working and keep the default treatment. The connection plug glyph is not added: `ConnectionPlug` describes a remote session's state, and none of these statuses is one.

Docked rendering: the sessions list picks a two-line rendering whenever `capabilities.dock !== null` and keeps the table in the centre, however narrow that pane is. It hides the heading row, adds `session-list-narrow` to the list, and gives each row a primary line (name and actions) and a secondary line (state, host, activity) with wrapping between whole fields and an ellipsis on overlong ones. The connections list follows suit. Its primary line holds the Connection Name and the actions. Its secondary line holds the Connection State, Host, Tab, and Last activity, in table order. The kind stays in the row tooltip. The narrow CSS block mirrors the sessions one rule for rule, scoped to `.connections-list-narrow`. It drops the joined-row rules, because connections rows don't join.

To keep `ConnectionList.tsx` under the size limit and match the sessions layout, the row cells move into a new `ConnectionRowBody.tsx` that exports `WideConnectionRow` and `NarrowConnectionRow`, as `SessionRowBody.tsx` does.

Keyboard and pointer interactions already match the sessions list: Up, Down, Home, and End move the selection without wrapping through the shared `nextListSelection` rule, Enter opens the selected row, a row opens on a second click on the same row, and the list takes focus whenever its tab becomes active. Those stay as they are. Two details stay deliberately different from sessions, because earlier work on this branch made them load-bearing. Key events from the row's Close or Delete control and from the confirmation dialog are ignored, so Enter there never opens the row. And a click confirmation is keyed by row identity and order rather than by index, so a reorder can't open a different row. The docked list must keep every gesture, and the tests below pin that.

## Implementation steps

1. Add `web/src/plugins/connections/ConnectionRowBody.tsx` with `WideConnectionRow` (the existing six cells in order) and `NarrowConnectionRow` (primary and secondary lines), both taking the row, its title, its activity, and the close and delete handlers.
2. `web/src/plugins/connections/ConnectionList.tsx`: choose the rendering from `capabilities.dock`, add `connections-list-narrow` to the list when docked, hide the heading row when docked, add `data-status` to each row, and render the chosen row body.
3. `web/src/plugins/connections/connections.css`: replace the list, rows-container, heading, row, hover, and selected rules with the sessions treatment; add the status rules and the `.connections-list-narrow` block.

## Tests

- `web/src/plugins/connections/connections-style.test.ts`: the list scrolls as one flex column without a focus ring; the rows container has no inset padding; heading and rows share a grid with baseline alignment, 12px horizontal padding, and 12px text; rows have `padding: 4px 12px`, no border radius, and no accent stripe; hover uses `var(--border)` and selection `var(--bg-soft)`; `Idle` colours the status cell with the accent and each ended status mutes the row; every narrow selector is scoped to `.connections-list-narrow`, and the narrow block overrides the grid, wraps between whole secondary fields with an ellipsis, and gives the name a shrinkable single line beside the actions.
- `web/src/plugins/connections/ConnectionList.test.tsx`: each row carries its status in `data-status`; docked in either sidebar the list gets `connections-list-narrow`, shows no heading row, and renders each row as a primary line (name, actions) and a secondary line (state, host, tab, activity); returning to the centre restores the heading row and the six cells; docked, Up, Down, Home, End, and Enter move and open rows, a second click opens a row, and Close still acts on its own row without opening it.

## Out of scope

- Re-reading the list when its tab becomes active again, which the sessions list does. The connections topic already pushes every change, the previous entry left it out for that reason, and it is a data concern rather than a keyboard one.
- The connection plug glyph in the state cell, as explained above.
- Keys the sessions list doesn't have either, such as Space to open a row or Delete to close one.
- The connection (record) tab, which has no rows.

## Specs and docs

- `product/specs/connections-tab.md`: describe the row styling, the status treatment, and the docked two-line rendering, and that keyboard and pointer gestures are the same docked.
- `documentation/user-documentation/command-bar/connections.md`: it calls the tab a table laid out like the sessions tab, so add that a docked list stacks each row onto two lines the way the sessions list does.
- `help/connections.md` and `help/keys.md`: checked; neither describes the list's row layout and no key binding changes.
