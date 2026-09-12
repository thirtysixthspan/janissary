# Opening a file in the file navigator must not inject a command into any tab's transcript

**Complexity: 3/10** — client-side only, in two files under `web/src/file-navigator/`, plus test updates. No wire-protocol change: the tab-scoped `fileNavigatorOpen` RPC already exists and already serves the remote-tree and context-menu paths; this fix routes every local activation through it too. No server change.

## The bug

Activating a file row (double-click, Enter, Shift+Enter, the context menu's Open/Edit, the opener chooser) in a **local** file navigator sends a generic `command` message — `open <abs-path>` / `edit <abs-path>`. The server dispatches that through `CommandManager.dispatch` (`src/command/manager.ts:36`), which:

1. records the text into **the currently active tab's** command history;
2. runs the command against **the focused tab, whatever it is** — so an `edit <path>` entry (`src/commands/edit.ts:14`) or `open` provenance lands in the transcript of whichever tab happens to be active, and even queues behind a busy agent (`src/command/queue.ts`).

The file navigator tab itself has no transcript, so the entry always lands in some *other* tab.

The correct route already exists: `fileNavigatorOpen` (`src/protocol/file-navigator.ts:102`) resolves the tab index to the navigator's own label server-side and opens the file via `openNavigatorFile` → `openMaterialized` (`src/file-navigator/manager-files.ts:59`) with **the navigator's** label — no command message, no transcript injection anywhere, no queue. Remote trees (`useFileNavigatorOpener.ts:67`) and the row context menu's remote branch (`file-navigator-menu-actions.ts:50`) already use it. Local activation simply never did.

## Goal

Opening or editing a file from a file navigator — by any gesture — sends only `fileNavigatorOpen` and injects nothing into any tab's transcript, command history, or command queue, for local and remote trees alike.

## Approach

Make `fileNavigatorOpen` the single route for every file activation out of `useFileNavigatorOpener` and `createFileNavigatorActions`, dropping the client-composed `command` messages. `relPath` is tree-relative, which the server resolves against the navigator's own root — the same root-relative discipline every other navigator RPC (move, delete, rename, reveal) already uses.

The `client.request`-absent fallbacks stay, but fall back to `fileNavigatorOpen` (a fire-and-forget `send`, available on every client) instead of a `command` message; only the *opener resolution query* needs `request`.

## Implementation steps

1. **`web/src/file-navigator/useFileNavigatorOpener.ts`**
   - `sendOpen`: always `client.send({ method: 'fileNavigatorOpen', params: { index, relPath: path, command } })`; drop the `remote` branch and parameter.
   - `open` fallback (no `client.request`): send `fileNavigatorOpen` with `command: edit ? 'edit' : 'open'` instead of a `command` message.
   - `openWith` fallback: send `fileNavigatorOpen` with `command: 'open'`.
   - `root` parameter becomes unused — drop it from the hook signature.
2. **`web/src/file-navigator/FileNavigatorTab.tsx`** — call `useFileNavigatorOpener(client, index)` (lines 41), dropping `files.absoluteRoot` and the remote flag.
3. **`web/src/file-navigator/file-navigator-menu-actions.ts`** — `editFile` sends `fileNavigatorOpen` with `command: 'edit'` for local and remote alike; the `files.remote` branch collapses to one send. Update the stale remote/local comment.

## Tests

Mirror the existing style in `FileNavigatorTab.test.tsx` (mocked `JanusClient`, `fireEvent`, `toHaveBeenNthCalledWith`). Update every assertion that expects a `command` message from a file activation to expect `fileNavigatorOpen` with `relPath`:

- double-click / Shift+double-click open+edit (4 tests), absoluteRoot-vs-display-root test (asserts `relPath` is tree-relative, so the shortened-root case now asserts the same message for both roots — keep a variant proving the display root is never sent),
- markdown edit-gesture tests, Enter/Shift+Enter keyboard tests,
- opener-chooser "Edit as text" choice,
- context-menu Edit, multi-selection Open/Edit fan-out, "Edit as text" for a selection,
- **new regression test**: activating a file sends no `command` message at all while a navigator is focused.

`useFileNavigatorIntents.test.ts` passes unchanged (`sendCommand` remains for `openGithub` and New file/New folder, which are out of scope — see below).

## Spec updates

- `product/specs/file-navigator-tab.md`, "Mouse interactions" (lines 222–225): opening/editing from the tree is no longer described as using the command line; state that it records no entry in any tab's transcript and is unaffected by a busy agent.
- Same file, "Row context menu" (line 252): Edit no longer "sends `edit <absolute-path>`" — reword to the gesture's effect, not the wire message.

## Out of scope

- **New file / New folder** still issue `newfile`/`newdir` commands locally (same injection pattern, but the issue names opening a file; changing creation flows alters their transcript-visible confirmation behavior and deserves its own plan).
- **`openGithub`** (header button) keeps its `open <url>` command — it intentionally opens a page tab through the command router.
- Server-side changes: none needed; `fileNavigatorOpen` already behaves correctly for local trees.
- The remote-file materialization path in `openNavigatorFile` (untouched).
