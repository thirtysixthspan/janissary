# Diff tab

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

Review a project's changes and open a changed file or line from the diff view.

```
diff
diff src
diff on ahmed
```

`diff` opens or focuses the project's diff tab. It compares the selected directory's changes with `HEAD`, including staged, unstaged, and untracked files. `diff src` limits the view to the `src` directory and its contents, even when the command is run from another project directory. Use a path inside the project; a path outside it is refused. The path must also name an existing directory. The app reports `Cannot diff <path>: no such directory.` for a missing directory and `Cannot diff <path>: it is outside the project root <project-root>.` for a path outside the project.

You can open the project diff from any tab. To compare a shell or harness workspace instead, use `diff on <tab name>`, replacing the name with the tab's label or display alias. Matching ignores case. For example, `diff on ahmed` opens that tab's workspace diff. You cannot combine a path with `on`; the app reports `Usage: diff [path] [on <tab name>]`. A tab without a workspace, or a name that does not identify an open shell or harness tab with one, reports `Cannot diff on <name>: no open shell or harness tab named "<name>" has a workspace.` If its workspace is still being prepared, the app reports `Cannot diff on <name>: the workspace of "<name>" is still being prepared.`

The project diff is always one tab, titled **diff**. Opening it for another project directory changes the directory shown in that same tab. Each workspace has its own tab named for the shell or harness tab that owns it. Shells that share a workspace also share its diff tab. You can open a workspace diff from the shell or harness **Show diff in the workspace** control, or from a live row in [Sessions](/user-documentation/tab-types/sessions). A remote workspace diff shows its host, directory, and branch when available. It reads changes over the existing remote connection and keeps that connection alive while the diff tab is open. If the workspace disappears, its diff tab closes.

## Read the changes

The tab shows staged, unstaged, and untracked changes against `HEAD`, grouped by file. Each heading shows the file path, change type, and added and removed line counts. Renames show both paths. Mode-only changes have no code lines, and binary files appear without a text diff.

Added lines are green and removed lines are red. Each line has its old and new line numbers. A replacement may highlight the characters that changed. Long lines wrap in the unified view; the split view keeps both sides aligned and can scroll horizontally in a narrow pane.

## Open a changed file

Click a file name to open it. Double-click an added or unchanged line to open the file at that line. A binary file opens in the viewer for its file type. Removed lines and deleted files cannot open a location that no longer exists.

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

Use the arrows-up-down control in a file heading to cycle through collapsed, compact diff, and full-file views. Double-click the heading to collapse or reopen its current view. A change with more than 400 added and removed lines combined starts collapsed. Full-file context is available for tracked text files; added, deleted, binary, and mode-only files have no additional context to show. When full-file context finishes loading, the view restores its previous scroll position.

## Change the layout

Use the plus-minus control in the header to switch between unified and split layouts. The app remembers your choice when you close and reopen the tab. In split layout, the original text is on the left and the changed text is on the right.

Syntax highlighting supports Markdown, JavaScript, TypeScript, and JSON files. Other file types appear as plain text. A side with more than 10,000 lines or 1 MB of visible text also appears as plain text.

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

In a remote workspace, if the host does not provide a usable change set, the tab shows **The remote host did not answer with a change set.**

The diff is read-only. It does not stage, discard, or commit changes. Comments are temporary and stay with their file entry in this tab. If the source line changes, its comment remains attached to the earlier text and identifies the change. Comments and drafts are forgotten when you close the tab, change its directory, or the file entry disappears. Closing the tab also clears expanded views; your layout choice is kept.
