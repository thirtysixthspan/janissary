# Copy a pointer selection of shell output and rendered replies

**Complexity: 5/10** — a copy-chord handler in the command bar, a held selection for rendered replies with a CSS highlight, one selection read shared by the bar, the terminal and the context menu, tab-level and module-level regression tests, and the matching spec and help rows.

The bug as filed covers terminal output. The rendered-reply half was found while fixing it and added to the same change on request.

## Root cause

**Terminal output.** A drag over the shell terminal ends in a `click` on the shell body, and the tab's click handler gives the keyboard back to the command bar. That is the documented single-click rule, and `holdFocusOffSinglePress` makes sure the press never focuses the terminal in the first place. xterm.js keeps the selection the drag made, so it stays highlighted. But the shell answers its copy chord in only one place: the custom key handler installed on xterm in `useShellTerminal`, which runs only while xterm's own textarea has focus. The command bar's key handling (`onBarKeyDown` in `ShellTab.tsx`, with `handleShellControlKey` in `command-bar-keys.ts`) knows `Ctrl+C`, `Ctrl+D` and `Ctrl+Z` and nothing about the terminal's selection. So with the keyboard where a drag always leaves it, `Cmd+C` and `Ctrl+Shift+C` copy nothing. Only the right-click menu's **Copy**, which reads the selection through the terminal selection bridge, gets the text out.

**Rendered replies.** A reply such as `help`'s is HTML in an xterm decoration inside xterm's own element. xterm cancels every `mousedown` on that element (`preventDefault` in both its selection service and its always-on mouse listener), so the browser never starts a text selection over the reply. Two live experiments settled what a fix has to handle. With the press stopped before xterm saw it, a drag did select the reply's text (`video <path> opens a vid`). But the press's default action moved focus to the page, and the click handler then focused the command bar. Focusing a text field replaces the page's selection: a selection set in the reply read `acp` before the bar took focus and `''` after. So under the documented focus rule a native selection in a reply can't survive the end of its own drag. `copyShellMarkdownSelection`, which copied a reply selection from a key press inside the shell body, could never see one.

## Correct behavior

After you select command output in the shell terminal by dragging over it, `Ctrl+Shift+C` (and `Cmd+C` on macOS) copies that selection through the shared clipboard writer, so it reaches the system clipboard and clipboard history. This works while the keyboard is in the command bar, where the drag leaves it, just as it already does with the terminal focused. When the command line holds a selection of its own, the chord stays with the command line, as in any text field. With nothing selected in either place, the chord does nothing.

Text in a rendered reply is selected the same way. Dragging over it selects its text, the keyboard returns to the command bar when the drag ends, and the selection stays highlighted. The copy chord and the right-click **Copy** copy it exactly as they copy a terminal selection. A new press in the terminal, a double-click, or a resize clears it, and a reply selection and a terminal selection never stand together.

The spec already promises both (`product/specs/shell-tab.md` § Keys and the rendered-reply paragraph), and the user guide (`documentation/user-documentation/command-bar/shell.md`) tells users to select terminal text or a rendered reply and press the chord. The single-click focus rule in § Choose where keys go is kept as it is.

`Shift+←` and `Shift+→` in the command bar switch tabs rather than extend a text selection. That is the application-wide tab-switch chord (`product/specs/tabs.md`, `product/specs/keyboard-navigation.md`, `help/keys.md`), defined once in `isTabSwitchChord` and documented for every command bar, so it is not changed here.

## Reproduction

`./temp/fix-a-bug-drivers/verify.mjs` ran against a scratch app built from `master@b760731`, through `$janissary/scripts/run.mjs e2e-driver`. It submitted `echo SELECTME-$((12000+345))` from the `janus` shell's command bar, dragged the mouse across the `SELECTME-12345` output row, and recorded the result. Two selection rectangles were drawn in `.xterm-selection`, and `document.activeElement` was the `Shell command` textarea. `Meta+C` and then `Control+Shift+C` each left the clipboard writer with no calls (`[]`). A right-click on the selection offered **Copy**, and choosing it wrote `SELECTME-12345`.

`./temp/fix-a-bug-drivers/reply-probe.mjs` submitted `help` and dragged across a visible row of the rendered reply. After the drag `getSelection()` was empty, the keyboard was in the `Shell command` bar, and both chords copied nothing.

