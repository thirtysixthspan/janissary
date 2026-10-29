# Diff

See what changed in a workspace as a tab instead of as terminal output: one entry per changed file, its add and delete counts, and the changed lines with additions green and removals red.

```
diff
```

## Open the tab

`diff` opens the tab on the project's own changes — everything the working tree holds against `HEAD`, staged and unstaged together, untracked files included. `diff <path>` scopes it to a directory inside the project instead. The path must be an existing directory: a file, a missing path, or a path outside the project is refused, for example with `Cannot diff <notes.txt>: no such directory.` Both open or focus the same one tab; a second route re-scopes it rather than opening a second one. The [Diff tab](/user-documentation/tab-types/diff-tab) page covers the tab itself in more detail.

A workspace gets a tab of its own, titled **`diff: <workspace label>`**. Three routes open one:

- the plus-minus button in a shell or harness tab's metadata row, which shows that tab's own workspace;
- the same plus-minus button on a [sessions](/user-documentation/tab-types/sessions) list row, which shows that remote session's workspace;
- `diff on <tab name>` typed in any tab, where the name is any open shell or harness tab that has a workspace.

```
diff on ahmed
```

The name is matched the way every other tab name in the app is: case doesn't matter. The name after `on` is one word, so a tab whose name has spaces can't be reached this way, and you can't combine a path with `on`. Either mistake, or `diff on` with no name, reports `Usage: diff [path] [on <tab name>]`. Two shell tabs sharing one workspace — the metadata row's **New shell in this workspace** button opens a sibling in the same clone — share one diff tab, because they're looking at the same changes. A tab with no workspace is refused by name: `Cannot diff on <name>: no open shell or harness tab named "<name>" has a workspace.` A tab whose workspace is still landing is refused instead, with the wait: `Cannot diff on <name>: the workspace of "<name>" is still being prepared.`

## Read the changes

<img class="agent-float" src="/agents/yusuf-south.png" alt="" />

Click a file's name to open it in an editor tab. Double-click an added or unchanged line to open the file at that line; removed lines open nothing, because the line they name is no longer in the file. A binary file opens in the media tab its kind already opens.

Each file's header carries a status word: **added**, **modified**, **deleted**, **renamed**, **binary**, or **mode** for a permissions-only change. A file you only appended to reads **modified**, because **added** means it didn't exist before. Files your `.gitignore` excludes are not listed.

The tab recomputes every second, so the change set stays live while files are edited around it, and a recompute never blanks what is on screen. A change set with no files reads `No changes`, and a directory that isn't in a git repository says so by name.

The header names the directory being diffed in the app's own shorthand — `$root` for the project's own directory, `$workspace/<name>` for a clone, `$git-sync` for the shared clone [git-synced files](/user-documentation/tab-types/editor-git-sync) live in, `~` for a path under your home directory. A workspace on another host is named after that host, so it's never ambiguous which machine the changes came from.

The arrows-up-down button in a file's header cycles that file through closed, a compact diff, and the whole file. A file that was added, deleted, or rewritten line for line starts closed, and so does any change of more than 400 added and removed lines combined. In a replacement, only the characters that changed carry the stronger tint. The header's plus-minus control switches between a unified layout, one column per line, and a split layout, old and new content in separate columns; the choice is remembered for the next diff tab you open.

The body takes the keyboard while it has focus: `↓` and `↑` walk the changed hunks across every file, `j` and `k` move between files, `←` collapses the file you're in, `→` cycles its view, and `Return` opens the file at the first added line of the hunk you're on, or at its first line when the hunk only removes lines.

In the unified layout each line carries a **+** comment control for a local note about it. Comments stay in the tab, are never sent anywhere, and survive refreshes and layout changes. They are forgotten when the tab closes or changes directory.

## A workspace on another host

<img class="agent-float left" src="/agents/selim-south-east.png" alt="" />

A remote workspace's changes are read on the far side and carried back over the connection the tab already holds, so the tab shows the same change set a local one does — including opening a file, jumping to a line, and expanding to the whole file, all materialized through the same cache a remote [file navigator](/user-documentation/tab-types/file-navigator) row uses. A save from that editor writes back to the workspace for as long as the diff tab is open.

Holding the tab open keeps that connection alive, the way an open remote file navigator does. When the workspace is gone — the clone was deleted, or the remote session ended — the tab closes itself rather than sitting on a directory that is no longer there.

## What the tab never does

<img class="agent-float" src="/agents/hamza-south-west.png" alt="" />

Nothing in the tab stages, discards, or commits anything, and nothing writes to the repository's index. It reads the working tree and shows you what is in it. The tab is a live view, so it isn't restored when you restart the app. Run `diff` again to get it back.
