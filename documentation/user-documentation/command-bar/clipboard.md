# Clipboard history

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

Copies you make inside Janissary stay in clipboard history for this session. `Ctrl+Shift+V` (or `Cmd+Shift+V`) opens the latest 15 entries by default. Empty and whitespace-only copies are skipped. It is the same window as the [`Ctrl+R` command picker](/user-documentation/command-bar/history), with your copied text in place of commands — and unlike that picker, choosing an entry *pastes* it rather than running it.

## Opening it

Three routes, all to the same window:

- **`Ctrl+Shift+V`** or **`Cmd+Shift+V`** from anywhere.
- **`clipboard`** typed in the command bar, like `hist` is to `Ctrl+R`.
- **Paste from clipboard…** in the right-click menu.

It opens above the command line with the newest copy at the bottom, nearest the input. With nothing copied it still opens, showing `(no clipboard history)`.

`Ctrl+V` and `Cmd+V` are untouched — in an editor tab they are the ordinary paste.

## What you can paste it into

Choosing an entry — with `Return`, or by clicking it — puts it at the keyboard cursor and closes the window:

- **In a command bar**, at the cursor, replacing any selected text and leaving the rest of the line exactly as it was.
- **In an editor tab**, at the cursor, with the cursor left at the *start* of what it pasted, so the next thing you type goes in front of it.
- **In a harness or ssh tab**, typed at the prompt. It is **not** submitted: pasting does not run what it pastes, so you can check it before you press `Return`.

If you opened it from the right-click menu, it pastes into whatever you right-clicked rather than into wherever the keyboard happened to be.

The window takes the keyboard while it is open, even in an editor or a terminal. `↑`/`↓` move the selection and stop at the ends, `Return` pastes, and `Escape` or `Tab` closes without pasting anything. Switching to another tab closes it the same way. Once it closes, the keyboard goes back to where you were typing.

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

The popup also opens in the shell plugin tab. Selecting an entry pastes it into the command bar at the cursor.

## What an entry looks like

One line per entry: the first line of text that isn't whitespace, which is not always the copy's first line — a copy taken from the middle of an indented block, or of output that starts with blank lines, has the text you recognize on some line rather than the first. A copy of more than one line shows how many after it, like `(3 lines)`. A line too long for the window is cut off with `…` before that count, so the count stays visible. The count is only shown, never pasted, and the stored text is never shortened, so what lands is all of it.

## What's kept

<img class="agent-float" src="/agents/selim-south-east.png" alt="" />

Nonempty copies made inside Janissary are recorded — an editor copy or cut, a terminal selection, a SQL grid's rows, a drag-selection in a transcript, the right-click menu's Copy, and a copy a program in a terminal asked for. Text copied from *another* application is not recorded: Janissary does not read the system pasteboard.

Copying the same text twice moves that one entry to the bottom rather than showing it twice, so the list never shows the same text twice and stays in recency order, up to the size you configured (15 by default).

The list lives in the window and is not written anywhere, so reloading or restarting clears it.

## If the popup fails

If the overlay plugin fails while the popup is opening or already open, the popup closes and keyboard focus returns to where it was. The rest of Janissary keeps working. The Notifications feed reports `Overlay plugin "clipboard-history" disabled: <reason>.`; only the clipboard-history chord and `clipboard` command stop working.

## Keeping more or fewer

Fifteen entries by default, with the oldest falling off. To keep more, set `clipboardHistoryMaxEntries` in `.janissary/config.json` (see [app configuration](/user-documentation/getting-started/configuration)):

```json
{ "clipboardHistoryMaxEntries": 40 }
```

It is read at launch, so restart afterwards. The history starts empty each launch, and the oldest entries drop once it reaches the limit. A value that isn't a whole number above zero falls back to 15. That covers `0`, a negative, a fraction, text, and a number larger than `9007199254740991`. Leaving the key out also gives 15.