## Approach

**Terminal output.** Answer the terminal copy chord from the command bar. `handleTerminalCopyKey` in `command-bar-keys.ts` returns `false` unless the event is the terminal copy chord (`copySelectionChord` with `isMacPlatform()`), leaves the chord alone when the bar has its own selection, and otherwise copies the shell's selection through `capabilities.copyText` and prevents the default. The terminal handle returned by `useShellTerminal` gains `selection()`. `ShellTab` calls the new handler in `onBarKeyDown` just before `handleShellControlKey`. The selection is left in place after copying, matching what the chord does with the terminal focused.

**Rendered replies.** A new framework-free module, `reply-selection.ts`, exports `holdReplySelection(container, terminal, onRelease)`. A capture-phase `mousedown` listener on the shell body does three things on a primary press. It clears any held reply selection. For a press inside a `.shell-output-block`, it stops the event before it reaches xterm, so the browser starts an ordinary text selection. And it clears xterm's own selection, so only the newest selection stands. When that press is released, a one-shot `mouseup` capture listener on the document takes the page's selection if it starts in the reply. It clips the range to the reply block, keeps a copy of the range, and paints it with a shared CSS highlight named `shell-reply-selection`. Then it calls `onRelease`, which focuses the command bar. The highlight is what keeps the selection visible once the bar takes focus and the page's own selection is gone. Where the browser has no Custom Highlight API, the text is still held and copied, just not painted.

One read serves every consumer: the held reply text when there is one, otherwise xterm's selection. The bar's copy handler reads it through `selection()`. xterm's own copy-chord handler and the context-menu bridge (`registerTerminalSelection`) read it inside `useShellTerminal`. Clearing goes through the same pair, on a double-click, a resize, or the bridge's `clear`. `copyShellMarkdownSelection` and its module are removed: it answered a state that cannot occur, and the held selection replaces it.

Rejected: giving the terminal the keyboard at the end of a drag. That would change the documented focus model, light the focus line and uncover zsh's prompt after every selection, and send the next keystroke to zsh instead of the bar. Also rejected: leaving the keyboard off the bar after a reply drag so the native selection survives. The keyboard would rest on the page, where neither typing nor the copy chord reaches anything the shell handles.

## Implementation steps

1. Make the fake terminal's selection settable in `ShellTab.test.tsx` and add the terminal-output regression tests below, and watch the copy cases fail against the unfixed code.
2. Add `selection(): string` to `ShellTerminalHandle` in `useShellTerminal.ts`, returning `terminal.getSelection()` when `terminal.hasSelection()` and `''` otherwise.
3. Add `handleTerminalCopyKey(event, element, terminalSelection, copyText)` to `command-bar-keys.ts`, with one short comment saying why the bar answers the terminal's copy chord (a drag ends in a click, which returns the keyboard to the bar). No other comments.
4. In `ShellTab.tsx`, take `selection` from `useShellTabTerminal` and call `handleTerminalCopyKey` in `onBarKeyDown` before `handleShellControlKey`.
5. Add the rendered-reply regression tests below, in `reply-selection.test.ts` and `ShellTab.test.tsx`, and watch them fail against the code from step 4.
6. Add `reply-selection.ts` with `holdReplySelection` and `shellSelectionText(reply, terminal)`, with one comment on `holdReplySelection` saying why a reply press is stopped and why its selection is held and painted rather than left to the browser. No other comments.
7. In `useShellTerminal.ts`, create the hold beside `holdFocusOffSinglePress`, take a `focusCommandBar` option for `onRelease`, and route `selection()`, `clearSelection()`, the resize clear, xterm's copy-chord handler and the context-menu bridge through the shared read and clear. Pass `focusCommandBar` through `useShellTabTerminal` from `ShellTab`.
8. Remove `copyShellMarkdownSelection` from `ShellTab.tsx`, delete `shell-markdown-selection.ts`, and replace its two tab tests with the new ones.
9. Style `::highlight(shell-reply-selection)` and a reply's own `::selection` with `--editor-selection`, the color the terminal's selection uses, in `shell.css`.

## Regression test

In `web/src/plugins/shell/ShellTab.test.tsx`:

