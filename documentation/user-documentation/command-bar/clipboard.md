# Clipboard history

<img class="agent-float" src="/agents/ahmed-south.png" alt="" />

Everything you copy inside janus is remembered, and `Ctrl+Shift+V` brings back the last 15 of it. It is the same window as the [`Ctrl+R` command picker](/user-documentation/command-bar/history), with your copied text in place of commands — and unlike that picker, choosing an entry *pastes* it rather than running it.

## Opening it

Three routes, all to the same window:

- **`Ctrl+Shift+V`** from anywhere.
- **`clip`** typed in the command bar, like `hist` is to `Ctrl+R`.
- **Paste from clipboard…** in the right-click menu.

It opens above the command line with the newest copy at the bottom, nearest the input. With nothing copied it still opens, showing `(no clipboard history)`.

`Ctrl+V` is untouched — in an editor tab it is the ordinary paste.

## What you can paste it into

Choosing an entry — with `Return`, or by clicking it — puts it at the keyboard cursor and closes the window:

- **In a command bar**, at the cursor, replacing any selected text and leaving the rest of the line exactly as it was.
- **In an editor tab**, at the cursor, with the cursor left at the *start* of what it pasted, so the next thing you type goes in front of it.
- **In a harness or ssh tab**, typed at the prompt. It is **not** submitted: pasting does not run what it pastes, so you can check it before you press `Return`.

If you opened it from the right-click menu, it pastes into whatever you right-clicked rather than into wherever the keyboard happened to be.

`↑`/`↓` move the selection and stop at the ends, `Return` pastes, and `Escape` closes without pasting anything.

## What an entry looks like

One line per entry: the first line of text that isn't whitespace, which is not always the copy's first line — a copy taken from the middle of an indented block, or of output that starts with blank lines, has the text you recognize on some line rather than the first. `…` marks that more of the copy followed, and a line too long for the window is cut off the same way. The stored text is never shortened, so what lands is all of it.

## What's kept

Every copy made inside janus is recorded — an editor copy or cut, a terminal selection, a SQL grid's rows, a drag-selection in a transcript, the right-click menu's Copy, and a copy a program in a terminal asked for. Text copied from *another* application is not recorded: janus does not read the system pasteboard.

Copying the same text twice moves that one entry to the bottom rather than showing it twice, so the list is always fifteen distinct entries in recency order.

The list lives in the window and is not written anywhere, so reloading or restarting clears it.

## Keeping more or fewer

Fifteen entries by default, with the oldest falling off. To keep more, set `clipboardHistoryMaxEntries` in `.janissary/config.json`:

```json
{ "clipboardHistoryMaxEntries": 40 }
```

It is read at launch, so restart afterwards. Lowering it below what is already held trims at once. A value that isn't a whole number above zero — `0`, a negative, a fraction — falls back to 15, as does leaving the key out.
