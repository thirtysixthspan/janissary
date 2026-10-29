# Diff tab

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

Review a project's changes and open a changed file or line from the diff view.

```
diff
diff src
diff on ahmed
```

`diff` opens or focuses the project's diff tab. It compares the selected directory's changes with `HEAD`, including staged, unstaged, and untracked files. `diff src` limits the view to the `src` directory and its contents, even when the command is run from another project directory. The target must be an existing directory inside the project. A file counts as a missing directory, so `diff notes.txt` is refused the same way `diff nowhere` is. The app reports `Cannot diff <notes.txt>: no such directory.` for a missing directory or a file, and `Cannot diff <../other>: it is outside the project root </home/you/project>.` for a path outside the project. The path and the project directory appear inside literal angle brackets.

You can open the project diff from any tab. To compare a shell or harness workspace instead, use `diff on <tab name>`, replacing the name with the tab's label or display alias. Matching ignores case. For example, `diff on ahmed` opens that tab's workspace diff. You cannot combine a path with `on`; the app reports `Usage: diff [path] [on <tab name>]`. The name after `on` is one word, so a tab whose name has spaces can't be reached this way. The word `on` always starts that clause, in any case, so `diff on` with no name reports the same usage line, and a path can't contain `on` as a separate word. A tab without a workspace, or a name that does not identify an open shell or harness tab with one, reports `Cannot diff on <name>: no open shell or harness tab named "<name>" has a workspace.` If its workspace is still being prepared, the app reports `Cannot diff on <name>: the workspace of "<name>" is still being prepared.` In both messages the first `<name>` appears inside literal angle brackets, so `diff on ahmed` starts its refusal with `Cannot diff on <ahmed>:`.

The project diff is always one tab, titled **diff**. Opening it for another project directory changes the directory shown in that same tab. Each workspace has its own tab named for the shell or harness tab that owns it. Shells that share a workspace also share its diff tab. You can open a workspace diff from the shell or harness **Show diff in the workspace** control, or from a live row in [Sessions](/user-documentation/tab-types/sessions). A remote workspace diff shows its host, directory, and branch when available. It reads changes over the existing remote connection and keeps that connection alive while the diff tab is open. If the workspace disappears, its diff tab closes.

## Read the changes

The tab shows staged, unstaged, and untracked changes against `HEAD`, grouped by file in path order. Files your `.gitignore` excludes don't appear. Each heading shows the file path, a status word, and the added (`+`) and removed (`−`) line counts.

The status is one of **added**, **modified**, **deleted**, **renamed**, **binary**, or **mode**. **added** means the file did not exist before, so a file you only appended to reads **modified**. **mode** is a change to the file's permissions alone and has no code lines. A rename shows the old path, an arrow, and the new path. A binary file appears without a text diff.

Added lines are green and removed lines are red. Each line has its old and new line numbers. A replacement may highlight the characters that changed. Long lines wrap in the unified view; the split view keeps both sides aligned and can scroll horizontally in a narrow pane.

## Open a changed file

Click a file name to open it. Double-click an added or unchanged line to open the file at that line. A binary file opens in the viewer for its file type. Removed lines and deleted files cannot open a location that no longer exists.

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

Use the arrows-up-down control in a file heading to cycle that file from collapsed to compact diff to full file, then back to collapsed. Double-click the heading to collapse the file or reopen its current view. Full-file context is available for tracked text files. Added, deleted, binary, and mode files have no full-file view, so for them the control switches between collapsed and compact. When full-file context finishes loading, the view restores its previous scroll position. If loading it fails, `Context expansion failed:` and the reason appear beside the control.

Two kinds of change start collapsed. One is a file added, deleted, or rewritten line for line, because none of the old content survives. The other is any change with more than 400 added and removed lines combined. The limit counts the change, not the file, so a large file with one changed line still shows in full. A collapsed file still opens when you click its name. When you collapse or expand a file yourself, the refresh keeps your choice, and the full-file view survives refreshes too.

## Change the layout

Use the plus-minus control in the header to switch between unified and split layouts. The app remembers your choice when you close and reopen the tab, and a change in one diff tab applies to every open diff tab. In split layout, the original text is on the left and the changed text is on the right, and replaced lines sit side by side. When one side has fewer lines, shaded empty cells fill the gap. In unified layout, a replacement shows all its removed lines before all its added lines. In both layouts, double-click an added or unchanged line to open the file there.

Syntax highlighting supports Markdown, JavaScript, TypeScript, and JSON files. Other file types appear as plain text. A side with more than 10,000 lines or 1 MB of visible text also appears as plain text.

## Navigate with the keyboard

Click in a hunk to focus the diff, then use:

| Key | Action |
|---|---|
| `↑` / `↓` | Move between changed hunks |
| `j` / `k` | Move between files |
| `←` / `→` | Collapse the current file or cycle its view |
| `Enter` | Open the file at the selected hunk's first added line, or its first line when the hunk only removes lines |

The walk stops at the first and last hunk or file instead of wrapping. `←` collapses a file only while it is open, and `→` on a collapsed file reopens it. A collapsed file keeps an accent border on its left edge while the walk is on one of its hunks, and `Enter` still opens the file there. These keys leave buttons and comment editors alone.

## Add a comment

In unified layout, use the **+** beside a line to write a note about it. `Return` starts a new line in the note and `Escape` cancels it. **Save comment** keeps the note, and it stays disabled until you type something. **Cancel** discards the edit. A saved note offers **Edit comment** and **Delete comment**. If the line changes after you wrote the note, the note shows `Line changed since this comment:` followed by the earlier text.

Comments are temporary. They stay in the diff tab, are not sent anywhere, and are not written to your files. They survive a refresh, collapsing a file, the full-file view, and a layout change. Split layout hides them until you switch back to unified. They are forgotten when you close the tab, change its directory, or the file's entry disappears.

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

## Refresh and errors

The tab refreshes automatically about once a second, so it follows your edits, including a change that only adds or removes whitespace. A refresh leaves what is on screen alone until the new result arrives, so the body never blanks and **No changes** doesn't flicker. Running `diff` again refreshes too. Pointing the tab at another directory is the one case that clears the body first.

A directory outside a Git repository shows **This directory is not a git repository**; a repository with no changes shows **No changes**. A Git failure appears in the tab, which continues working and tries again on a later refresh. A read that takes longer than 30 seconds stops and shows `Git diff read timed out after 30000 ms`.

In a remote workspace, if the host does not provide a usable change set, the tab shows **The remote host did not answer with a change set.**

The diff is read-only. It never stages, discards, or commits changes, and it never writes to the repository's index. The tab is also a live view, not saved state: restarting the app doesn't bring it back, so run `diff` again. Closing the tab forgets its expanded views, comments, drafts, and keyboard position. Your layout choice is kept.