- `copies a dragged terminal selection on Ctrl+Shift+C after the click returns the keyboard to the bar`: the fake terminal holds `SELECTME-12345`, a click on the shell body puts focus on the bar, and `Ctrl+Shift+C` there calls `copyText('SELECTME-12345')` and writes nothing to zsh. Without the fix, `copyText` is never called.
- `copies a dragged terminal selection on Cmd+C from the bar on macOS`: the same with `navigator.platform` reporting `MacIntel`.
- `leaves the copy chord to the bar when the bar holds a selection of its own`: with text selected in the bar, `Cmd+C` does not copy the terminal's selection.
- `leaves the copy chord alone when the terminal holds no selection`.
- `holds a dragged reply selection, returns the keyboard to the bar, and copies it from there`: a press and release over a `.shell-output-block` with its text selected puts focus on the bar, `Ctrl+Shift+C` copies the reply text, and the context-menu bridge reports it.
- `prefers a held reply selection to the terminal's and drops it on the next press in the terminal`.

In `web/src/plugins/shell/reply-selection.test.ts`: a press on a reply never reaches the terminal element and is not cancelled; a press elsewhere does reach it; the released selection is held after the page's selection is gone; a selection running out of the reply is clipped to it; a right-button press keeps the hold and a primary press clears it; the held range is painted and unpainted through the shared highlight; and `dispose` releases the hold and its listeners.

## Spec changes

`product/specs/shell-tab.md` § Keys: the copy chord copies the shell's selection, in the terminal or in a rendered reply, whether the keyboard is in the terminal or in the command bar, which is where a pointer selection leaves it. A selection in the command line keeps the chord. § Everything else mentions the chord beside the right-click **Copy**. The rendered-reply paragraph describes dragging over a reply, the highlight that stays after the keyboard returns to the bar, and what clears it.

## Documentation

`help/keys.md`: the shell-tab copy row drops the "(terminal focused)" condition, for terminal text and for a rendered reply. `documentation/user-documentation/command-bar/shell.md` already says to select text in the terminal or a rendered reply and press the chord, with no focus condition, so it needs no change.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Live: rebuild, start a scratch instance, and rerun `./temp/fix-a-bug-drivers/verify.mjs`. It drags across the `SELECTME-12345` output and expects the bar to hold the keyboard, `Meta+C` to write `SELECTME-12345` to the clipboard writer, and `Control+Shift+C` to write it again. The right-click **Copy** still works. For replies, a second driver submits `help`, drags across a visible row of the reply, and expects the bar to hold the keyboard, the dragged text to be painted by the `shell-reply-selection` highlight, `Meta+C` and `Control+Shift+C` to write that text, and right-click **Copy** to write it too.

Result for terminal output: the rerun against a build of `master@b760731` plus the fix kept the keyboard in the `Shell command` bar after the drag, with two selection rectangles drawn. `Meta+C` wrote `SELECTME-12345`, `Control+Shift+C` wrote it a second time, and the bar stayed empty. Right-click **Copy** wrote it a third time.

Result for rendered replies: `./temp/fix-a-bug-drivers/reply-verify.mjs` first copied a terminal selection of `SELECTME-12345`, then submitted `help` and dragged across the start of the `video` row's description. The keyboard was in the `Shell command` bar, the `shell-reply-selection` highlight held `video <path> opens a video t`, and the terminal's selection rectangles were gone. `Meta+C` and `Control+Shift+C` each wrote that text, and the clipboard popup listed it under `SELECTME-12345`. Right-click offered **Copy**, **Paste from clipboard…**, **Search for this** and **Chat about this**; **Copy** wrote the text and released the highlight, as the menu's Copy does for any terminal selection. A drag from the `tasks` row into the closing paragraph copied the rows with their line breaks and tab-separated cells. A drag from the closing paragraph down past the reply's edge stopped at the reply, and its text ended where the paragraph does. A single click then cleared the highlight, and `Control+Shift+C` copied nothing more.

## Out of scope

- Changing the single-click focus rule, the double-click focus gesture, or the harness terminal's selection layer.
- Changing `Shift+←`/`Shift+→`, which switch tabs from every command bar by design.
- Copying a selection when the keyboard rests anywhere other than the bar or the terminal.
- `Cmd+I` (**Chat about this**) for a selection made in the shell while the keyboard is in the command bar. It resolves the selection from the focused element, as it does for every terminal.
