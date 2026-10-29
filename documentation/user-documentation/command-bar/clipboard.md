# Clipboard history

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

Copies you make inside Janissary stay in clipboard history for this session. `Ctrl+Shift+V` (or `Cmd+Shift+V`) opens the latest 15 entries by default, and typing `clip` does the same. Empty and whitespace-only copies are skipped. It is the same window as the [`Ctrl+R` command picker](/user-documentation/command-bar/history), with your copied text in place of commands — and unlike that picker, choosing an entry *pastes* it rather than running it.

## Opening it

Three routes, all to the same window:

- **`Ctrl+Shift+V`** or **`Cmd+Shift+V`**.
- **`clip`** typed alone in a command bar, like `hist` is to `Ctrl+R`. `clipboard` is the name of its help page (`help clipboard`), and typing it does not open the popup.
- **Paste from clipboard…** in the right-click menu.

It opens above the command line with the newest copy at the bottom, nearest the input. With nothing copied it still opens, showing `(no clipboard history)`.

`Ctrl+V` and `Cmd+V` are untouched. In an editor tab they are the ordinary paste.

### Tabs without a command line

The popup shows on a shell tab, an editor tab, and a harness or ssh tab. On a tab with no command line and nowhere to paste, such as a markdown, image, PDF, web page, video, or SQL tab, nothing appears. The chord still opens the popup, though, and the hidden popup holds the keyboard until you press `Escape`.

## What you can paste it into

Choosing an entry — with `Return`, or by clicking it — puts it at the keyboard cursor and closes the window:

- **In a command bar**, at the cursor, replacing any selected text and leaving the rest of the line exactly as it was.
- **In an editor tab**, at the cursor, with the cursor left at the *start* of what it pasted, so the next thing you type goes in front of it.
- **In a harness or ssh tab**, typed at the prompt. It is **not** submitted: pasting does not run what it pastes, so you can check it before you press `Return`. The keyboard stays in that terminal afterwards, so you can keep typing at the prompt.

A text field that already holds the keyboard always wins over the tab's own paste target. On a harness tab, an entry goes to the terminal prompt only when no such field has the keyboard.

To copy selected terminal text, press `Ctrl+Shift+C`, or `Cmd+C` on macOS. `Ctrl+C` remains the terminal interrupt. The selected text is copied to your system clipboard and added to this session's clipboard history, even if the browser cannot write to the system clipboard.

If you opened the popup from the right-click menu, how you choose matters. Clicking an entry pastes into the editor or text field you right-clicked, even if the keyboard was somewhere else. Choosing with `Return` pastes at the keyboard cursor instead, because the menu has closed by then. If you right-clicked something that isn't a text field, such as a transcript, both ways paste at the keyboard cursor.

The window takes the keyboard while it is open, even in an editor or a terminal. `↑`/`↓` move the selection and stop at the ends, `Return` pastes, and `Escape` or `Tab` closes without pasting anything. With nothing in the list, `Return` just closes it. `Shift+Tab` does not move between [sections](/user-documentation/getting-started/keyboard#move-focus-between-application-sections) while the popup is open, and `Ctrl+W` closes no tab. Switching to another tab closes the popup without pasting.

When it closes after `Return`, a click, `Escape`, or `Tab`, the keyboard goes back to where you were typing: the command bar, the editor, or the terminal. The exception is a paste that lands in a different text field, such as the field you right-clicked. The cursor stays there. After a tab switch, the keyboard goes to the new tab.

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

In a shell tab, the popup sits above the command bar and leaves the bar visible beneath it. Selecting an entry pastes it into the command bar at the cursor and does not run it.

## What an entry looks like

One line per entry: the first line of text that isn't whitespace, which is not always the copy's first line — a copy taken from the middle of an indented block, or of output that starts with blank lines, has the text you recognize on some line rather than the first. A copy of more than one line shows how many after it, like `(3 lines)`. A line too long for the window is cut off with `…` before that count, so the count stays visible. The count is only shown, never pasted, and the stored text is never shortened, so what lands is all of it.

## What's kept

<img class="agent-float" src="/agents/selim-south-east.png" alt="" />

Every copy you make inside Janissary is recorded the moment you make it: an editor copy or cut, the copy chord on a selection you dragged over in a terminal or a shell tab's reply, a SQL grid's rows, the right-click menu's **Copy**, rows or paths copied in a file navigator, and a copy a program in a terminal asked for. It counts even if your system refuses the copy. Cutting rows in a file navigator is not recorded. Recording starts when the window opens, so the first time you open the popup it already lists everything copied so far.

Text copied from *another* application is not recorded, because the history only sees copies made inside Janissary. The history never reads your system clipboard. The right-click menu's **Paste** is separate: it reads the system clipboard when you use it, and what it pastes is not added to the history.

Copying the same text twice moves that one entry to the bottom rather than showing it twice, so the list never shows the same text twice and stays in recency order, up to the size you configured (15 by default).

The list lives in the window and is not written anywhere, so reloading or restarting clears it.

## If the popup fails

The popup starts when the window opens, so a failure at launch is reported before you ever open it. If it fails while the popup is opening or already open, the popup closes and keyboard focus returns to where it was. The rest of Janissary keeps working. The Notifications feed reports `Overlay plugin "clipboard-history" disabled: <reason>.` once. After that, the chords and `clip` open nothing, and **Paste from clipboard…** stays in the right-click menu but does nothing.

## Keeping more or fewer

Fifteen entries by default, with the oldest falling off. To keep more, set `clipboardHistoryMaxEntries` in `.janissary/config.json` (see [app configuration](/user-documentation/getting-started/configuration)):

```json
{ "clipboardHistoryMaxEntries": 40 }
```

It is read at launch, so restart afterwards. The history starts empty each launch, and the oldest entries drop once it reaches the limit. A value that isn't a whole number above zero falls back to 15. That covers `0`, a negative, a fraction, text, and a number larger than `9007199254740991`. Leaving the key out also gives 15.
