# Editor

`edit <file>` opens a plain-text editor in its own tab:

```
edit src/main.ts
edit notes/new-idea.md      the path doesn't have to exist yet
```

The tab shows the file's name, size, and location in a header, with the editable buffer below.
Typing, arrow keys, `Home`/`End`, `PageUp`/`PageDown`, mouse clicks and selection, and paste all
work as you'd expect. A save button sits at the right of the header: it is enabled when you have
unsaved changes and dimmed when the buffer is clean.
Long sentences wrap between words when they reach the editor's edge. A single token wider than the editor can still break so it doesn't create horizontal scrolling.

You can also land in an editor by clicking a `file.ts:42`-style link in any transcript — the file opens with the cursor already on that line, centered in view — or from the [file navigator](/user-documentation/tab-types/file-navigator) with `Shift+Enter` on a file.

![An editor tab: syntax-highlighted TypeScript under the metadata header, with the unsaved-changes dot next to the filename.](/screenshots/editor-tab.png)

## Focus stays in the buffer

Click anywhere in the editor body, including the empty space below the last line, and typing keeps working. Clicking on a line of text moves the cursor there; clicking on empty space doesn't move the cursor, but doesn't take focus away either.

A plain click on the header (the file name, size, or location) puts focus straight back in the buffer once you release the mouse, so your cursor and typing pick up right where they were. If you drag to select header text instead, for example to copy the file's path, focus stays in the header so the selection sticks.

## Saving

<img class="agent-float" src="/agents/bilal-south-east.png" alt="" />

Click the save button or press `Ctrl+S` / `Cmd+S` to write the buffer to disk. On success a brief
"Saved" flash appears in the header; on failure the error is shown there and the save button stays
enabled.

If the path didn't exist when you ran `edit`, the file shows a size of "unknown" and isn't created until your first save. Opening that same not-yet-existing path again doesn't focus the first tab the way opening an existing file would; each open gets its own independent, unsaved tab, since none of them has a real file to converge on yet. If you save one of those tabs without renaming it, and another tab already saved a file under that name in the meantime, your save doesn't overwrite it: it picks the next free name in the same folder instead, such as `untitled.md` becoming `untitled-2.md`, and updates the tab to match.

## Renaming a tab renames the file

Unlike other tab kinds, editing an editor tab's label doesn't just set a display alias. It renames the file itself: type `notes.txt` and that becomes the file's actual name. For a file that hasn't been saved yet, this only updates where the first save will write to. For a file that already exists on disk, whether opened as an existing file or saved for the first time from a new one, renaming moves it to the new path right away.

Either way, the buffer is never reloaded: your unsaved content, cursor position, and undo history stay exactly as they were, and focus returns to the buffer once the rename finishes. Renaming the same file from the [file navigator](/user-documentation/tab-types/file-navigator) has the same effect on an editor tab that already has it open.

## Closing with unsaved changes

Closing a dirty editor tab — × button, `Cmd+W`/`Ctrl+W`, or `close` — asks first: "Do you want to save changes to this file?" with **Save** (the default), **Don't Save**, and **Cancel**. Press `y` to save and close, `n` to close without saving, or `Escape` to keep editing. The dialog is modal; input elsewhere is blocked until you choose.

## When the file changes outside the editor

Janissary watches the file behind an open editor tab for changes made by anything else, another process, a git checkout, another tool. If your buffer has no unsaved changes, the new content loads automatically and your cursor stays on the same line.

If you do have unsaved changes, your edits are left alone. The next time you try to save, a dialog appears instead: "This file changed on disk. Overwrite it with your changes?" with **Overwrite** and **Cancel**. Overwrite writes your buffer over the external change; Cancel leaves your buffer as it is, still unsaved, and shows the same prompt again on your next save attempt.

As you type, the editor also keeps a transient, unsaved copy of your buffer synced to the server a moment after you stop, so a [monitor](/user-documentation/automation/monitoring) watching the tab can see your in-progress edits without you having to save. That draft is never written to disk and never shown back in the editor; it's cleared the moment you do save.

## Syntax highlighting

<img class="agent-float left" src="/agents/cavus-south-west.png" alt="" />

Markdown, JavaScript, TypeScript, and JSON files are colored by syntax, chosen by file extension; anything else renders as plain text. Highlighting keeps up with your edits without slowing typing down, and is skipped for very large buffers (over 10,000 lines or 1 MB) so they stay responsive.

One theme applies to every editor tab at once. Switch it with `syntax theme <name>`, or run bare `syntax theme` for a picker — the choice persists across restarts. See [Application commands](/user-documentation/command-bar/commands).

## Ask a persona for a change


Press `>` at the very start of an empty line to open a request line, right there in the buffer, and ask an AI persona to make a change — for example `> assistant tighten this paragraph`. The persona's proposed edits preview inline for you to accept or decline. See [Asking a persona for a change](/user-documentation/tab-types/editor-persona-query) for the full syntax, keyboard shortcuts, and review flow.

## Keeping a file synced with GitHub

Some files stay synced with their project's `origin/master` branch automatically: saving one commits and pushes the change for you, based on the paths listed in the app's [configuration](/user-documentation/getting-started/startup#configuration). There's no switch for this in the editor itself; a file syncs if its path is on that list, and doesn't if it isn't. See [Git-synced files](/user-documentation/tab-types/editor-git-sync) for how to configure which paths sync, why it's useful, and exactly what happens on save.

## Lifecycle

Editor tabs are live views: they aren't restored by `janus --relaunch`, so save before quitting. The buffer, cursor, undo history, and scroll position do survive tab switches within a session.
