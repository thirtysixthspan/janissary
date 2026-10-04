# Match the shell command bar dot to its tab

**Complexity: 3/10.** The tab already owns its dot color; pass it through the existing plugin capability.

## Goal

Show the same color in the shell command bar dot and the shell tab's dot.

## Approach

Pass the tab's existing color from the host to the plugin client capability and use it in the shell command bar.

## Implementation

1. Add optional `dotColor` to the plugin client capability and pass the `TabView` color through `PluginBody`.
2. Use that value for the shell command bar and add a rendering regression.
3. Update the shell spec and remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation and tests.

## Out of scope

Changing tab color generation or other plugin command bars.
