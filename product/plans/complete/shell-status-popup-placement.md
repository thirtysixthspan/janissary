# Place shell status popups below the metadata row

**Complexity: 3/10.** The shared status panels are positioned from a parent above the shell tab, so their current top offset overlaps the shell metadata row. A small shell-header wrapper can anchor the existing panels immediately below the actual metadata height, including when that row wraps.

## Goal

The shell connections and schedule popups appear below the metadata bar without covering it.

## Approach

Group the shell metadata row and its status panels in a positioned header. Anchor the existing floating panels to the bottom of that header and preserve their current controls, timing, and stacking behavior.

## Implementation

1. Wrap the shell metadata row and status panels in a header positioning context and place the panels below it.
2. Add a regression for the rendered relationship, update the shell-tab spec, and remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation.

## Out of scope

Changing status-panel timing or placement on other tab types.
