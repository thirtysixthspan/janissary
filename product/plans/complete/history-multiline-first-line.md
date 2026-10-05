# Show a multi-line history entry as its first line and a line count

**Complexity: 2/10** — The history list (`HistoryPicker`, used by the application's `Ctrl+R` / `hist` picker and by the shell tab's own history popup) renders each entry's whole text in its row, so a multi-line command — a `for` loop typed into a shell, a Shift+Enter draft — spills its later lines into the row. The clipboard-history popup already solves the same problem: each row shows the first line of non-space text, with a muted `(N lines)` postfix when the entry has more than one line, and CSS clips a long line before the postfix.

## Goal

Every history row shows one line: the entry's first line of non-space text, followed by `(N lines)` when the entry spans several lines, exactly as the clipboard-history popup shows a copy. Picking a row still recalls or runs the whole entry; the postfix is never part of it.

## Approach

Move the clipboard plugin's `displayLine` rule into `web/src/shared/` so the shared history picker can use it without importing a plugin (overlay plugins may import shared modules; shared modules may not import a plugin). The clipboard plugin imports it from its new home. `HistoryPicker` renders each row as a label span and a postfix span, styled by the same rules as the clipboard rows, which gain the history row classes as additional selectors.

## Implementation

1. `git mv` `web/src/overlay-plugins/clipboard-history/display.ts` (and its test) to `web/src/shared/display-line.ts` (and `display-line.test.ts`); update the clipboard store's import.
2. `HistoryPicker`: render `displayLine(command)` as `.history-label` and `.history-lines` spans inside a `.history-row`; `onPick` still receives the full command.
3. `theme.css`: add `.history-row`, `.history-label` and `.history-lines` to the clipboard row rules.
4. Update the history spec's picker description and the shell-tab spec's history popup paragraph.

## Tests

- `HistoryPicker.test.tsx`: a multi-line entry renders its first line and `(N lines)`; a single-line entry has no postfix; clicking a multi-line row picks the full text.
- The moved `display-line.test.ts` keeps covering the rule itself.

## Out of scope

- How a recalled multi-line entry is laid out in the command bar.
- The agent tab's transcript.
