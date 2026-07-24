# File navigator

`files` opens a directory tree in its own tab:

```
files            rooted at the tab's working directory
files src        rooted at src
files left       rooted at the working directory, docked in the left sidebar
files right src  rooted at src, docked in the right sidebar
```

Directories sort before files, both alphabetically. Version-control clutter (`.git` and friends, `.DS_Store`) is hidden; every other dotfile shows. A directory's contents are only read when you expand it, so a huge `node_modules` costs nothing until opened. The tab is labeled `files` in the strip and placed at the *start* of its group, so the tree sits left of the tabs it opens — except while docked to a sidebar, when it leaves the strip entirely (see below).

If a tree is already open on the same root, `files` focuses it rather than opening a duplicate — or, with `left`/`right`, moves it into that sidebar. A target that isn't a directory prints `files: <path>: not a directory`. A target that doesn't exist *yet* still opens a tab, showing "Looking for `<path>`…" until the directory shows up — handy for pointing a navigator at a directory a build or clone is about to create.

![A file navigator tab: a directory tree with one directory expanded and a row selected.](/screenshots/file-navigator.png)

## Opening from a tab's metadata row

Every agent tab and harness tab has a 📁 button on the right of its metadata row (tooltip "Open file navigator here"). Clicking it opens a file navigator rooted at that tab's own working directory — a one-click alternative to typing `files in <label>`. Shell tabs don't have this button.

Unlike the bare `files` command, which opens into the center tab strip, a navigator opened from the button — when none is open yet — opens **docked in the left sidebar** by default. If a navigator is already open, clicking the button doesn't open a second one: it **retargets the existing navigator** (the most recently focused one, if you have more than one) to the clicked tab's working directory, leaving it exactly where it sits — docked or not. Either way, focus moves to the navigator.

## Docking to a sidebar

A file navigator can live in three places: the central tab strip (the default), the left
sidebar, or the right sidebar. `files left [path]` and `files right [path]` open (or move) a
tree straight into that sidebar; a directory literally named `left` or `right` is still reachable
with a path form, e.g. `files ./left`.

While docked, the tree leaves the tab strip and appears in its sidebar instead. Drag the
up/down-arrow button at the right of the sidebar's tab gutter to resize it. Only one tree can be docked per sidebar — docking a
second one into an occupied side sends the first back to the center strip rather than
closing it. A docked tree is never the active tab; `files <same path>` (no `left`/`right`) brings
it back to center and focuses it. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

The sidebars are shared with the [notifications](/user-documentation/tab-types/notifications) feed and the
[schedules](/user-documentation/automation/scheduling) tab, which dock the same way — a sidebar can hold a
tree together with a notifications feed and/or a schedules tab, all at once, side by side in that
sidebar's own tab strip. Docking a second tree into an already-occupied side displaces the first
tree back to center; it never displaces a different kind. See
[Tabs](/user-documentation/getting-started/tabs) for how a shared sidebar's strip works.

![A file navigator docked in the left sidebar, with its resize divider on the right edge.](/screenshots/file-navigator-sidebar.png)

## Opening the repository on GitHub

When the tree is rooted inside a git repository whose `origin` remote points at GitHub, its header shows a **GitHub** button (tooltip "Open on GitHub") before the search button. Clicking it opens the repository's commits page for the branch you currently have checked out, in a page tab inside the app rather than your OS browser.

The button doesn't show up for a directory with no `origin` remote, a remote that isn't a `github.com` URL, or a branch the app can't determine. It refreshes along with the rest of the header whenever the tree does.

## Finding a file by name

Click the header's magnifying-glass button to open a search pop-up. Type part of a filename and the input shows a ghost completion of the best-matching file, with its full path (relative to the tree root) below, prefixed with `> ` — for example, `> src/tasks.md`. Matching is a case-insensitive substring on the filename, with a name that starts with what you typed ranked first; only the single top match is shown, there's no results list.

Press `Tab` to accept the ghost completion into the input without closing the pop-up. Press `Enter` to jump to the top match: it expands every ancestor directory, selects the file's row, and scrolls it into view. Press `Escape`, or click outside the pop-up, to close it without changing the tree. An empty query shows nothing below the input; a query with no matches shows `(no matching files)` instead of a path.

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

## The tree stays current

Every visible directory is watched: files that appear, disappear, or get renamed show up in the tree within about a second, even during a burst of changes like a `git checkout`. If watching stops working for a directory (permissions, exotic filesystems), the tree keeps working — collapse and re-expand to refresh by hand.

Inside a git repository, a file's name is colored by its git status: **green** for a staged change, **red** for an unresolved merge conflict, and **yellow** for anything else changed — an unstaged modification or an untracked file — the same way an editor's Explorer highlights dirty files. A directory takes the color of the most urgent status found beneath it (a conflict beats a staged change, which beats a plain change), even deep inside a collapsed folder, so you can spot changes without expanding everything. Coloring always reflects the git repository the navigator's own root sits in, so it stays accurate when you have more than one navigator open on different folders or repositories. This coloring refreshes along with the tree. A directory that isn't in a git repository simply shows no coloring — nothing is colored and no error appears.

