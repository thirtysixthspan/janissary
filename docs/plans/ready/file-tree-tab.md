# File tree tab (`files` command)

**Complexity: 6/10** — the tab/view plumbing is all precedent (markdown/editor tabs), and clicking a file reuses the existing `open`/`edit` commands verbatim. What drives the number: the first fs-watching subsystem in the codebase (per-visible-directory watcher lifecycle + debounced rebuild), a new RPC surface, and a first-of-its-kind keyboard-navigable tree component on the web side.

## Goal

`files [path]` opens a **file tree tab**: a directory tree rooted at the issuing tab's cwd (the project cwd on the root tab), or at `<path>` when given.

Requirements (from `docs/todo-features.md` "File tree sidebar"):

1. A directory tab showing the directory tree rooted at the project cwd.
2. Files in the project directory are watched; the tab updates dynamically as files appear, disappear, or are renamed.
3. Clicking a file opens or edits it via the existing `open` and `edit` commands.
4. Directories can be opened and closed, exposing files.

## Research: what users expect from a file explorer

Surveyed VS Code's Explorer and the WAI-ARIA treeview pattern ([VS Code user interface docs](https://code.visualstudio.com/docs/getstarted/userinterface), [ARIA APG treeview keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/), [keyboard navigation of the VS Code explorer](https://adamtuttle.codes/blog/2024/navigating-vscode-file-explorer-without-mouse/), [explorer context menu reference](https://grokipedia.com/page/Explorer_context_menu_Visual_Studio_Code)). The common feature set, and where each lands in this plan:

