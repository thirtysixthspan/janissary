# Editor Tab

An **editor tab** displays a plain-text file opened with the `edit` or `open` command, using the
editor opener (see Open). It is a non-agent **view tab**: the file's text is shown as an editable
buffer in place of the usual transcript and command bar, controlled by direct keyboard input and
mouse selection. It behaves like a markdown tab — same lifecycle and tab-strip treatment — differing
in the editable content and keyboard handling.

When the `edit` command runs, a transcript entry for the command appears in the originating tab
before the editor tab opens and takes focus. The command text is recorded as the entry's input; the
output is empty since the editor tab is the side-effect.

An editor tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new editor tab.

Unlike an agent tab, an editor tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a live, in-memory view — like markdown tabs and image
tabs, it is not saved and is not restored on `--relaunch`.

### Scrubbing

The editor buffer follows the same scrubbing rules as the terminal input (see CLI → Scrubbing):
keypresses that carry text are masked from the transcript log, while navigation keys (arrows, page
up/down, etc.) are not.

### Layout

- **Metadata header** — the file's name, size, and location.
- **Editor body** — fills the remaining space. Scrolls independently.

### Focus protection

Clicking the metadata header or in the editor body outside any text line (blank space below the last line) must not steal focus from the hidden textarea — the cursor position and keyboard input remain uninterrupted. The metadata header is non-selectable (text cannot be selected in it) to prevent accidental browser focus changes.

### New files

The `edit <file>` command can open a path that does not yet exist on disk. The editor opens with
an empty buffer showing the file's name, a size of "unknown", and the resolved path in the metadata
header. The file is not written to disk until the user explicitly saves (Ctrl+S / Cmd+S). On the
first save, the file is created at the given path and the size display updates to reflect the new
on-disk size. Subsequent saves overwrite the file as usual.

### Keyboard input

Printable characters (letters, digits, symbols, and space) and special keys (arrows, page up/down,
home, end, enter, tab, backspace, delete, escape) are handled by the editor. Pressing and holding
a printable key repeats the character — the key press is applied directly to the buffer on each
repeat event.

Clicking anywhere in the editor body — including empty space below the last line — keeps the textarea focused so keyboard input continues to work. Clicks on text lines move the cursor; clicks on empty space do not change cursor position but do not disarm the editor.

During IME composition, key events are deferred to the compositing text input and are not processed
as editor actions until composition ends.

Paste (Cmd+V / Ctrl+V) flows through the browser's native paste event and is not captured by the
editor's key bindings.

### Saving

The editor saves with Ctrl+S or Cmd+S. The save writes the current buffer content to disk at the file's path. On success a "Saved" flash appears in the metadata header; on failure the server error message is shown and the dirty indicator remains. A dirty dot (●) appears next to the file name in the header whenever there are unsaved changes.

### Closing with unsaved changes

Closing an editor tab that has unsaved changes triggers a confirmation dialog: "Do you want to save changes to this file?" with three buttons — Save, Don't Save, and Cancel. Save is selected by default. The dialog appears whether the close comes from the tab strip's × button, the Cmd+W / Ctrl+W keyboard shortcut, or typing `close` / `exit` at the command line.

- **Save (y):** saves the file to disk, then closes the tab.
- **Don't Save (n):** closes the tab without saving.
- **Cancel (Esc):** dismisses the dialog and leaves the tab open with changes intact.

Like the quit dialog, the save dialog is modal — all keyboard and click input is trapped until a choice is made. A click outside the dialog does nothing.

### Caret

A blinking vertical bar marks the cursor position — where text will be inserted when typing. The caret is an accent-colored vertical line, 2 pixels wide, that blinks hard on/off on a 1-second cycle. It sits at the exact character column in the text flow without shifting the surrounding text. The caret is only visible when the editor tab is active; switching to another tab or opening a picker hides it.

### Syntax highlighting

The editor colors text by its syntactic role — keywords, strings, comments, and so on — for Markdown, JavaScript, TypeScript, and JSON files. The language is chosen by the file's extension (`.md`/`.markdown`, `.js`/`.mjs`/`.cjs`/`.jsx`, `.ts`/`.tsx`/`.mts`/`.cts`, `.json`); files with any other extension, or no extension, render as plain text, exactly as before.

Highlighting recomputes immediately when a file finishes loading, and shortly after each edit (a brief pause after typing stops, so keystrokes are never slowed down by it). Highlighting is skipped — the file renders as plain text — for buffers larger than 10,000 lines or 1 MB, so opening a very large file never becomes sluggish.

One theme is active at a time, shared by every open editor tab. `syntax theme <name>` switches it; `syntax theme` alone opens a picker overlay listing every available theme, with the active one marked by a checkmark. Arrow keys move the selection, Return picks the highlighted theme, Escape closes the picker without changing anything, and clicking a row picks it directly. The chosen theme persists across restarts (see Application Config).

Highlighting composes with the existing caret and selection rendering: a token under the caret or inside a selection still shows the caret bar / selection background exactly as it would in unhighlighted text.

### Scrolling

The editor body scrolls vertically within the tab. After typing, the scroll position stays where it
was — the view does not jump to the top of the document.

After any cursor movement (typing, arrow keys, mouse click, page up/down), the caret is scrolled
into view to ensure it remains visible. Moving the cursor to a different line or column triggers the
scroll; staying in position does not.
