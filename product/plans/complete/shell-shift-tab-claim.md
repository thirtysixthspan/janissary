# Let Shift+Tab move focus between the shell terminal and command bar

**Complexity: 2/10** — The shell tab handles Shift+Tab on both of its surfaces: from the command bar it focuses the terminal, and from the terminal it focuses the bar. In the running application neither handler ever sees the key, because the section-navigation hook listens on the window in the capture phase and takes Shift+Tab first everywhere except inside elements marked `data-claims-shift-tab`. The shell tab carried no such mark. Component tests fired the key on the elements directly, so they never met the window listener.

## Goal

Shift+Tab in a shell tab's command bar focuses the terminal, and Shift+Tab in its terminal focuses the command bar, with the application's section cycling standing down inside the tab.

## Approach

Mark the shell tab's root element with `data-claims-shift-tab`, the mechanism the editor's text buffer and the question panel already use to keep the chord. The shell tab's own handlers then run unchanged.

## Implementation

1. Add `data-claims-shift-tab` to the shell tab's root element.
2. Update the shell-tab and keyboard-navigation specs.

## Tests

- With the real section-navigation hook mounted, Shift+Tab from the bar focuses the terminal, Shift+Tab from the terminal focuses the bar, and section focus is never moved. The case fails without the mark.

## Out of scope

- Section navigation everywhere else, which is unchanged.