| Expected feature | This plan |
|---|---|
| Click a file to open it; click a folder to expand/collapse | **v1** (requirement 3/4) |
| Live refresh when the filesystem changes | **v1** (requirement 2) |
| Folders sorted first, then files, alphabetical case-insensitive | **v1** |
| Chevron (▸/▾) on folders; indent per depth; indent guides | **v1** (CSS only) |
| Full keyboard navigation: arrows, Home/End, Enter, type-ahead | **v1** (per the ARIA APG treeview pattern below) |
| Collapse all | **v1** (header button) |
| Default excludes (`.git`, `.DS_Store` — VS Code's `files.exclude` defaults) | **v1** (constant list) |
| Single-click preview tab vs. double-click pinned tab | **N/A** — this app has no preview-tab concept; single click opens, and `open`'s existing semantics apply |
| Context menu: New File/Folder, Rename (F2), Delete, Duplicate | out of scope v1 (no context menus exist anywhere in the app yet) |
| Drag & drop to move files; multi-select (Cmd/Shift+click) | out of scope v1 (no batch operations to apply them to) |
| Reveal active file / filter-as-you-type find (`⌥⌘F`) | out of scope v1 (type-ahead covers most of the need) |
| Git status decorations, gitignore dimming, file-type icon themes | out of scope v1 |

## What already exists (reuse, don't rebuild)

| Piece | Where | Notes |
|---|---|---|
| View-tab shape: `view` kind + payload on `Tab`/`TabView` | `src/types.ts:108` (`Tab`), `src/protocol.ts:29` (`TabView`) | Add `'files'` to both `view` unions + a `files?: FileTreeView` payload |
| Tab creation: unique label, group placement, focus | `src/tab-creators.ts` (`addMarkdownTab`, `uniqueLabel`), `src/tab.ts` (`makeMarkdownTab`) | `addFilesTab`/`makeFilesTab` copy this shape |
| Server-flattened rows sent to a dumb client | `bufferLines` (`src/tab-manager.ts:272`, "the server owns `flattenBuffer`") | The tree ships as a pre-flattened row list; the client never walks directories |
| Click-to-open sends a `command` RPC with `open <path>` | `web/src/file-link.ts:98-108` (`renderFileLinkSegments`) | The tree's file rows do exactly this — requirement 3 is one `client.send` call |
| `open`/`edit` resolve relative paths against the tab's cwd | `src/open-file-manager.ts:19,46` (`cwdOf(label) ?? process.cwd()`) | Setting the files tab's cwd to the tree root makes root-relative row paths "just work" |
| A `command` RPC runs in the **active** tab | `CommandManager.dispatch` (`src/command-manager.ts:31`, `this.managers.tab.cur()`) | So a click on a files-tab row dispatches with the files tab's cwd in effect |
| Registry commands match before the unknown-command fallback | `resolveCommand` (`src/resolve.ts:28`, `for (const c of commands)` precedes `getOutput`) | Registering the `files` command needs **no** `getOutput` change — same as `open`/`edit` |
| Path tab-completion for any command's argument | `completeCommandLine` falls through to `completeFilePath` (`src/completion.ts:50`) | `files <path>` completes with zero new code |
| Index-based pure-UI RPCs | `src/protocol.ts:81` (`RpcCall`), dispatch switch `src/index.ts:143` (`switch (message.method)`), thin `Controller` methods (`src/controller.ts:125`, `setActiveTab`) | `fileTreeToggle`/`fileTreeCollapseAll` follow `setActiveTab`/`closeTab` |
| View-tab rendering for the active tab only | `web/src/ViewTabBody.tsx` | Add a `files` branch; also add `'files'` to the `isViewTab` list (`web/src/App.tsx:113`) |
| Tab close → resource cleanup hook | `src/tab-cleanup.ts` (`closeTabResources`) | Dispose the tab's watchers here |
| App exit → manager shutdown | `Controller.shutdown` (`src/controller.ts`) | Dispose all watchers |
| Directory-listing conventions (dotfile handling, `localeCompare` sort) | `src/completion-fs.ts:23-25` | Same sort call; the tree shows dotfiles (minus excludes) unconditionally |
| Manager registry | `src/managers.ts`, constructed in `src/controller.ts` | Add `fileTree: FileTreeManager` |

**Nothing in the codebase watches the filesystem today** (no `fs.watch`/chokidar anywhere) — the watcher subsystem is new ground; keep it small and self-contained.

---

## Design

### Data model — server owns the tree, client renders rows

The server holds each files tab's state: the root, the set of expanded directories, and the live watchers. On every change it flattens the *visible* nodes into an ordered row list carried on the tab payload (precedent: `bufferLines`). Children of a directory are read from disk **only when it is expanded** (VS Code does the same) — `node_modules` costs nothing until someone opens it.

```ts
// src/types.ts (re-exported via src/protocol.ts)
export type FileTreeRow = {
  path: string;      // relative to the tree root — unique key, and the `open` argument
  name: string;      // basename, what the row displays
  depth: number;     // 0 for the root's direct children; drives indentation
  dir: boolean;
  expanded?: boolean; // present on dir rows
};
export type FileTreeView = { root: string; rows: FileTreeRow[] };
```

Sorting: directories first, then files, `localeCompare` case-insensitive within each. Excludes (constant, VS Code's `files.exclude` defaults): `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db`. All other dotfiles are shown. Symlinks render as leaf files (never expandable) — the cheap way to be cycle-proof.

### `src/file-tree.ts` (new) — pure tree building

- `readDirSorted(absDir): FileTreeRow-shaped entries` — `readdirSync(dir, { withFileTypes: true })`, apply excludes, sort as above; an unreadable directory (EACCES, ENOENT mid-race) yields `[]`.
- `buildRows(root, expanded: Set<string>): FileTreeRow[]` — depth-first walk of the root, descending only into `expanded` paths.

Pure and synchronous — unit-testable against a temp directory with no watcher involvement.

### `src/file-tree-manager.ts` (new) — tabs, watchers, RPC verbs

Per files tab (keyed by label): `{ root, expanded: Set<string>, watchers: Map<string, FSWatcher>, debounce?: Timeout }`.

- `open(command, label)`: strip the leading `files` keyword; everything remaining (trimmed, verbatim — paths may contain spaces, like `parseOpen`'s target) is the optional path, resolved against `cwdOf(label) ?? process.cwd()`. If the resolved path is missing or not a directory (`statSync` in try/catch), append `files: <target>: not a directory` to the creator's transcript (message shape mirrors `open: <file>: no such file`, `src/open-file-manager.ts:64`) and stop. If a files tab with the same root is already open (`tabs.find((t) => t.files?.root === root)`), **focus it** via `setActiveTab` (VS Code has one Explorer; duplicate trees of the same root are noise). Otherwise create the tab, set its cwd to the root (`managers.tab.setCwd`), build initial rows, start watching, emit `state: dirty`.
- **Tab creation contract**: a new `TabManager.openFilesTab(view: FileTreeView)` mirroring `openMarkdownTab` (`src/tab-manager.ts:295`), backed by `addFilesTab`/`makeFilesTab` in `src/tab-creators.ts`/`src/tab.ts` copying the `addMarkdownTab`/`makeMarkdownTab` shape. Label: unique `files` (`files`, `files-2`, … via the existing `uniqueLabel` helper, `tab-creators.ts:7`). Title: basename of the root truncated to `tabNameMaxLength` — the `addEditorTab` precedent (`tab-creators.ts:64`, `view.name.slice(0, getConfig().tabNameMaxLength)`). Creation focuses the new tab (that's what `addMarkdownTab` returns), so `FileTreeManager` reads the created label back with `managers.tab.cur().label` before calling `setCwd`.
- `toggle(label, path)`: add/remove `path` from `expanded`; on expand also expand nothing else (no auto-reveal); rebuild rows; start/stop that directory's watcher; emit dirty.
- `collapseAll(label)`: clear `expanded`, close all non-root watchers, rebuild, emit dirty.
- **Watching**: one non-recursive `fs.watch(absDir)` per *visible* directory — the root plus every expanded directory. Watcher count is bounded by what the user expanded, and `fs.watch`'s recursive-mode platform caveats never apply. Any event schedules a single per-tab **debounced rebuild (~100 ms)**: re-run `buildRows`, prune `expanded` entries (and close watchers) for directories that no longer exist, emit dirty. `fs.watch` failures (exotic filesystems, fd limits) are caught and ignored — the tree still works, refreshing on toggle.
- `closeTab(label)` / `dispose()`: clear the debounce timer and close all watchers. Wire `closeTab` into `closeTabResources` (`src/tab-cleanup.ts:5` — one call next to `managers.pty.closeTab(tab.label)`) and `dispose` into `Controller.shutdown` (`src/controller.ts:171`, alongside the other `closeAll` calls).

Register in `Managers` (`src/managers.ts`) and construct in the `Controller` constructor next to `openFile` (`src/controller.ts:36`) — it only needs `managers.tab`, constructed earlier in the list.

### Command — `src/commands/files.ts` (new)

Standard `Command` shape (mirror `src/commands/edit.ts`): `match: /^files\b/i`, `run` delegates to `managers.fileTree.open(command, tab.label)`. Register in `src/commands/index.ts` and `availableCommands` (`src/commands.ts:6` — this only feeds the fallback help string; the real `help` output is parsed from the README, which the Docs step updates). No `getOutput` change (see the reuse table). Tab title is name only, no marker, per [[tab-label-no-markers]].

### Protocol — two pure-UI RPCs

```ts
| { method: 'fileTreeToggle'; params: { index: number; path: string } }
| { method: 'fileTreeCollapseAll'; params: { index: number } }
```

Dispatch cases in the `switch (message.method)` at `src/index.ts:143` → thin `Controller` methods → `FileTreeManager` (the `setActiveTab` pattern, `src/controller.ts:125`; resolve `index` → label at the controller via `managers.tab.tabs[index]?.label`). Toggle round-trips to the server because the server owns `expanded` (it must know which directories to watch); on a local websocket the latency is imperceptible.

`TabManager.view()` must also map the new payload: add `files: t.files,` next to `markdown: t.markdown` in the `TabView` projection (`src/tab-manager.ts:281`) — without this the client never sees the rows.

Opening files is **not** a new RPC: file rows send `{ method: 'command', params: { text: 'open <path>' } }` exactly like `file-link.ts`. The command runs in the active (files) tab, whose cwd is the root, so relative row paths resolve correctly, and the opened file's tab is inserted in the same group.

### Web — `web/src/FileTreeTab.tsx` + `web/src/file-tree-keys.ts` (new)

Rendered from `ViewTabBody` (add the `files` branch, keyed by tab label; add `'files'` to `isViewTab` in `App.tsx:113`). **`ViewTabBody` today takes only `{ tab }`** (`web/src/ViewTabBody.tsx:10`); it gains `client: JanusClient` and `index: number` props — the tree needs `client` to send RPCs and `index` (the tab's position in the server's full tab list) for the RPC params. `App.tsx:126` (`<ViewTabBody tab={current} />`) passes `client={client} index={activeTab}`; the existing image/page/markdown branches ignore both. Layout: a header bar (root basename + collapse-all button) above a scrollable row list (`overflow-y: auto`).

Component state is view-only: `selected` (row path) and the type-ahead buffer. Rows render from `tab.files.rows` — indentation `depth × 16px`, chevron on dir rows, file/dir glyph, hover + selected highlight, thin indent guides (CSS `border-left` on depth wrappers). Styles go in `theme.css` next to the other tab-body styles.

The container is `tabIndex={0}` with `role="tree"`; rows get `role="treeitem"`, `aria-expanded` on dirs, `aria-selected`. It focuses itself when mounted/active — view tabs don't mount `CommandInput`, so the tab-switch effect's `inputReference.current?.focus()` (`App.tsx:96-102`) is a no-op on a files tab and needs no change. Its `onKeyDown` calls `preventDefault`/`stopPropagation` **only for keys it handles**: unmodified keys from the table below plus `Alt+Enter`. Everything carrying Ctrl/Meta/Shift propagates to the window-level handlers (`useWindowKeys`), so the tab-management chords (Shift/Ctrl+arrows, Ctrl+R, Cmd+W) keep working over a files tab.

`file-tree-keys.ts` holds the pure keyboard logic (`nextSelection(rows, selected, key, …)`) so it's unit-testable without DOM.

### Mouse interactions

| Interaction | Behavior |
|---|---|
| Single click on a directory row (anywhere on the row) | Toggle expand/collapse (`fileTreeToggle`), select it |
| Single click on a file row | Select it and run `open <path>` (VS Code's single-click-opens; no preview-tab concept here) |
| Alt+click on a file row | Select it and run `edit <path>` — forces the plain-text editor for files whose `open` opener is a viewer (markdown, images) |
| Double click | No extra semantics (nothing to "pin") |
| Chevron ▸/▾ | Visual affordance only — the whole row is the click target |
| Hover | Row highlight; row `title` tooltip shows the relative path |
| Header ⊟ button | Collapse all (`fileTreeCollapseAll`) |
| Scroll wheel / trackpad | Scrolls the row list |

### Keyboard interactions (ARIA APG treeview pattern, VS Code-aligned)

| Key | Behavior |
|---|---|
| `↓` / `↑` | Move selection to the next / previous visible row |
| `→` | On a collapsed dir: expand (selection stays). On an expanded dir: move to its first child. On a file: no-op |
| `←` | On an expanded dir: collapse. Otherwise: move selection to the parent directory |
| `Enter` | File: `open <path>`. Directory: toggle expand/collapse |
| `Alt+Enter` | File: `edit <path>` (mirrors Alt+click) |
| `Space` | Same as `Enter` |
| `Home` / `End` | First / last visible row |
| `PageUp` / `PageDown` | Move selection by one viewport of rows |
| Printable characters | Type-ahead: jump to the next visible row whose name starts with the typed prefix; buffer resets after ~700 ms (APG recommends type-ahead for any tree of meaningful size). Space is excluded — it's the action key above. Keys with Ctrl/Meta modifiers are never type-ahead |

Selection is clamped after every state update (rows can disappear under the watcher); if the selected path vanishes, selection moves to the nearest surviving row.

### Lifecycle summary

| Concern | Mechanism | New code? |
|---|---|---|
| Tab updates on fs changes | per-visible-dir `fs.watch` → debounced rebuild → `state: dirty` | yes |
| Clicking opens/edits via existing commands | `command` RPC with `open`/`edit`, cwd = root | no (one `send` call) |
| Expand/collapse | server-owned `expanded` set + `fileTreeToggle` RPC | yes |
| Watchers die with the tab | `closeTabResources` → `fileTree.closeTab` | yes (one line + manager method) |
| Watchers die with the app | `Controller.shutdown` → `fileTree.dispose()` | yes (one line) |
| Not persisted across `--relaunch` | view tabs are live and in-memory, like markdown/editor tabs | no |

---

## Tests

- `src/file-tree.test.ts` (new; real temp dirs via `fs.mkdtempSync`):
  - `readDirSorted`: dirs before files, case-insensitive alpha within each; excludes `.git`/`.DS_Store`; other dotfiles shown; symlinked dir reported as a file; unreadable dir → `[]`.
  - `buildRows`: collapsed root → only depth-0 rows; expanding a nested dir yields its children at the right depth, in document order; `expanded` paths that no longer exist are skipped.
- `src/file-tree-manager.test.ts` (new). Mock only `watch` from `node:fs` with a partial module mock (`vi.mock('node:fs', …)` spreading `importOriginal()` so `readdirSync`/`statSync` stay real against temp dirs — precedent for module-mocking a native dependency: the `node-pty` mock in `src/controller.test.ts:20`); drive the debounce with `vi.useFakeTimers()`:
  - `open` creates a files tab rooted at the tab cwd, sets the tab's cwd to the root, watches the root.
  - `files <subdir>` resolves relative to cwd; `files <not-a-dir>` errors into the creator's transcript, no tab.
  - Second `files` with the same root focuses the existing tab instead of duplicating.
  - `toggle` expands (rows grow, new watcher) and collapses (rows shrink, watcher closed); `collapseAll` leaves only the root watcher.
  - A watch event triggers exactly one rebuild after the debounce window; a deleted expanded dir is pruned from `expanded` and its watcher closed.
  - `closeTab` closes every watcher for that tab.
- `src/controller.test.ts`: `files` command → new tab with `view: 'files'`, payload rows present in `view()`; `fileTreeToggle`/`fileTreeCollapseAll` RPC dispatch reaches the manager; closing the tab disposes watchers.
- `web/src/FileTreeTab.test.tsx` (new; follow `MarkdownTab.test.tsx` conventions):
  - Renders rows with indentation, chevrons on dirs, `aria-expanded`/`aria-selected`.
  - Click dir → `fileTreeToggle` sent; click file → `command` with `open <path>`; Alt+click file → `edit <path>`.
  - Collapse-all button → `fileTreeCollapseAll`.
- `web/src/file-tree-keys.test.ts` (new): arrow/Home/End/PageUp/PageDown selection moves, `→`/`←` expand-collapse-parent semantics, Enter/Space/Alt+Enter action mapping, type-ahead matching + buffer reset, selection clamp when the selected row disappears.

## Docs and spec

- README `### Commands` (parsed into `help` by `buildHelp`, `src/commands.ts:24`): add a `files` row — *"Open a file tree tab for the current directory"*. README `### Key Bindings`: add the tree navigation keys.
- `spec/file-tree-tab.md` (new, parallel to `spec/markdown-tab.md`): command grammar and errors; tree contents (sorting, excludes, symlinks); watching semantics (visible dirs only, debounce); the full mouse/keyboard tables above; lifecycle (close disposes watchers; not persisted).
- `spec/keyboard-navigation.md`: note that arrow keys are captured by a focused file tree tab.
- The source "## File tree sidebar" block has already been removed from `docs/todo-features.md` — no todo cleanup remains.

## Verification

- `./scripts/run.mjs check-diff` after each step; all server + web tests green.
- Manual end-to-end: run the app, type `files` → a tree tab titled after the project dir opens showing the repo root, dirs first. Expand `src` (click and `→`), scroll, type-ahead to `tab-manager.ts`, press Enter → the editor tab opens it. Back on the files tab, `touch /tmp/…/newfile` inside an expanded dir from another terminal → the row appears within ~a second; delete it → the row disappears. `mkdir` + expand + `rm -r` the dir → tree recovers, selection survives. Alt+click `README.md` → plain editor, not the rendered markdown view. Collapse-all button → only top level remains. Close the tab and quit → no stray watcher errors on shutdown.

## Out of scope (v1)

- File mutations from the tree: new file/folder, rename, delete, duplicate, drag-and-drop moves — and therefore context menus and multi-select. The commands (`open`, `edit`) are read-side today; mutation verbs deserve their own plan.
- Reveal-active-file, filter/find within the tree, git decorations, gitignore dimming, file-type icon themes.
- Multiple roots / workspaces; following symlinked directories.
- Persisting the tree tab or its expansion state across `--relaunch`.

## Gotchas

- **`open` error output is invisible on a files tab.** `open`/`edit` append errors to the issuing tab's transcript, which a view tab doesn't render. Clicks originate from rows that existed moments ago, so failures are rare races (file deleted between render and click) — and the watcher removes such rows almost immediately. Accepted for v1; noted in the spec.
- **View-tab remount loses view state.** `ViewTabBody` renders only the active tab, so switching away drops selection and scroll (expansion survives — it's server-side). Acceptable v1; if it grates, the editor-layer keep-mounted pattern (`App.tsx:148`) is the known fix.
- **Debounce is per tab, rebuild is visible-only.** A `git checkout` storm coalesces into one rebuild of just the expanded directories; cost stays proportional to what's on screen, not repo size.
- **Duplicate open tabs.** Clicking the same file twice opens two editor tabs — that is `open`'s existing behavior everywhere, not something the tree should special-case.
- **Filenames with glob metacharacters.** `open` routes targets containing `* ? [ ] { }` through its glob branch (`isGlobPattern`, `src/commands/open.ts:30`), so clicking a file literally named `foo[1].txt` may mis-resolve. Accepted — it is `open`'s existing behavior, and such names are rare. Spaces in paths are safe: `parseOpen` keeps the target verbatim (`src/commands/open.ts:8`, "paths may contain spaces"), and `edit` takes everything after the keyword.
- **`sonarjs`/file-size limits:** keyboard logic lives in `file-tree-keys.ts` and tree building in `file-tree.ts` precisely to keep every new module under the 200-line cap; relative server imports carry `.js` (NodeNext).

## Checklist

- [ ] `src/types.ts` / `src/protocol.ts` — `FileTreeRow`, `FileTreeView`, `view: 'files'` on `Tab`/`TabView`, `files?` payload, two new `RpcCall` methods
- [ ] `src/file-tree.ts` — excludes, `readDirSorted`, `buildRows` (+ tests)
- [ ] `src/file-tree-manager.ts` — open/toggle/collapseAll, watchers + debounce, closeTab/dispose (+ tests); registered in `managers.ts` + `controller.ts`
- [ ] `src/commands/files.ts` — command; registered in `commands/index.ts` + `availableCommands`
- [ ] `src/tab.ts` / `src/tab-creators.ts` / `src/tab-manager.ts` — `makeFilesTab` / `addFilesTab` / `openFilesTab` + the `files: t.files` mapping in `view()`; `src/tab-cleanup.ts` — watcher disposal
- [ ] `src/index.ts` + `src/controller.ts` — RPC dispatch cases + shutdown disposal
- [ ] `web/src/FileTreeTab.tsx` + `web/src/file-tree-keys.ts` + `theme.css` rows/chevrons/indent guides; `ViewTabBody` branch + new `client`/`index` props + `isViewTab`
- [ ] Tests (server + web); `./scripts/run.mjs check-diff` green
- [ ] README rows (Commands + Key Bindings); `spec/file-tree-tab.md`; `spec/keyboard-navigation.md` note
