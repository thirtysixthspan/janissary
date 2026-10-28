# Copy a pointer selection of shell output from the command bar

**Complexity: 3/10** — one new key handler beside the shell's existing control keys, a selection read on the terminal handle, a tab-level regression test, and the matching spec and help rows.

## Root cause

A drag over the shell terminal ends in a `click` on the shell body, and the tab's click handler gives the keyboard back to the command bar. That is the documented single-click rule, and `holdFocusOffSinglePress` makes sure the press never focuses the terminal in the first place. xterm.js keeps the selection the drag made, so it stays highlighted. But the shell answers its copy chord in only one place: the custom key handler installed on xterm in `useShellTerminal`, which runs only while xterm's own textarea has focus. The command bar's key handling (`onBarKeyDown` in `ShellTab.tsx`, with `handleShellControlKey` in `command-bar-keys.ts`) knows `Ctrl+C`, `Ctrl+D` and `Ctrl+Z` and nothing about the terminal's selection. So with the keyboard where a drag always leaves it, `Cmd+C` and `Ctrl+Shift+C` copy nothing. Only the right-click menu's **Copy**, which reads the selection through the terminal selection bridge, gets the text out.

## Correct behavior

After you select command output in the shell terminal by dragging over it, `Ctrl+Shift+C` (and `Cmd+C` on macOS) copies that selection through the shared clipboard writer, so it reaches the system clipboard and clipboard history. This works while the keyboard is in the command bar, where the drag leaves it, just as it already does with the terminal focused. When the command line holds a selection of its own, the chord stays with the command line, as in any text field. With nothing selected in either place, the chord does nothing.

The spec already promises a working copy chord (`product/specs/shell-tab.md` § Keys), and the user guide (`documentation/user-documentation/command-bar/shell.md`) tells users to select terminal text and press the chord. Neither says the keyboard has to be in the terminal first. The single-click focus rule in § Choose where keys go is kept as it is: the fix answers the chord where the keyboard already is rather than moving focus.

## Reproduction

`./temp/fix-a-bug-drivers/verify.mjs` ran against a scratch app built from `master@b760731`, through `$janissary/scripts/run.mjs e2e-driver`. It submitted `echo SELECTME-$((12000+345))` from the `janus` shell's command bar, dragged the mouse across the `SELECTME-12345` output row, and recorded the result. Two selection rectangles were drawn in `.xterm-selection`, and `document.activeElement` was the `Shell command` textarea. `Meta+C` and then `Control+Shift+C` each left the clipboard writer with no calls (`[]`). A right-click on the selection offered **Copy**, and choosing it wrote `SELECTME-12345`.

## Approach

Answer the terminal copy chord from the command bar. Add `handleTerminalCopyKey` to `command-bar-keys.ts`. It returns `false` unless the event is the terminal copy chord (`copySelectionChord` with `isMacPlatform()`), leaves the chord alone when the bar has its own selection, and otherwise copies the terminal's selection through `capabilities.copyText` and prevents the default. The terminal handle returned by `useShellTerminal` gains `selection()`, which reads xterm's selection or `''`. `ShellTab` calls the new handler in `onBarKeyDown` just before `handleShellControlKey`, passing `event.nativeEvent` as the markdown-reply copy handler already does.

The selection is left in place after copying, matching what the chord does with the terminal focused.

Rejected: giving the terminal the keyboard at the end of a drag. That would change the documented focus model, light the focus line and uncover zsh's prompt after every selection, and send the next keystroke to zsh instead of the bar.

## Implementation steps

1. Make the fake terminal's selection settable in `ShellTab.test.tsx` and add the regression tests below, and watch the copy cases fail against the unfixed code.
2. Add `selection(): string` to `ShellTerminalHandle` in `useShellTerminal.ts`, returning `terminal.getSelection()` when `terminal.hasSelection()` and `''` otherwise.
3. Add `handleTerminalCopyKey(event, element, terminalSelection, copyText)` to `command-bar-keys.ts`, with one short comment saying why the bar answers the terminal's copy chord (a drag ends in a click, which returns the keyboard to the bar). No other comments.
4. In `ShellTab.tsx`, take `selection` from `useShellTabTerminal` and call `handleTerminalCopyKey` in `onBarKeyDown` before `handleShellControlKey`.

## Regression test

In `web/src/plugins/shell/ShellTab.test.tsx`:

- `copies a dragged terminal selection on Ctrl+Shift+C after the click returns the keyboard to the bar`: the fake terminal holds `SELECTME-12345`, a click on the shell body puts focus on the bar, and `Ctrl+Shift+C` there calls `copyText('SELECTME-12345')` and writes nothing to zsh. Without the fix, `copyText` is never called.
- `copies it on Cmd+C on macOS`: the same with `navigator.platform` reporting `MacIntel`.
- `leaves the copy chord to the bar's own selection`: with text selected in the bar, `Cmd+C` does not copy the terminal's selection.
- `does nothing on the copy chord when the terminal holds no selection`.

## Spec changes

`product/specs/shell-tab.md` § Keys: the copy chord copies the terminal's selection whether the keyboard is in the terminal or in the command bar, which is where a pointer selection leaves it. A selection in the command line keeps the chord. § Everything else mentions the chord beside the right-click **Copy**.

## Documentation

`help/keys.md`: the shell-tab copy row drops the "(terminal focused)" condition for terminal text. `documentation/user-documentation/command-bar/shell.md` already says to select terminal text and press the chord, with no focus condition, so it needs no change.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Live: rebuild, start a scratch instance, and rerun `./temp/fix-a-bug-drivers/verify.mjs`. It drags across the `SELECTME-12345` output and expects the bar to hold the keyboard, `Meta+C` to write `SELECTME-12345` to the clipboard writer, and `Control+Shift+C` to write it again. The right-click **Copy** still works.

Result: the rerun against a build of `master@b760731` plus the fix kept the keyboard in the `Shell command` bar after the drag, with two selection rectangles drawn. `Meta+C` wrote `SELECTME-12345`, `Control+Shift+C` wrote it a second time, and the bar stayed empty. Right-click **Copy** wrote it a third time.

## Out of scope

- Text in a rendered application reply (`help`, for example) can't be selected by dragging at all. xterm.js cancels the mousedown on its own element, and the reply block is a decoration inside it, so the browser never starts a selection. The `.shell-output-block` reply was confirmed live with `./temp/fix-a-bug-drivers/reply-probe.mjs`: after a drag, `getSelection()` was empty and the chords copied nothing. That is a separate cause in a separate mechanism, and the spec's claim about copying a selected reply stays as written for a follow-up fix.
- Changing the single-click focus rule, the double-click focus gesture, or the harness terminal's selection layer.
- Copying the terminal selection when the keyboard rests anywhere other than the bar or the terminal.
