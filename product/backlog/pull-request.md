<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Widen the Hosts row action column so both the edit and delete controls are visible.

Existing Issue: The row grid allots a fixed 24px to the action slot while the new pencil and trash buttons need roughly 44px together and the shared row-span overflow rule clips anything past the track, so the delete control is cut off in a real browser even though the DOM tests find it. Severity: 7/10

Existing Risk: 6/10 - Users see only the edit pencil, so the promised row-level delete and its confirmation flow are effectively unreachable from the table and the documentation advertises a control the layout hides.

Proposal Risk: 2/10 - Widening the fixed track and keeping the overflow rule off the action cell is a layout-only change that leaves the edit and delete intents untouched, and a misalignment would show up immediately as the header's fifth column drifting away from the row buttons.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "widen the Hosts row action column so both edit and delete controls are visible". In web/src/plugins/hosts/hosts.css, the `.host-columns, .host-row` grid template ends in a fixed 24px track that originally held the empty placeholder span; with two icon buttons in web/src/plugins/hosts/HostRowActions.tsx (each about 21px wide plus a 2px gap) that track is too narrow. Give the last track enough width for both buttons, for example `4em` in line with how web/src/plugins/sessions/sessions.css sizes its own action column, and keep the header's fifth column on the same template so the labels stay aligned. Also stop the `.host-row > span { overflow: hidden; text-overflow: ellipsis; }` rule from clipping the actions cell, either by narrowing that selector to the four text cells or by restoring `overflow: visible` on `.host-row-actions`. Because jsdom does not lay out CSS, the existing HostList tests query the buttons by accessible name and pass even when they are clipped, so verify the rendered result in a scratch app at normal and narrow widths: both pencil and trash must be fully visible, keyboard-activatable, and each must leave the row selection unchanged.
