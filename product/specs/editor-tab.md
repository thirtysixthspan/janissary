# Editor Tab

An **editor tab** displays a plain-text file opened with the `edit` or `open` command, using the
editor opener (see Open). It is a non-agent **view tab**: the file's text is shown as an editable
buffer in place of the usual transcript and command bar, controlled by direct keyboard input and
mouse selection. It behaves like a markdown tab — same lifecycle and tab-strip treatment — differing
in the editable content and keyboard handling.

When the `edit` command runs, a transcript entry for the command appears in the originating tab
before the editor tab opens and takes focus. The command text is recorded as the entry's input; the
output is empty since the editor tab is the side-effect.

Profiles may also open an editor tab through their `editors` configuration. Those tabs follow the
same file, line-targeting, missing-file, and duplicate-file behavior, while profile launch chooses
the final active main-area tab from its configured focus settings.

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

- **Metadata header** — a single row showing the file's name, size, and location.
- The metadata header has a save button and a connections-status button aligned to the right,
  together in that same row. The save button is enabled when the buffer has unsaved changes and
  disabled and dimmed when the buffer is clean. The connections-status button opens the tab's
  connections window (see [[connection]]) and is dimmed and inert when no persona connection is
  open.
- **Editor body** — fills the remaining space. Scrolls independently.

### Focus protection

Clicking in the editor body outside any text line (blank space below the last line) must not steal
focus from the hidden textarea. A plain click in the metadata header restores textarea focus on
mouse-up, so the cursor position and keyboard input remain uninterrupted. Drag-selecting metadata
text leaves focus alone instead, preserving the native selection so it can be copied.

### New files

The `edit <file>` command can open a path that does not yet exist on disk. The editor opens with
an empty buffer showing the file's name, a size of "unknown", and the resolved path in the metadata
header. The file is not written to disk until the user explicitly saves (Ctrl+S / Cmd+S). On the
first save, the file is created at the given path and the size display updates to reflect the new
on-disk size. Subsequent saves overwrite the file as usual.

Opening the same not-yet-existing path more than once (for example, creating several new files in
the same directory from the file navigator without renaming any of them) does not focus an
existing tab the way opening an already-existing file would — each open creates its own new,
independent unsaved tab, since none of them has a real file to converge on yet.

Editing an editor tab's label never sets a display-only alias (unlike other tab kinds, see Tabs →
"Tab display alias") — it always sets the underlying file's name itself, literally: typing `notes`
targets a file named exactly `notes` (no extension is appended), and typing `notes.txt` targets
`notes.txt`. For a not-yet-saved new-file tab this just updates the pending target path; once the
file exists on disk (whether it was a new file that has since been saved, or an editor opened on a
file that already existed), renaming the tab renames the file in place and the editor stays pointed
at the new path. Renaming never reloads the document: any unsaved content, dirty state, cursor, and
undo history remain in the live editor buffer, and the next save writes that content to the renamed
path. Once the rename commits, keyboard focus returns to the editor buffer so the user can keep
typing immediately, without needing to click back into it.

Renaming the same file from the file navigator instead (see `file-tree-tab.md`) has the same
effect on an already-open editor tab: its name and path update to match, with its unsaved content,
dirty state, cursor, and undo history preserved exactly as above — the buffer is never reloaded.

If the user never renames a new-file tab and saves while a file named the same as the pending
target already exists in that directory (created by another new-file tab saved first), the save
does not overwrite it — it silently picks the next free name in the same directory (`untitled.md` →
`untitled-2.md` → `untitled-3.md`, …) and updates the tab's displayed name and path to match. This
only applies to a new-file editor's still-unsaved target; once any file has been saved, further
saves on that tab overwrite it normally, exactly like any other editor tab.

### Keyboard input

Printable characters (letters, digits, symbols, and space) and special keys (arrows, page up/down,
home, end, enter, tab, backspace, delete, escape) are handled by the editor. Pressing and holding
a printable key repeats the character — the key press is applied directly to the buffer on each
repeat event. Shift+←/→ extends the selection horizontally, exactly like Shift+↑/↓ extends it
vertically; switching tabs while the editor has focus uses Cmd+Shift+[ / Cmd+Shift+] instead (see
Tabs), so the horizontal and vertical arrow pairs behave consistently.

