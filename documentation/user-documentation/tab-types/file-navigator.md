# File navigator

`files` opens a directory tree in its own tab:

```
files            rooted at the tab's working directory
files src        rooted at src
files left       rooted at the working directory, docked in the left sidebar
files right src  rooted at src, docked in the right sidebar
```

Directories sort before files, both alphabetically. Version-control clutter (`.git` and friends, `.DS_Store`) is hidden; every other dotfile shows. A directory's contents are only read when you expand it, so a huge `node_modules` costs nothing until opened. The tab is labeled `files` in the strip and placed at the *start* of its group, so the tree sits left of the tabs it opens — except while docked to a sidebar, when it leaves the strip entirely (see below).

If a tree is already open on the same root, `files` focuses it rather than opening a duplicate — or, with `left`/`right`, moves it into that sidebar. A target that isn't a directory prints `files: <path>: not a directory`.

![A file navigator tab: a directory tree with one directory expanded and a row selected.](/screenshots/file-tree.png)

## Docking to a sidebar

A file navigator can live in three places: the central tab strip (the default), the left
sidebar, or the right sidebar. `files left [path]` and `files right [path]` open (or move) a
tree straight into that sidebar; a directory literally named `left` or `right` is still reachable
with a path form, e.g. `files ./left`.

While docked, the tree leaves the tab strip and appears in its sidebar instead, resizable by
dragging the divider on its inner edge. Only one tab can be docked per sidebar — docking a
second one into an occupied side sends the first back to the center strip rather than
closing it. A docked tree is never the active tab; `files <same path>` (no `left`/`right`) brings
it back to center and focuses it. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

The sidebars are shared with the [notifications](/user-documentation/tab-types/notifications) feed, which docks the
same way — so a sidebar can hold a tree *or* the notifications feed, and docking one where the
other already sits displaces that one back to center.

![A file navigator docked in the left sidebar, with its resize divider on the right edge.](/screenshots/file-tree-sidebar.png)

## The tree stays current

Every visible directory is watched: files that appear, disappear, or get renamed show up in the tree within about a second, even during a burst of changes like a `git checkout`. If watching stops working for a directory (permissions, exotic filesystems), the tree keeps working — collapse and re-expand to refresh by hand.

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

Files opened from the tree land in the same [group](/user-documentation/getting-started/groups) as the tree tab —
including while the tree is docked to a sidebar; opened files still land in that group.

## Keyboard

A focused tree captures these keys for itself (tab-switching and other `Ctrl`/`Cmd` chords still work):

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move the selection |
| `→` | Expand a collapsed directory; from an expanded one, move to its first child |
| `←` | Collapse an expanded directory; otherwise jump to the parent |
| `Enter` / `Space` | Open a file, toggle a directory, or (on `..`) go up |
| `Shift+Enter` | Open the selected file in the editor |
| `Home` / `End` | First / last visible row |
| `PageUp` / `PageDown` | Move by a screenful |
| Type letters | Jump to the next row starting with what you typed |
| `Cmd+Z` / `Ctrl+Z` | Undo the most recent move made in this tab |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo the most recently undone move |

Undo and redo only apply to moves — deleting a file or directory is permanent and can't be undone
this way. Each tree keeps its own undo/redo history in memory for as long as it stays open; closing
it clears that history.

Like other view tabs, a file navigator is a live view — closed with its × button or `close`, and not restored by `janus --relaunch`.

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />
