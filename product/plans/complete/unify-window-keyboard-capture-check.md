# Unify the window keyboard-capture check

**Complexity: 6/10** — one pure selector combines existing modal, picker, and contributed-overlay state, then two window-level shortcut hooks consult it through a shared ref.

## Goal

Window-level shortcuts stop acting on the tab underneath any open overlay that owns keyboard input, including plugin-contributed overlays.

## Approach

Add `keyboardCaptured(overlays)` beside `firstOpenOverlay` in the overlay registry. It reports true when a modal is open, a core picker is open, or a contributed overlay is visible. Preserve `firstOpenOverlay`'s existing core-picker meaning. Expose the combined result from `useCmdWRefs` and share its ref with `useSectionNav`, so Cmd+W and Shift+Tab use the same capture rule. Correct the stale comment describing the core-only selector.

## Implementation steps

1. Add and unit-test the pure combined selector.
2. Wire its ref through the Cmd+W and section-navigation hooks, removing their divergent overlay checks.
3. Add contributed-overlay regression cases for both shortcut paths.
4. Update the technical-debt backlog and promote this plan to complete.

## Tests

- Unit tests cover modal, core-picker, contributed-overlay, and no-overlay states without changing `firstOpenOverlay` behavior.
- Cmd+W and Shift+Tab tests verify contributed overlays capture keyboard input.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing modal key dispatch or overlay priority.
- Changing which components register as contributed overlays.