A line too long to fit the editor's width soft-wraps across several visual rows. Pressing ↑/↓ (or
Ctrl+P/Ctrl+N) moves the cursor one visual row at a time. Normal text wraps at whitespace so a word
is never split merely because it reaches the edge; a single unbroken token wider than the available
space may break to prevent horizontal overflow. A wrapped line takes as many presses
to cross as it has visual rows, matching how the line actually appears on screen. Once the cursor
reaches the wrapped line's first or last visual row, the next ↑/↓ press continues into the
neighboring line, same as for unwrapped lines.

Clicking anywhere in the editor body — including empty space below the last line — keeps the textarea focused so keyboard input continues to work. Clicks on text lines move the cursor; clicks on empty space do not change cursor position but do not disarm the editor.

During IME composition, key events are deferred to the compositing text input and are not processed
as editor actions until composition ends.

Paste (Cmd+V / Ctrl+V) flows through the browser's native paste event and is not captured by the
editor's key bindings.

### Saving

The editor saves with the metadata header's save button or Ctrl+S / Cmd+S. The save writes the
current buffer content to disk at the file's path. On success a "Saved" flash appears in the
metadata header; on failure the server error message is shown and the save button remains enabled.

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

Keyboard cursor movement keeps this scrolling smooth at the edges of the view. When the caret sits
on the first or last visible row, or has been scrolled out of view entirely (for example with the
mouse wheel), pressing ↑/↓ moves the cursor a single line from where it was and the view scrolls to
bring the caret back into sight — the cursor never jumps to the start or end of the document from
an arrow press.

Switching away from an editor tab and back leaves its scroll position exactly as it was, even if the
cursor is outside the visible viewport when the tab was left. Returning to the tab does not snap the
view back to the caret — only an actual cursor movement while the tab is active does that.

Clicking a `path:line` link in the transcript (see Transcript) opens the editor with the cursor
already on the target line, scrolled to the middle of the tab so the surrounding context is visible
on first open. Subsequent cursor movement in that tab follows the normal into-view scrolling above.

### GitHub syncing

A file whose project-relative path is covered by the application config's sync-paths setting (see
Application Config) is kept automatically synced with its `origin/master` branch. Syncing is
entirely config-driven — there is no button or toggle anywhere in the editor to turn it on or off
for a file; a file syncs if and only if its path is covered by that setting. Each entry in the list
is either an exact file path, a directory path written with a trailing slash (covering every file
under that directory, at any depth), or a wildcard pattern using `*` to stand in for a single path
segment (for example `product/backlog/*` covers files directly inside that directory but not in a
subdirectory of it, while `product/plans/*/*` covers files exactly two directories deep).

Every config-listed file is edited from inside a single shared workspace dedicated to syncing,
separate from the main project checkout and from any agent workspace. This shared workspace is
created the first time any config-listed file is opened, and is reused for every other config-listed
file opened afterward — opening a second synced file never creates a second copy of the shared
workspace. It persists for the life of the application, not just for as long as any one synced tab
stays open.

If the shared workspace does not exist yet when a synced file is opened, its editor tab opens
immediately showing a loading state instead of content, and only loads the file's real content once
the workspace is ready. Opening a synced file — or another synced file finishing a save — also pulls
the latest `origin/master` into the shared workspace; any other open, unmodified synced tab whose
file changed as a result refreshes automatically, exactly like an ordinary external file change (see
"Live reload of external changes"). A synced tab with unsaved changes is left alone, same as always.

