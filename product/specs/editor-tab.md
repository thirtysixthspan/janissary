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
the new editor tab, and keyboard focus lands in the buffer once its content has loaded, with the
cursor on the first line (or the requested line, if one was given). If a file is already open in an
editor tab, opening it again focuses the existing tab instead of creating a duplicate. If the new
open request includes a line number, the existing tab's cursor moves to that line.

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
repeat event. Shift+←/→ is the one exception: like everywhere else in the app, it switches tabs
(see Tabs) rather than extending the selection horizontally. Shift+↑/↓ is unaffected and still
extends the selection vertically, since there is no competing tab-switch binding on those keys.

A line too long to fit the editor's width soft-wraps across several visual rows. Pressing ↑/↓ (or
Ctrl+P/Ctrl+N) moves the cursor one visual row at a time, so a wrapped line takes as many presses
to cross as it has visual rows, matching how the line actually appears on screen. Once the cursor
reaches the wrapped line's first or last visual row, the next ↑/↓ press continues into the
neighboring line, same as for unwrapped lines.

Clicking anywhere in the editor body — including empty space below the last line — keeps the textarea focused so keyboard input continues to work. Clicks on text lines move the cursor; clicks on empty space do not change cursor position but do not disarm the editor.

During IME composition, key events are deferred to the compositing text input and are not processed
as editor actions until composition ends.

Paste (Cmd+V / Ctrl+V) flows through the browser's native paste event and is not captured by the
editor's key bindings.

### Saving

The editor saves with Ctrl+S or Cmd+S. The save writes the current buffer content to disk at the file's path. On success a "Saved" flash appears in the metadata header; on failure the server error message is shown and the dirty indicator remains. A dirty dot (●) appears next to the file name in the header whenever there are unsaved changes.

### Live draft sync

As the buffer changes, the editor keeps the server updated with the current in-progress content
shortly after typing pauses, so the server holds a transient copy of the unsaved buffer without the
user having to save. The sync is debounced — it happens a moment after editing stops rather than on
every keystroke — and covers every way the buffer changes, including typing, paste, undo/redo, and
an automatic reload of an external change. Pure cursor movements and selections do not trigger a
sync, since the text itself is unchanged.

This draft copy is entirely transient and server-side: it is never shown back in the editor, never
written to disk, and never persisted or restored on `--relaunch`. A successful save clears it, since
the saved file is then the current content; further editing builds a fresh draft again. If the
connection drops, a lost sync simply leaves the server's copy stale until the next buffer change.

The one consumer of this draft is a monitor watching the tab (see [[monitoring]]): it is fed the
draft so it can see unsaved changes without a save, even though the draft is never shown back in the
editor itself.

### Closing with unsaved changes

Closing an editor tab that has unsaved changes triggers a confirmation dialog: "Do you want to save changes to this file?" with three buttons — Save, Don't Save, and Cancel. Save is selected by default. The dialog appears whether the close comes from the tab strip's × button, the Cmd+W / Ctrl+W keyboard shortcut, or typing `close` / `exit` at the command line.

- **Save (y):** saves the file to disk, then closes the tab.
- **Don't Save (n):** closes the tab without saving.
- **Cancel (Esc):** dismisses the dialog and leaves the tab open with changes intact. Focus returns to the editor at the current cursor position.

Like the quit dialog, the save dialog is modal — all keyboard and click input is trapped until a choice is made. A click outside the dialog does nothing.

Typing `quit`, or closing the last remaining tab, does not go through this per-tab dialog — see `quit-confirmation.md` for the whole-app unsaved-changes prompt shown in that case. Closing the actual browser tab or window (not through the app itself) shows the browser's own native "leave site?" confirmation instead, if any editor tab has unsaved changes.

### Live reload of external changes

While an editor tab is open, its underlying file is watched for changes made by other processes
(outside the app). If the buffer has no unsaved changes, an external change is loaded automatically
— the buffer refreshes to the new on-disk content and the cursor stays on the same line. The
editor's own saves never trigger this reload; only changes made elsewhere do.

If the buffer has unsaved changes when an external change is detected, the buffer is left alone —
the user's in-progress edits are never overwritten silently. Instead, the next time the user tries
to save (Ctrl+S / Cmd+S, or via the close-tab save prompt), a dialog appears: "This file changed on
disk. Overwrite it with your changes?" with two options — Overwrite and Cancel.

- **Overwrite (y):** writes the buffer to disk, replacing the external change.
- **Cancel (Esc):** dismisses the dialog and leaves the buffer as-is, still unsaved. The next save
  attempt shows the same prompt again.

Like the other editor dialogs, this prompt is modal — all keyboard and click input is trapped until
a choice is made, and a click outside the dialog does nothing.

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

Switching away from an editor tab and back leaves its scroll position exactly as it was, even if the
cursor is outside the visible viewport when the tab was left. Returning to the tab does not snap the
view back to the caret — only an actual cursor movement while the tab is active does that.

Clicking a `path:line` link in the transcript (see Transcript) opens the editor with the cursor
already on the target line, scrolled to the middle of the tab so the surrounding context is visible
on first open. Subsequent cursor movement in that tab follows the normal into-view scrolling above.
