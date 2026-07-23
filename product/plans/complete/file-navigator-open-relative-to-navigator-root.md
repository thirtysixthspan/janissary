# Open/edit files from the file navigator relative to the navigator's own root

**Complexity: 3/10** — a client-side change to a handful of command strings, threading an
already-server-provided field through two files, plus matching test updates; no server or
protocol changes needed.

## Goal

Clicking (or keyboard-activating) a file row in the file navigator must open or edit that file
relative to the navigator's own root — the directory the navigator is currently showing, which is
the shared workspace root when the navigator is displaying a workspace. Today the file opens
relative to the cwd of whichever tab currently has focus in the main application area, which is
often a different directory than the navigator's root, so the wrong file (or no file) opens.

## Root cause

`FileTreeTab.tsx` and `useFileTreeOpener.ts` build `edit <path>` / `open <path>` command strings
using the file row's tree-relative path only, then dispatch them with `client.send({ method:
'command', params: { text } })`. On the server, the generic `'command'` RPC
(`src/message-handler.ts` → `CommandManager.dispatch`) always resolves against `this.managers.tab.
cur()` — the currently **focused** tab — not the file-tree tab that the click originated in.
`OpenFileManager.edit`/`run` then resolve the (still-relative) path against that focused tab's cwd
(`managers.tab.cwdOf(label)`), which has nothing to do with the navigator's root.

The `FileTreeView` the server already sends down carries the fix for free: `root` is
display-abbreviated (e.g. `~/project`) for the header, while `absoluteRoot` is the same root
unshortened (`src/types.ts:138`, `src/tab/view.ts:54`) — exactly the value needed to make the
command's path absolute. It is computed correctly for every navigator (a fresh tree, a retargeted
tree, and a workspace-rooted tree all set both fields to the same resolved root) but the client
never reads it. `useQuickOpen.ts` already solves the identical problem for Cmd+P (`pickQuickOpenFile`
sends `edit ${root}/${relPath}`, Decision 5 in its comment) — this fix applies that same pattern to
the file navigator.

## Approach

Make every navigator-originated `edit`/`open` command carry an absolute path built from
`files.absoluteRoot`, so the server-side relative-path resolution (`path.isAbsolute(expanded) ?
expanded : path.resolve(cwd, expanded)` in `OpenFileManager.edit`) takes the already-absolute path
as-is and never falls back to the focused tab's cwd. No server change is needed — `edit`/`open`
already handle absolute paths correctly; only the client needs to stop sending bare relative ones.

`newfile`/`newdir` (the New file / New directory buttons) share the same underlying `'command'`
dispatch and the same bug class, but they are a distinct action from "open/edit a file by clicking
on it" and are out of scope for this fix — see Out of scope.

## Implementation steps

1. **`web/src/useFileTreeOpener.ts`** — add a `root: string` parameter to `useFileTreeOpener(client,
   index, root)`. Build every command string sent to the server (the no-`request` fallback, the
   `result.command` follow-up, and `choose()`'s picked-choice command) as `` `${cmd} ${root}/${path}` ``
   instead of `` `${cmd} ${path}` ``.
2. **`web/src/FileTreeTab.tsx`** — pass `files.absoluteRoot` as the new `root` argument to
   `useFileTreeOpener(client, index, files.absoluteRoot)`. Change `editFile` to send
   `` `edit ${files.absoluteRoot}/${path}` `` instead of `` `edit ${path}` ``.

## Tests

- **`web/src/FileTreeTab.test.tsx`** — update the existing double-click/keyboard open-and-edit
  assertions (double-click a file, Shift+double-click, double-click a markdown file,
  Shift+double-click a markdown file, Enter on a selected file, Shift+Enter on a selected file, and
  the opener-choice dialog's "Edit as text" pick) to expect the `files.absoluteRoot`-prefixed
  absolute path (`makeFiles()`'s root is `/home/user/project`, so e.g. `edit src/index.ts` becomes
  `edit /home/user/project/src/index.ts`).
- New test: a navigator whose `root`/`absoluteRoot` differ (a display-abbreviated `~/project` vs.
  unshortened `/Users/derrick/project`) sends the command with the **unshortened** `absoluteRoot`,
  not the abbreviated `root`.

## Out of scope

- `newfile`/`newdir` (New file / New directory buttons and their Cmd+N/keyboard equivalents) —
  same underlying `'command'`-dispatch-resolves-against-focused-tab issue, but a distinct action
  from opening/editing an existing file by clicking it; not mentioned in the reported issue.
- Any server-side change — `edit`/`open`'s existing absolute-path handling already does the right
  thing once the client sends an absolute path.
- `useQuickOpen.ts` (Cmd+P), which already prefixes with its own root, and
  `transcript-line.tsx`/`file-link.ts` (clickable paths in transcripts) — unrelated call sites, out
  of scope for a file-navigator-only fix.
