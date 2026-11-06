# Show shell-tab completion choices in a navigable picker

**Complexity: 4/10** — a client-only change in the shell tab plugin. It reuses the shared picker styling and key handler the shell's own history popup already uses, adds one presentational component, one hook, and one pure splice function. No server or wire change.

When `Tab` in the shell tab's command bar produces several matches, the bar fills in their longest common prefix and shows a read-only candidate strip above the command line (`web/src/plugins/shell/ShellTab.tsx`). You can read the strip, but you can't move through it or accept an entry. The task picker (`web/src/pickers/TaskPicker.tsx`) and the shell's history popup (`web/src/plugins/shell/ShellHistoryPopup.tsx`) are `.picker` overlays docked on the command bar, with a selected row, `↑`/`↓`/Return/Escape through `handlePickerKey` (`web/src/shared/picker-keyboard.ts`), and clickable rows.

## Goal

Several matches open a completion picker over the shell tab's command bar instead of the strip. `↑`/`↓` move the selection, Return accepts the selected candidate, Escape closes the picker and leaves the line as it is, and clicking a row accepts that candidate. Accepting a candidate puts it into the command line in place of the partial token, then completes it the way a sole match completes (a trailing space, or `/` for a directory). Typing keeps the keyboard in the command bar and closes the picker, exactly as it closed the strip. One match and no match behave as today.

## Approach

- The server's matches are display strings, not always the exact text to insert: path completion returns bare entry names while the token carries its directory prefix, the `files` command returns quoted paths with a `/` on directories, and tab targets quote labels containing spaces. The line the server returned already ends, at `newCursor`, with the part of the token the matches share. A pure `completionPickLine(line, cursor, pick)` splices the pick in over the longest tail of the text before the cursor that the pick starts with. When nothing overlaps and the pick opens with a quote, the overlap is measured against the pick without its quote, so `send my` and pick `"my tab"` gives `send "my tab"`.
- After splicing, the bar asks the same `complete` intent again at the end of the spliced pick. When that answers with exactly one match, its line replaces the splice (adding the server's suffix) if the bar still holds the splice. A pick ending in `/` is a directory already and is not re-completed, so choosing a directory never descends into it.
- A `useShellCompletion` hook owns the matches, the selected row, the cursor the matches belong to, the `Tab` request, the pick, and the picker's key handling, so `ShellTab.tsx` stays under the line limit and its key handler stays a router.
- A presentational `ShellCompletionPicker` renders a `.picker.shell-completions` overlay titled `completions`, scrolling the selected row into view like `TaskPicker`. Rows take the pointer on mouse down without moving focus out of the command bar.
- The picker's keys are handled in the command bar's own key handler, because the keyboard stays in the bar so typing can narrow the line. Only unmodified `↑`, `↓`, Return and Escape are taken while the picker is visible; Shift+Return still adds a line.

## Implementation steps

1. Add `web/src/plugins/shell/completion-pick.ts` with `completionPickLine(line, cursor, pick)` returning `{ line, cursor }`.
2. Add `web/src/plugins/shell/ShellCompletionPicker.tsx`, the presentational picker.
3. Add `web/src/plugins/shell/useShellCompletion.ts`: matches state, selected index (reset to the first row when a new list arrives), the stored cursor, `request(line, cursor)`, `pick(match)`, `clear()`, and `onPickerKey(event)` built on `handlePickerKey`.
4. `web/src/plugins/shell/ShellTab.tsx`: replace the matches state, the `Tab` branch, the Escape dismissal and the strip with the hook and the picker. Remove `handleCompletionDismissKey` from `command-bar-keys.ts`, which nothing else uses.
5. `web/src/plugins/shell/shell.css`: dock `.picker.shell-completions` on the command bar with the history popup's height and sidebar rules. Remove the `.completions` rule from `web/src/theme.css`, whose only user was the strip.

## Tests

- `web/src/plugins/shell/completion-pick.test.ts`: a bare entry name after a directory prefix; a `files`-style display carrying the whole token; a quoted pick over an unquoted partial; a quoted pick over a quoted partial; text after the cursor kept; no overlap inserts the pick at the cursor.
- `web/src/plugins/shell/ShellTab.test.tsx`: update the strip cases to assert the picker and its rows; `↓` then Return accepts the second candidate; `↑` clamps at the first row; clicking a row accepts it; accepting re-completes and applies a unique answer's suffix; a pick ending in `/` is not re-completed; Escape still closes without changing the line; typing closes the picker; one match shows no picker.

## Spec and docs

- `product/specs/shell-tab.md`: the "Tab completion is the application's" paragraph describes the picker, its keys and clicks, and what accepting a candidate does.
- `product/specs/tab-completion.md`: the multiple-match bullet says the shell tab lists candidates in a picker you can move through and accept from.
- `documentation/user-documentation/command-bar/tab-completion.md`: replace the "you can't move through it" sentence with the picker's keys and clicks.
- `product/specs/keyboard-navigation.md`: the popup-placement paragraph no longer mentions a completion strip and names the shell's completions popup beside its history popup.
- `help/keys.md`: the shell tab's `Tab` and `Escape` rows say the choices open a picker and Escape closes it; `↑`/`↓` and Return note what they do while it is open.

## Out of scope

- Moving through the candidates with repeated `Tab` presses (menu-complete); `Tab` with the picker open asks for completion again, as it does today.
- Filtering the picker by typed text inside the picker; typing goes to the command line and closes the picker.
- Placing the caret at the server's `newCursor` for a completion in the middle of the line; the existing `Tab` path ignores it too.
- Any server or wire change to return per-candidate insertion text.