Saving a synced file writes and confirms the save exactly as an ordinary save does — the "Saved"
flash is not delayed by anything that happens next. After that, the change is committed with the
message `sync: <filename>` (the saved file's name), the shared workspace is brought up to date with
`origin/master`, and the commit is pushed. If updating with `origin/master` finds a conflicting
change, the remote version always wins automatically; there is no merge-conflict prompt to resolve.

The metadata header's connections-status button area also shows a read-only status icon for a synced
file, reflecting whether that file's sync is currently being provisioned, syncing, synced, or has hit
an error — it has no click behavior. A sync error (for example a network problem, an authentication
failure, or a project whose default branch is not literally named `master`) never blocks editing or
shows a dialog; it only changes the status icon and is otherwise reported through the notifications
tab.

### In-editor persona suggestions

An editor tab can ask an AI persona for a change to the text it is editing and apply the answer
inline, without leaving the buffer and without opening a monitor reporting tab (see [[monitoring]]
for that separate, batched flow — both read the same live buffer, but this one is a single-shot
request fired directly from the editor).

A request is entered in an ephemeral agent query line, not as buffer text. Pressing `>` while the
caret sits at the very start of an otherwise-empty line opens the query line inline, right at that
line's on-screen position, visually distinct from ordinary buffer rows — including showing no line
number in its gutter, unlike every ordinary row. Lines after the query row keep the gutter numbers
they would have shown if the query row's line were not present, so the query reads as an insertion
between two lines of real text rather than a replacement of one of them; typing `>` anywhere else —
mid-line, after other text, or when it would replace a selection — inserts a literal `>` exactly as
before. Because the query line is not buffer text, it is never saved to disk, never counted toward
whether the tab is dirty, and never sent to a monitor watching the buffer's live draft; opening,
typing in, or closing it leaves the buffer exactly as it was. One consequence of triggering only on
an empty line: a Markdown blockquote whose `>` is meant to be the very first character of an empty
line can't be typed by pressing `>` first — type the blockquote's body first, then insert the
leading `>` once the line is no longer empty.

Editing the buffer and editing the query line are interchangeable while the query line is open:
clicking into the buffer moves keyboard focus there so ordinary typing edits the document, and
clicking back into the query row moves focus back to it, all without closing the query line or
losing either one's text. Only whichever one currently holds focus shows a caret.

The query line shows a `>` prompt marker. The request itself follows the same shape as before: the
name of an available persona immediately after the `>`, then the request text, for example
`> assistant rewrite this paragraph in one sentence`. Typing `>>` at the start of the query is a
shorthand for `> assistant`, naming that persona without typing its name out. The personas offered
here are the ones written for in-editor requests, a separate set from the personas `monitor`
offers — a persona made for watching a transcript and one made for editing a buffer are different
jobs. While the caret sits in the persona-name word right after `>`, pressing Tab completes it
against the available persona names — this is the only place the editor completes anything; it
does not add general word-completion elsewhere in the buffer. Once the query is a complete, runnable
request, pressing Tab anywhere else on it instead moves keyboard focus to its status pill,
highlighting it; pressing Enter while the pill holds focus sends the request, the same as clicking
it. Any other key clears the pill's focus and returns to ordinary editing of the query text.
Shift+Enter inserts a line break in the query instead of sending the request, so a query can span
several lines; a paste or IME commit while the query line is focused lands in the query text rather
than the buffer.

Apart from Tab and Enter, the query line accepts the same keybindings as the main buffer:
Left/Right/Home/End and Backspace/Delete edit the query text; Cmd+S (Ctrl+S) saves the editor file,
the same as saving from the buffer; Cmd+Z (Ctrl+Z) undoes and Shift+Cmd+Z (Shift+Ctrl+Z) redoes,
scoped to the query line's own edits — a fresh query line never inherits undo history from a
previous, already-closed one; Cmd+A (Ctrl+A) selects all of the query text; Cmd+C/Cmd+X
(Ctrl+C/Ctrl+X) copy and cut the selection; and Cmd+Left/Right/Up/Down and the Ctrl emacs subset
move the caret the same way they do in the buffer.

Up/Down arrows move the cursor within the query's lines when there is a neighboring query line to
move to. Pressing Up on the query's first line, or Down on its last line, instead moves keyboard
focus into the buffer, landing on the line just above (Up) or below (Down) the query's anchor line,
at the same column — the same as if the query line weren't there. The reverse works the same way:
pressing Up or Down in the buffer, when it would land the cursor exactly on the query's anchor
line, instead moves focus into the query line, landing on its last line (moving up) or first line
(moving down) at the same column. Either direction is a no-op where there's no line to cross onto —
Up/Down at the query's edge when the anchor sits at the document's first or last line, same as
before.

Pressing Enter, Ctrl+Enter (Cmd+Enter on macOS), or clicking the `run` pill all send the request
once it is a valid `> <persona> <prompt>`; any of them while the query isn't yet runnable is a
no-op — Enter in the query line never inserts a buffer newline, since keyboard focus is in the
ephemeral query, not the buffer. Escape closes the query line at any point, discarding whatever was
typed and returning keyboard focus to the buffer at the line the query was anchored to, with nothing
inserted. If a request had already been sent and is still awaiting a reply, closing with Escape
discards that reply when it arrives — no pending review panel opens from it. The named persona is
primed with the editor's current buffer content exactly as it
stands at that moment — including any unsaved edits, and excluding the query text itself, since it
was never part of the buffer — plus the request text.

The first request to a given persona in an editor tab opens a connection to that persona, which
stays open for the rest of that tab's life; every later request to the same persona in that same
tab reuses the same connection rather than starting a fresh one, and the persona's replies can draw
on what it said earlier in the tab, the same as a multi-turn conversation. As with any multi-turn
conversation, the persona's full instructions are only needed once: only the first request on a
connection includes them, while every later request on that same connection sends just the current
buffer content and the new request text. A request to a different persona in the same tab opens its
own separate connection alongside it. These connections appear in the tab's connections window (see
[[connection]]) and are closed automatically when the editor tab itself is closed, or manually from
the connections window at any point — closing a connection and firing a new request to that persona
starts over with a fresh connection, primed again from the top.