## Mouse

| Interaction | Behavior |
|---|---|
| Click a row | Select it |
| Double-click a file | Open it (same as `open`) |
| `Shift`+double-click a file | Edit it (same as `edit`), even if its normal opener is a viewer |
| Double-click a directory | Expand or collapse it |
| Double-click the `..` row | Re-root the tree one directory up |
| Header ⊟ button | Collapse everything back to the root |
| Header ⇄ button | Cycle location: left sidebar → center tab strip → right sidebar → left sidebar |
| Header × button | Shown while docked; closes the tree (a docked tree has no strip × of its own) |
| Press a row, drag, and release over a directory (or any file inside it) | Moves the dragged file or directory into that directory on disk |

Files opened from the tree land in the same [group](/user-documentation/getting-started/groups) as the tree tab —
including while the tree is docked to a sidebar; opened files still land in that group.

If a file type has no built-in opener, double-clicking the file shows a picker with **Edit as text**
and **Open externally**. Choose the action you want, or press `Escape` to close the picker.

## Moving files by drag-and-drop

Press down on a row, drag it onto a directory row (or any file row inside that directory), and release to move the dragged file or directory into that directory. A small label follows the cursor while you drag, and the targeted directory highlights. Dropping onto the item itself, one of its own descendants, or the directory it's already in does nothing. If the target already has an entry with the same name, a dialog offers **Overwrite** or **Cancel** instead of moving right away. Releasing over empty space, losing window focus mid-drag, or pressing `Escape` cancels the drag with nothing moved.

Only one row can be dragged at a time — the tree has no multi-select.

You can also drag a row onto the command bar of the active tab to insert its path at the cursor, without moving the file. This only works while the tree is docked to a sidebar and a different tab is active in the center, since a non-docked tree has no other tab's command bar to drop onto.

## Creating files and directories

Click the header's **New file** button, or press `Cmd+N` (`Ctrl+N`) while the tree has keyboard focus, to open a fresh, unsaved editor tab named `untitled.md`. The target directory follows your current selection: a selected directory creates the file inside it, a selected file creates it in that file's directory, and no selection (or the `..` row) creates it at the tree root. If that directory already has an `untitled.md`, the next free name opens instead (`untitled-2.md`, and so on).

Rename the new tab's label to name the file — the typed text becomes the filename, with no extension added. Saving writes to that name; if another new-file tab already saved to it first, your save silently falls back to the next free name instead of overwriting it.

Click the adjacent **New directory** button to create a folder using the same selection rules. It is named `untitled`, or the next available name (`untitled-2`, and so on) if that name already exists. When the new `untitled` directory appears, it's selected automatically and its name is ready to edit right away; if a naming collision gave it a different name instead, select and rename it yourself.

<img class="agent-float left" src="/agents/fariz-south.png" alt="" />

## Renaming a file or directory

Press `Cmd+R` (`Ctrl+R`) while a row other than `..` is selected to turn its name into an editable field, pre-filled with the current name. Edit it and press Enter to rename the file or directory on disk in place — an unchanged or empty name is a no-op that just closes the field. Escape, or clicking elsewhere, cancels without changing anything. If the new name collides with a sibling already in that directory, the same Overwrite/Cancel dialog used for drag-and-drop moves appears. A rename doesn't join the undo/redo history described below.

If the renamed file is already open in an editor tab, that tab's name and path update automatically, with unsaved content and cursor position preserved.

## Keyboard

A focused tree captures these keys for itself (tab-switching and other `Ctrl`/`Cmd` chords still work):

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move the selection |
| `→` | Expand a collapsed directory; from an expanded one, re-root the tree there; open a file |
| `←` | Collapse an expanded directory; otherwise jump to the parent |
| `Enter` / `Space` | Open a file, toggle a directory, or (on `..`) go up |
| `Shift+Enter` | Open the selected file in the editor |
| `Home` / `End` | First / last visible row |
| `PageUp` / `PageDown` | Move by a screenful |
| Type letters | Jump to the next row starting with what you typed |
| `Backspace` / `Delete` | Open a confirmation dialog to delete the selected file or directory |
| `Cmd+Z` / `Ctrl+Z` | Undo the most recent move made in this tab |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo the most recently undone move |
| `Cmd+N` / `Ctrl+N` | Create a new file (see "Creating a new file" above) |
| `Cmd+R` / `Ctrl+R` | Rename the selected file or directory in place (see "Renaming a file or directory" above) |

Deleting asks first: `Delete "<name>"?`, offering **Delete** and **Cancel**. Confirming removes the file or directory (recursively, for a directory) from disk; cancelling leaves it untouched.

Undo and redo only apply to moves — deleting a file or directory is permanent and can't be undone
this way. Each tree keeps its own undo/redo history in memory for as long as it stays open; closing
it clears that history.

Like other view tabs, a file navigator is a live view — closed with its × button or `close`, and not restored by `janus --relaunch`.

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />
