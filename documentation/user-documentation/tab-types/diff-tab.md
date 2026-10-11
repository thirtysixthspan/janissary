# Diff tab

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

Review a project's changes and open a changed file or line from the diff view.

```
diff
diff src
```

`diff` opens or focuses the one diff tab and shows changes in the project directory. Add a directory path to review changes under that directory. The path must be an existing directory inside the project; for a missing directory, the app reports `Cannot diff <path>: no such directory.` A shell or harness tab with a workspace also has a **Show diff in the workspace** control that opens the same view for its workspace.

## Read the changes

The tab shows staged, unstaged, and untracked changes against `HEAD`, grouped by file. Each heading shows the file path, change type, and added and removed line counts. Renames show both paths. Mode-only changes have no code lines, and binary files appear without a text diff.

Added lines are green and removed lines are red. Each line has its old and new line numbers. A replacement may highlight the characters that changed. Long lines wrap in the unified view; the split view keeps both sides aligned and can scroll horizontally in a narrow pane.

## Open a changed file

Click a file name to open it. Double-click an added or unchanged line to open the file at that line. A binary file opens in the viewer for its file type. Removed lines and deleted files cannot open a location that no longer exists.

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

Use the arrows-up-down control in a file heading to cycle through collapsed, compact diff, and full-file views. Double-click the heading to collapse or reopen its current view. Full-file context is available for tracked text files; added, deleted, binary, and mode-only files have no additional context to show.

## Change the layout

Use the plus-minus control in the header to switch between unified and split layouts. The app remembers your choice when you close and reopen the tab. In split layout, the original text is on the left and the changed text is on the right.

## Navigate with the keyboard

Click in a hunk to focus the diff, then use:

| Key | Action |
|---|---|
| `↑` / `↓` | Move between changed hunks |
| `j` / `k` | Move between files |
| `←` / `→` | Collapse the current file or cycle its view |
| `Enter` | Open the file at the selected hunk's first changed line |

The walk stops at the first and last hunk or file instead of wrapping. These keys leave buttons and comment editors alone.

## Add a comment

In unified layout, use the **+** beside a line to write a note about it. Save the comment or cancel your edit; you can later edit or delete a saved note. Comments are temporary, stay in the diff tab, and are not written to your files. Split layout hides comments until you switch back to unified.

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

## Refresh and errors

The tab refreshes its view automatically about once a second. A directory outside a Git repository shows **This directory is not a git repository**; a repository with no changes shows **No changes**. A Git failure appears in the tab, which continues working and tries again on a later refresh. A read that takes longer than 30 seconds times out and shows its reason.

The diff is read-only. It does not stage, discard, or commit changes. Closing the tab clears its comments and expanded views; your layout choice is kept.
