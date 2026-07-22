# Editor

`edit <file>` opens a plain-text editor in its own tab:

```
edit src/main.ts
edit notes/new-idea.md      the path doesn't have to exist yet
```

The tab shows the file's name, size, and location in a header, with the editable buffer below. Typing, arrow keys, `Home`/`End`, `PageUp`/`PageDown`, mouse clicks and selection, and paste all work as you'd expect. A dirty dot (●) appears next to the filename whenever there are unsaved changes.
Long sentences wrap between words when they reach the editor's edge. A single token wider than the editor can still break so it doesn't create horizontal scrolling.

You can also land in an editor by clicking a `file.ts:42`-style link in any transcript — the file opens with the cursor already on that line, centered in view — or from the [file navigator](/user-documentation/tab-types/file-navigator) with `Shift+Enter` on a file.

![An editor tab: syntax-highlighted TypeScript under the metadata header, with the unsaved-changes dot next to the filename.](/screenshots/editor-tab.png)

## Saving

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

`Ctrl+S` / `Cmd+S` writes the buffer to disk. On success a brief "Saved" flash appears in the header; on failure the error is shown there and the dirty dot stays.

If the path didn't exist when you ran `edit`, the file shows a size of "unknown" and isn't created until your first save.

## Closing with unsaved changes

Closing a dirty editor tab — × button, `Cmd+W`/`Ctrl+W`, or `close` — asks first: "Do you want to save changes to this file?" with **Save** (the default), **Don't Save**, and **Cancel**. Press `y` to save and close, `n` to close without saving, or `Escape` to keep editing. The dialog is modal; input elsewhere is blocked until you choose.

## Syntax highlighting

<img class="agent-float left" src="/agents/yusuf-south-east.png" alt="" />

Markdown, JavaScript, TypeScript, and JSON files are colored by syntax, chosen by file extension; anything else renders as plain text. Highlighting keeps up with your edits without slowing typing down, and is skipped for very large buffers (over 10,000 lines or 1 MB) so they stay responsive.

One theme applies to every editor tab at once. Switch it with `syntax theme <name>`, or run bare `syntax theme` for a picker — the choice persists across restarts. See [Application commands](/user-documentation/command-bar/commands).

## Lifecycle

Editor tabs are live views: they aren't restored by `janus --relaunch`, so save before quitting. The buffer, cursor, undo history, and scroll position do survive tab switches within a session.
