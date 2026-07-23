# File Tree Tab

A **file tree tab** shows a directory tree, opened with `files [path]`. It is a non-agent **view
tab**: a keyboard-navigable tree of files and directories shown in place of the usual transcript
and command bar, controlled by direct interaction (clicking, arrow keys) rather than a command
line. It behaves like a markdown tab (see Markdown Tab) — same lifecycle and tab-strip
treatment — differing only in what fills the body and how that body is navigated.

When the `files` command runs, a transcript entry for the command appears in the originating tab
before the file tree tab opens and takes focus. The command text is recorded as the entry's input;
the output is empty since the file tree tab is the side-effect.

A file tree tab is created like an agent tab (see Tabs) — placed contiguously within the active
tab's group, inheriting that group's number and bar color and taking a distinct dot color. Focus
moves to the new file tree tab.

Unlike an agent tab, a file tree tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like markdown and image
tabs, it is not saved and is not restored on `--relaunch`.

### `files [path]`

`files` opens a tree rooted at the issuing tab's cwd; `files <path>` opens it rooted at `path`
instead (resolved against the issuing tab's cwd if relative). If the resolved target exists but is
not a directory, an error (`files: <path>: not a directory`) is appended to the issuing tab's
transcript and no tab is created.

If the resolved target does not exist yet, a file tree tab still opens immediately, showing
"Looking for `<path>`…" in place of the (empty) tree while it waits. The tab polls until the
directory is created, then populates with its contents and starts watching it like any other file
tree tab — no error, and no need to re-run `files`. Closing the waiting tab stops the poll.

If a file tree tab is already open on the same root, `files` **focuses that tab** instead of
opening a duplicate — there is one tree per root, the same way there is one Explorer per
workspace in a conventional editor.

### `files left`/`files right [path]`

A leading `left` or `right` keyword docks the tree into that sidebar instead of the central tab
strip — see `sidebars.md` for sidebar mechanics. The keyword is only recognized as the tree's
first word, so a directory literally named `left` or `right` is still reachable through a path
form (`files ./left`).

- **Bare `files [path]`** behaves exactly as above. If a tree on that root already exists and is
  currently docked, focusing it means **undocking it back to the center strip and making it
  active** — focusing a tree must make it visible somewhere the user is looking.
- **`files left [path]` / `files right [path]`**: if a tree on that root already exists (docked
  anywhere, or sitting in the strip), it **moves** to the requested sidebar. Otherwise a new tree
  is created exactly as `files [path]` would, then immediately docked. Either way, if the target
  sidebar already holds a different tree, that tree is **displaced back to the center strip**
  (non-destructive — nothing is closed as a side effect of docking).

### `files in <label>`/`files on <side>`

`files in <label>` opens (or focuses/redocks) a tree rooted at the cwd of the tab named `<label>`
instead of the issuing tab's own cwd. If no tab has that label, an error (`No tab named
"<label>".`) is appended to the issuing tab's transcript and no tree is opened or moved.

`files on left`/`files on right` is an explicit spelling of the same docking `files left`/`files
right` provides. The two clauses are independent and may be combined in either order — `files in
<label> on <side>` or `files on <side> in <label>` — to root the tree at another tab's cwd and dock
it in one command, e.g. `files in claude on left`. Like `left`/`right`, `in` and `on` are only
recognized as clause keywords, so a directory literally named `in` or `on` is still reachable
through a path form (`files ./in`).

### Opening from a tab's metadata row

Agent tabs and harness tabs carry a folder-icon file-navigator button in their metadata row (see "Metadata
row" in `tabs.md`). Clicking it opens a file navigator rooted at that tab's own working directory.
Unlike the bare `files` command — which opens into the center tab strip — a navigator opened this
way, when none is open yet, opens **docked in the left sidebar** by default.

If a file navigator is already open somewhere, clicking the button does not open a second one:
instead it **retargets the existing navigator** — the most recently focused one if more than one is
open — to the clicked tab's working directory, replacing its root in place. The retargeted tab keeps
its identity, its position, and its dock placement (a docked navigator stays docked where it was);
its expanded directories, and its move undo/redo history, are cleared, since they no longer apply to
the new root. Either way — fresh open or retarget — focus stays on the tab whose button was clicked;
opening or retargeting the navigator does not steal focus.

### Tree contents

The tree shows, for the root and every directory the user has expanded:

- **Directories before files**, each group sorted alphabetically, case-insensitive.
- **Default excludes**: `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db` (VS Code's `files.exclude`
  defaults) are never shown. Every other dotfile (`.env`, `.gitignore`, …) is shown.
- **Symlinks** (to a file or a directory) render as a leaf file — never expandable.

A directory's children are read from disk only once it is **expanded** — an unopened directory
(e.g. `node_modules`) costs nothing until the user opens it.

**Branch metadata.** When the tree is rooted inside a git repository, the tab's header shows the
currently checked-out branch name next to the root path. A detached-HEAD checkout shows `HEAD`. A
tree rooted outside any git repository, or where the branch cannot be determined, shows only the
path with no branch text. The branch refreshes together with the tree itself (on open, on reroot,
and on every automatic or interactive refresh), never on a timer of its own.

**Git-status coloring.** When the tree is rooted inside a git repository, a file row's name renders
in a color reflecting its git status: **green** when the file has staged changes (added to the
index, including a file that is staged and then further edited), **red** when the file has an
unresolved merge conflict, and **yellow** for anything else git considers changed — an unstaged
working-tree modification or an untracked (new) file. A directory row renders in the color of the
highest-priority state found among the files beneath it, at any depth — a conflict outranks a
staged change, which outranks a plain change — even inside a collapsed subtree that has not been
expanded, so changes are visible without walking the whole tree. Coloring reflects the git
repository containing the tree's own root, regardless of where that root sits relative to any other
open file navigator or the app's own working directory — each navigator's colors always match `git
status` run at its own root. The coloring refreshes together with the tree itself (on open and on
every automatic or interactive refresh), never on a timer of its own, and is computed without
blocking the interface. A tree rooted in a directory that is not part of a git repository, or where
git status cannot be determined, shows no coloring and no error.

### Watching

Every currently visible directory (the root, plus every expanded directory) is watched for
changes. When a watched directory's contents change — a file or directory appears, disappears, or
is renamed — the tree updates within about a second (changes are debounced so a burst of
filesystem activity, like a `git checkout`, coalesces into a single refresh). If an expanded
directory is deleted, it collapses automatically and its watcher stops; a tree with a broken
watcher (permission denied, exotic filesystem, file-descriptor limits) keeps working — it simply
stops refreshing automatically and can be refreshed manually by collapsing and re-expanding.

### Mouse interactions

| Interaction | Behavior |
|---|---|---|
| Click a directory row (anywhere on the row) | Select it and give the tree keyboard focus |
| Click a file row | Select it and give the tree keyboard focus |
| Double-click a file row | Select it and open it (with `open`) — for Markdown files, this opens the plain-text editor instead (with `edit`) |
| Double-click a directory row | Select it and toggle expand/collapse |
| Double-click the `..` row | Navigate the tree up one directory |
| Shift+double-click a file row | Select it and open it in the plain-text editor (with `edit`), even for files whose normal opener is a viewer (images) — for Markdown files, this instead opens the rendered preview (with `open`) |
| Chevron (a caret icon, pointing right when collapsed and down when expanded) | Visual affordance only — the whole row is the click target |
| Double-clicking any row | Does not select the row's text |
| Header collapse-all button | Collapse every expanded directory back to just the root |
| Scroll wheel / trackpad | Scrolls the row list |
| Click-drag a row and release it over a directory row, or any file inside that directory | Moves the dragged file or directory into that directory on disk |

Opening or editing a file from the tree uses the same `open`/`edit` commands available at any
command line, resolved against the tree's own root — never the currently focused tab's working
directory, which may point elsewhere. The opened file's tab lands in the same group as the tree
tab.

If a file has no registered opener, double-clicking it presents a chooser with **Edit as text** and
**Open externally**. Selecting an option runs that action for the file; Escape closes the chooser.

### Moving files by drag-and-drop

Pressing down on a row and dragging it onto a directory row — or onto any file row inside that
directory — then releasing, moves the dragged file or directory into that directory. While a drag
is in progress, a small label showing the dragged item's name follows the mouse cursor, indicating
which row is being moved. The directory currently targeted is highlighted on its own row, whether
the pointer is directly over that directory row or over one of the files inside it; empty space
shows no highlight, and releasing there does nothing. Dropping onto the dragged item itself, or
onto one of its own descendants (if it's a directory), is also blocked outright: no highlight is
shown, and releasing there does nothing. Releasing over a file at the root of the tree moves the
dragged item into the root itself — since the root has no row of its own, nothing highlights for
this target, but the move still happens.

Dropping the item back onto the directory it's already in — its own row, or any other row already
inside that same directory — is also a no-op: no confirmation dialog appears, and the file stays
exactly where it was.

If the target directory already contains an entry with the same name as the dragged item, the
move does not happen immediately. Instead a confirmation dialog appears, offering **Overwrite** or
**Cancel**. Confirming replaces the existing entry with the dragged one; cancelling leaves both
where they were, unmoved.

Only a single row can be dragged at a time — the tree has no multi-select. The tree already
watches every visible directory, so a completed move is reflected automatically once its watcher
picks up the change, the same as any other on-disk change made outside the app.

If the window loses focus while a drag is in progress — switching to another application or
virtual desktop with the mouse button still held — the drag is cancelled outright: the drag label
disappears and nothing is moved, the same as releasing over empty space.

Pressing Escape at any point during a drag also cancels it outright, with the same result: the
drag label disappears and nothing is moved.

### Dragging a row into the command bar

The same click-drag-release gesture used to move a file also has a second possible destination:
the command bar of whichever tab is active. Releasing a dragged file or directory row over that
command bar inserts its path at the current caret position — replacing any active selection, the
same as a normal paste — without moving the file on disk. The inserted path is relative to the
active tab's own working directory, not the tree's root, so it lines up with how that tab's own
commands (`open`, `edit`) already resolve relative arguments. While the drag is over the command
bar, it is highlighted the same way a valid directory drop target is; releasing over it never
triggers the file-move flow, and no move confirmation or conflict dialog can appear for it.

Both file and directory rows can be dropped this way. The path is inserted exactly as computed,
never wrapped in quotes, even when it contains spaces.

The command bar is only a valid drop target while it is actually visible for the active tab — it
is not present for a view tab (an image, a markdown preview, an editor, notifications, or the file
tree itself when that tree is the active, non-docked tab), for a harness tab, or while transcript
search has replaced it. Dragging over where the command bar would otherwise be in any of these
cases has no effect: no highlight, no insertion. In practice, dropping a row onto a command bar
therefore only happens when the file tree is docked into a sidebar while a different, plain tab is
active in the center — a docked tree's own active-tab command bar is never a target for itself.

### Undoing and redoing a move

A focused file tree tab captures `Cmd+Z` (`Ctrl+Z` on other platforms) to undo the most recent
move made in that tab, reversing it back to where the moved item came from; `Cmd+Shift+Z`
(`Ctrl+Shift+Z`) redoes, re-applying whatever undo just reversed. Each tab keeps its own stack of
past moves and a separate stack of undone moves, in memory only — both start empty when the tab
opens and are discarded when it closes; reopening a tree on the same root does not restore them.

Undo steps back through the stack one move at a time, oldest last; redo steps forward through
whatever was just undone, for as long as the tab has stayed open. Making a new move — whether by
drag-and-drop or by redoing — clears the redo stack: once the timeline diverges from an undone
move, that move is no longer reachable by redo. If there is nothing to undo, or nothing to redo,
the corresponding chord does nothing — no message, no dialog, no sound.

If an undo or redo would land on a path that already has an entry with the same name, the same
overwrite confirmation used for a drag-and-drop move appears, offering **Overwrite** or **Cancel**.
Confirming replaces the existing entry with the moved item and completes the undo or redo;
cancelling leaves both where they are, and the same undo or redo can be retried later.

Deletions are not covered by undo/redo — a deleted file or directory cannot be restored this way.

### Deleting a file or directory

Pressing Backspace or Delete while a row is selected (any row other than `..`) opens a
confirmation dialog: `Delete "<name>"?`, offering **Delete** and **Cancel**. Confirming removes the
file or directory — recursively, if it's a directory — from disk; cancelling leaves it untouched.
The tree already watches every visible directory, so the removed row disappears automatically once
the watcher picks up the change, the same as any other on-disk change made outside the app. If the
selected row was the one removed, selection moves to the nearest surviving row rather than pointing
at nothing.

### Renaming a file or directory

Pressing Cmd+R (Ctrl+R on other platforms) while a row is selected (any row other than `..`) turns
that row's name into an editable text field, pre-filled with the current name. Editing the name
and pressing Enter renames the file or directory on disk in place — only if the name actually
changed; an unchanged or empty/whitespace-only name is a silent no-op that just closes the field.
The rename stays within the same directory; typing a name with a path separator is not a way to
move the item elsewhere (drag-and-drop remains the only way to move an item into a different
directory). Escape, or the field losing focus, cancels and restores the original name with no
on-disk change. If the new name collides with a sibling already in the same directory, the same
Overwrite/Cancel confirmation dialog used for a drag-and-drop move appears; Overwrite replaces the
existing entry and completes the rename, Cancel returns to the still-open edit field. A rename is
not added to the tab's move undo/redo stack and cannot be reversed with Cmd+Z.

If the renamed file is already open in an editor tab, that tab updates to the new name and path
automatically — its unsaved content, dirty state, cursor, and undo history are preserved exactly as
when the same file is renamed from the editor tab's own label (see `editor-tab.md`).

After a successful rename, the renamed row remains selected and keyboard focus returns to the file
tree.

### Keyboard interactions

A focused file tree tab captures its own keys, following the ARIA treeview pattern (see
`keyboard-navigation.md`):

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move selection to the previous / next visible row |
| `→` | Collapsed directory: expand. Expanded directory: reroot. File: open. `..`: no-op |
| `←` | Expanded directory: collapse. Otherwise: move selection to the parent directory |
| `Enter` / `Space` | File: open. Directory: toggle expand/collapse. `..`: navigate to parent directory |
| `Shift+Enter` | File: open in the plain-text editor (mirrors Shift+double-click) |
| `Home` / `End` | Select the first / last visible row |
| `Page Up` / `Page Down` | Move selection by one viewport of rows |
| `Backspace` / `Delete` | Selected file or directory (not `..`): open a delete confirmation dialog |
| Printable characters | Type-ahead: jump to the next visible row whose name starts with what's typed; the typed buffer resets after a pause |
| `Cmd+Z` / `Ctrl+Z` | Undo the most recent move made in this tab |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo the most recently undone move |
| `Cmd+N` / `Ctrl+N` | Create a new file (see "Creating a new file") |
| `Cmd+R` / `Ctrl+R` | Selected file or directory (not `..`): begin renaming it in place (see "Renaming a file or directory") |

Chords carrying Ctrl or Cmd (tab switching, tab reordering, closing the tab, etc.) are not
captured by the tree and reach the normal window-level bindings instead, except for the
undo/redo chords, `Cmd+N`/`Ctrl+N`, and `Cmd+R`/`Ctrl+R` above, which the tree captures for
itself — the same way an editor tab captures its own `Cmd+Z`/`Cmd+Shift+Z` for text undo/redo.

If the selected row disappears (the directory watcher removed it), selection moves to the nearest
surviving row rather than pointing at nothing.

### Tab strip: name and close button

In the tab strip a file tree tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with three differences:

- **Placement.** A file tree tab is placed at the beginning of its tab group (other tab types land
  at the end), so the tree sits left of the content it navigates.

- **Name.** The tab label is always `navigator` (for the first tree tab; subsequent ones are (the tree's root path is shown in the tab's own
  header using the standard metadata display, not in the strip). The path is abbreviated using the
  `$root` and `~` shortcuts. Per
  [[tab-label-no-markers]], no type or status marker is appended.
- **Close button.** A close control is shown right-aligned within the tab, identical to other
  view tabs (markdown, image, editor).

While a file tree tab is **docked** into a sidebar (see `sidebars.md`), it leaves the tab strip
entirely — there is no duplicate representation of a docked tree in the strip.

### Header buttons

Every file tree tab's own header carries a **Search files** button, **New file** and **New
directory** buttons, and a **location button**. Search files opens the search pop-up — see
"Finding a file by name" below. New file opens a fresh, unsaved editor tab named `untitled.md`;
New directory creates a folder beside or inside the selected row — see the creating sections
below. The location button cycles the tree through left sidebar → center tab strip → right sidebar → left
sidebar, one step per click, with a tooltip naming the destination. The header itself carries no
close button — while docked, the sidebar's own strip (see `sidebars.md`) shows the tab's name and
the close affordance, so a docked tree is closed from there (`close files` by label still works as
a fallback).

When the tree is rooted inside a git repository whose `origin` remote points at GitHub, the header
also carries a **GitHub** button, shown before Search files. Clicking it opens that repository's
commits page for the currently checked-out branch (for example
`https://github.com/thirtysixthspan/janissary/commits/master/`) in an in-app page tab — the same
kind of tab the `open` command opens a URL into — not a native browser tab. The button is absent
when there is no `origin` remote, the remote isn't a `github.com` URL, or the current branch can't
be determined — the same quiet degradation as the branch text. It refreshes together with the
branch metadata above.

### Finding a file by name

Clicking the header's **magnifying-glass** button opens a small search pop-up with a single text
input. As the user types part of a filename, the input shows an inline ghost completion of the
single best-matching file when its name starts with what's typed, and a line below the input shows
that match's full path relative to the tree root, prefixed with `> ` (for example, `> src/tasks.md`).
Matching is a case-insensitive substring on the
filename only (not the full path), with a filename-prefix match ranked ahead of any other substring
match; ties are broken by the shortest path. The searchable set is every file under the tree's root
that is not excluded by `.gitignore` (or, outside a git repository, the same default excludes the
tree itself applies) — matching how a conventional editor's "Go to File" behaves. There is no
results list; only the single top match drives the ghost text and the path line.

An empty query shows neither ghost text nor a path line. A query with no matches shows
`(no matching files)` in place of the path line, with no ghost text, and `Enter` does nothing.
While the candidate list is still loading, the path line reads `Searching…`.

Pressing `Tab` accepts the ghost completion into the input without closing the pop-up. Pressing
`Enter` acts on the current top match: it closes the pop-up, expands every ancestor directory of
the match in the tree, selects that file's row, and scrolls it into view. Pressing `Escape`, or
clicking outside the pop-up, closes it with no change to the tree and returns focus to the tree.

### Creating a new file

Clicking the header's **New file** button, or pressing `Cmd+N` (`Ctrl+N`) while the navigator has
keyboard focus, opens a fresh, unsaved editor tab named `untitled.md`. The target directory comes
from the tree's current keyboard-cursor selection: a selected directory row creates the file
inside that directory; a selected file row creates it in that file's containing directory; no
selection (or the `..` row) creates it at the tree root. If the target directory already contains
a file named `untitled.md` on disk, the next free name is opened instead (`untitled-2.md`,
`untitled-3.md`, …), so New file always opens a fresh, uncreated file rather than reopening an
existing one.

The user names the file by editing the new editor tab's label — the typed text becomes the
filename literally, with no extension appended (see Editor Tab → "New files"). On save, if the
directory already contains a file with that name because the tab was never renamed and another
new-file tab already saved to it first, the save silently writes to the next free name
(`untitled-2.md`, `untitled-3.md`, …) instead of overwriting anything, so several new-file tabs can
be created and saved side by side without colliding.

### Creating a new directory

Clicking the header's **New directory** button creates a directory named `untitled`. It uses the
same target rule as New file: a selected directory row creates inside that directory, a selected
file row creates in its containing directory, and no selection (or the `..` row) creates at the
tree root. If `untitled` already exists at the target, the new directory uses the next free name
(`untitled-2`, `untitled-3`, …). The tree refreshes to show the created directory. New directory
has no keyboard shortcut.

When the new directory (named exactly `untitled`, with no collision) appears in the tree, it is
selected automatically and its rename field opens immediately, pre-filled with `untitled`, so the
name can be typed over right away without a separate select-then-rename step (see "Renaming a file
or directory"). If a collision meant the directory was created under a different name
(`untitled-2`, …), it is not auto-selected or auto-renamed — the user selects and renames it like
any other row.

This same dock/location-cycle mechanism is shared with the notifications tab (see
`notifications.md`), which is the other dockable tab kind. The two can share one sidebar side at
the same time, switching between them via the sidebar's own tab-switcher (see `sidebars.md`'s
"Sharing a sidebar"); a second file tree tab docking into the same side still displaces the first.

### Closing

Closing a file tree tab (via its close button, the `close` command, or app shutdown) stops every
watcher it opened. Because a file tree tab owns no shell, agent session, browser, or workspace,
the rest of ordinary tab teardown simply does nothing for it. Closing the last remaining tab quits
the app, exactly as the `close` command does elsewhere (see `tabs.md`).

### Reordering and grouping

A file tree tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous
within it (see Tabs → Tab grouping), and can be reordered within its group like any other tab.
This applies while it sits in the strip; a docked tree keeps its group membership latent and
returns to its position on undock.
