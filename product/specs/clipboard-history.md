# Clipboard History

A menu of the text copied in this session, newest at the bottom, from which any entry can be pasted at the keyboard caret.

### What is recorded

Every copy made inside the application is recorded: an editor copy or cut, a terminal's own copy chord, a copy a program in a terminal asked for through its pasteboard escape, a SQL grid's row copy, a transcript drag-selection, and the context menu's Copy. Text copied from another application is not recorded — there is no way to observe it, and the application reads no system pasteboard.

A copy that is empty or only whitespace is not recorded. Nothing is recorded until the popup is first opened: the history begins at the first open rather than at launch, so a session in which nothing is ever copied costs nothing.

The history lives in the application window and is not written anywhere. Reloading the window or restarting the application clears it. That is the same lifetime every IDE clipboard history has.

### Order, duplicates, and the cap

The newest copy is at the bottom, nearest the command line. Copying text that is already in the list moves that one entry to the bottom rather than adding a second, so the list is always distinct entries in recency order.

The list keeps the last 15 entries by default, dropping the oldest. `clipboardHistoryMaxEntries` in `.janissary/config.json` raises or lowers that number; it is read at launch, and lowering it below the number already held trims at once, so the list always matches the configured figure (see [[application-config]]).

### How an entry reads

Each entry shows one line: the first line of non-space text, which is not always the copy's first line — a copy taken from the middle of an indented block, or from output that opens with blank lines, has recognizable text on some line rather than the first. An entry whose copy had more text after that line carries an ellipsis. A line too long for the popup is cut off with an ellipsis too. The stored text is never shortened: choosing an entry pastes all of it.

### Opening the popup

`Ctrl+Shift+V`, the `clip` command, or **Paste from clipboard…** in the right-click menu. All three open the same popup in the same place: anchored above the command line, in the shape of the command-history popup (see [[history]]). It opens even with nothing copied, showing `(no clipboard history)`.

`Ctrl+V` is untouched. In an editor tab it is the browser's own paste, as it is everywhere else in the application.

The popup renders on an agent tab, an editor tab, and a harness or ssh tab. Those are the only tabs with an overlay surface at all. A markdown, image, pdf, page, video, sql, or conversations tab has none, so there is nowhere to paste into and nothing appears there — but the chord is still answered on such a tab, and the popup it opens takes the keyboard until `Escape` or `Return` dismisses it.

### Choosing an entry

Choosing an entry — with Return, or by clicking it — pastes it and closes the popup. It does not run anything, which is the one way this popup differs from the command-history popup.

The text lands at the keyboard caret:

- in a **command bar**, at the caret, replacing any selected text and leaving the rest of the line alone;
- in an **editor buffer**, at the caret, with the caret left at the *start* of the pasted text so the next keystroke continues before it — what a paste in an editor does everywhere else;
- in a **harness or ssh terminal**, typed at the prompt as terminal input and *not* submitted. Pasting does not run what it pastes.

A field the keyboard is in always wins over a tab-level choice, so pasting from the clipboard popup into the Quick Open box on a harness tab puts the text in that box.

Clicking an entry in a popup opened from the right-click menu pastes into whatever the right-click landed on, rather than into wherever the keyboard happened to be. Choosing one with `Return` instead pastes at the keyboard caret: by then the menu has closed and the element the click found is no longer what the user is aiming at.

While the popup is open it takes every keystroke, like every other overlay (see [[keyboard-navigation]]): the arrows move the selection and stop at the ends without wrapping, Return chooses, Escape closes without pasting. `Ctrl+W` closes no tab while it is up. It does not disable the command bar, because pasting at the caret needs the bar still there, and the bar stops handling its own keys while it is up. In an editor buffer the keyboard is a separate matter: the buffer keeps its own focus and its own key handling, so typing there still edits the buffer underneath the popup.

### When it is not there

The popup is contributed by an overlay plugin, and a plugin that fails to load, is refused a chord or command word another plugin already holds, or breaks is disabled with `Overlay plugin "<id>" disabled: <reason>.` in the notifications feed. Everything else keeps working, and only that chord and that command word stop answering.

## Out of scope

Previewing the selected entry, searching or filtering the popup, deleting an entry, and pinning an entry are all possible in other applications' clipboard histories and none is here. Neither is pasting several entries at once. See the plan for why.
