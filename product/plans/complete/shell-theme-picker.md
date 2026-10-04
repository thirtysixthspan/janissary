# Show the application theme picker over a shell tab

**Complexity: 6/10.** The command bar already opens the app theme picker state and the keyboard handler already owns its navigation. The shell plugin layer does not render that picker or defer the keys it claims. This adds a narrow overlay projection and connects the existing suppression state to the shell bar.

## Goal

Typing `theme` into the shell command bar displays the existing application theme picker over the shell tab and lets the application keyboard handler navigate it.

## Approach

Project the existing `AppThemePicker` into the active shell plugin layer only while the app theme overlay is open. Publish whether an app overlay owns command-bar keys so the shell bar defers those keys while leaving the bar enabled.

## Implementation

1. Add the app theme picker projection to the active plugin layer using the existing theme state, selection, and pick callback.
2. Let the shell command bar defer its key handling while an application overlay claims it; preserve its local history handling.
3. Add regressions for the shell overlay and shell key deferral, then remove this backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation.

## Out of scope

Other application pickers, and changes to application theme behavior or styling.