The persona may propose one or more edits anywhere in the file, not only at the request line's own
location. Every proposed change previews inline at once, directly in the buffer at the position it
would apply: the lines it would remove are struck through in the diff "remove" color, immediately
followed by the lines it would insert, shown in the diff "add" color with a `+` in place of a line
number. When two or more changes are proposed at once, a banner above the buffer reads "Accept or
decline each change below" along with a count of how many of the proposed changes remain unresolved;
when only a single change is proposed, the banner is not shown — its own inline accept/decline icons
are the only affordance needed.

Each proposed change's inserted lines carry their own thumbs-up/thumbs-down icon pair, right-aligned
on the last inserted line — the same icons and click-to-resolve interaction as a monitor reporting
tab's suggestion (see [[monitoring]]). Clicking thumbs-up applies that one change; thumbs-down drops
it; either resolves that change independently of any others still pending, which keep previewing
until resolved in turn — there is no required order. While any change is pending, every keystroke
other than the accept/decline clicks is suppressed rather than reaching the buffer, so editing is
blocked until the whole set is resolved. Switching to another tab and back leaves the pending set
exactly as it was.

Only one request may be in flight (or awaiting resolution) per editor tab at a time; firing another
request while a suggestion is still pending is ignored until the current one is fully resolved.

Once every proposed change has been accepted or declined, the query line closes only if at least one
change was accepted. If every change was declined, or the persona had nothing to propose, the query
line stays open with its text intact so it can be edited and retried.

If the named persona doesn't exist, the request fails, or the persona's reply proposes no change at
all, a notification appears in the notifications tab naming the persona and the outcome, and the
buffer and the query line's text are left untouched.

A status pill, styled as a colored badge (matching the agent-color badge shown on a cross-tab
notification) and right-aligned at the end of the row, is rendered on the query line, tracking its
progress: `agent?` before a known persona has been named, `query?` once the persona is named but
no request text has been typed yet, and `run` once both are present — clicking `run` sends the
request, the same as pressing Ctrl+Enter (Cmd+Enter on macOS), or pressing Enter while the pill
holds keyboard focus (see above). While the request is in flight the pill reads `running...`; if
the reply proposes no change at all, it reads `no suggestion` until the query is edited. While a
proposed change is pending accept/decline, the pill is hidden — the pending-change prompt above the
buffer is the request's state at that point, and the buffer's own caret is suppressed while the
query line holds keyboard focus.

Nothing about an in-editor suggestion is saved or restored — like the rest of an editor tab's state,
it exists only in memory for as long as the tab is open. The query line follows the same rule: it is
never persisted or restored across a relaunch.
