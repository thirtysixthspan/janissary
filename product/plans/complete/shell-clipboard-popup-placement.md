# Keep clipboard history above the shell command bar

**Complexity: 2/10.** The shell tab already gives its own history popup enough bottom clearance to sit above the command bar. The contributed clipboard popup uses the same shared `.picker` placement but lacks that shell-specific offset.

## Goal

The clipboard-history popup stays above the shell command bar and leaves the command bar visible.

## Approach

Apply the shell history popup's existing bottom offset and height cap to the clipboard-history popup. Keep focus, selection, and paste behavior unchanged.

## Implementation

1. Add the matching placement rule for the clipboard-history popup in shell tabs.
2. Add a regression for the shell-specific popup placement, update the clipboard-history spec, and remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation.

## Out of scope

Changing clipboard-history behavior on other tab types.
