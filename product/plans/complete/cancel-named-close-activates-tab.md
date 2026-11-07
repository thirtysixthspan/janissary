# Activate a dirty tab when cancelling a named close

## Complexity

4/10. The change is contained to the existing close guard and its tests. The main detail is ordering tab activation and editor focus when a named close targets an inactive tab.

## Goal

Cancelling a save dialog opened by `close <name>` leaves the target tab current, open, and dirty, with focus returned to its editor. Cancelling the same dialog from the target tab's × continues to leave that already-current tab open and focused.

## Approach

`CloseSaveGuard` already retains the requested tab label and can focus its dirty handle, but it does not activate an inactive target before doing so. Reuse the app's existing tab reveal path: select a docked target through `revealDocked`, or send `focusTab` for a center tab, then focus the handle once the target is visible. Keep the change in the close mode so quit-walk behavior and per-tab Save and Don't Save paths stay as they are.

## Implementation steps

1. Update the close-mode Cancel handler to reveal or activate the requested tab before restoring focus to its dirty handle. Ensure the focus occurs after an inactive center tab becomes visible.
2. Extend `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` to cover a named close issued from the shell: Cancel activates the target editor and focuses its handle. Keep coverage that cancelling a close opened from the target tab's strip leaves that tab current.
3. Update `product/specs/editor-tab.md` to state that cancelling a dirty named close returns the target editor to current focus.

## Tests

- A named close of an inactive dirty tab followed by Cancel activates that tab and focuses its editor handle without saving or closing it.
- A Cancel from the target tab's own close button keeps the target open and current.
- Existing named-close routing, save, discard, and quit-walk cases continue to pass.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- The incorrect `close alpha` examples in the PR description, which are tracked by a separate backlog entry.
- Changes to the quit walk or to how dirty tabs are registered.
- Behavior when Cancel is chosen after the target tab has already closed.
