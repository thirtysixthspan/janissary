# Find File in the File Navigator

**Complexity: 5/10** — a new async server file-listing module plus a `reveal` method, two new protocol RPCs (one deferred/async reply, one fire-and-forget) wired through message-handler/controller-bridge, and two new web modules (single-pass matcher + pop-up) with a rows-arrive reveal effect and a loading state in `FileTreeTab`; spans server and web with new protocol surface, and the deferred-reply error path plus non-blocking listing are the main correctness/performance nuances, but every piece has close precedent.

The file navigator (file tree tab) gains a **magnifying-glass** button in its header that opens a small search pop-up. The user types part of a filename; the input shows an inline **ghost/shadow completion** of the single best-matching file and, below the input, that file's full path relative to the tree root. Pressing **Enter** dismisses the pop-up, expands whatever directories are needed in the tree, selects the matched file's row, and scrolls it into view. This turns the navigator from a browse-only tree into something you can jump through by name, without hand-expanding every intermediate directory. The searchable set is **gitignore-aware** (it excludes `node_modules`, build output, and anything else `.gitignore` covers), matching how VS Code's "Go to File" behaves; matching is a case-insensitive **substring on the filename** with prefix matches ranked first.

## Design decisions

1. **Single best-match ghost, no results list.** The pop-up is one text input with an inline ghost completion (editor-style) of the top-ranked match, plus a single line below the input showing that match's full root-relative path. There is no scrollable results list. This is the interaction the user chose over a filtered list. When the top match's filename **starts with** the typed query, the remaining characters render as ghost text after the caret and **Tab** accepts them into the input (without closing the pop-up); when the top match is a mid-string substring match (filename does not start with the query), no inline ghost is shown but the full path still appears below and Enter still jumps to it.

2. **Enter reveals in the tree; Escape cancels.** Pressing **Enter** acts on the current top match: it closes the pop-up, expands every ancestor directory of the match in the tree, selects that file's row, and scrolls it into view. Pressing **Escape** closes the pop-up with no change to the tree and returns focus to the tree. Clicking outside the pop-up also closes it (cancel).

3. **Searchable set is gitignore-aware, produced asynchronously (never blocking the event loop).** The candidate list is produced by `git ls-files --cached --others --exclude-standard -z` run with `cwd` = the tree's current root — tracked files **plus** untracked files that are not ignored, so brand-new files are found while `.gitignore`-covered directories (`node_modules`, `dist`, …) are skipped. This reuses git's own exclude machinery rather than parsing `.gitignore` by hand (no `ignore`/glob dependency exists in `package.json`). When the root is **not** inside a git repository (the command fails), fall back to a recursive walk that applies only the five default excludes the tree already skips (`src/file-tree/index.ts:6`, `EXCLUDES`). Either way the result is a flat list of **files only** (directories are not search targets), each path relative to the tree root, matching the tree's own row `path` convention. **The listing must be asynchronous and off the event loop** — spawn git via `execFile`/`execFileAsync` (the exact pattern `src/git-status.ts:44` already uses) and, in the non-git fallback, walk with the promise-based `fs.readdir` (never `execFileSync`/`readdirSync`). The single-threaded server also drives every other tab's PTY output and socket traffic; a synchronous `git ls-files` or a synchronous `readdirSync` walk of a large tree would freeze all of it until it finished. Async keeps the server responsive while the walk runs (see Decision 9 for how the reply is deferred).

4. **Substring-on-filename matching, prefix-ranked.** Matching is case-insensitive substring on the file's **basename** (not the full path). Ranking, mirroring `filterTabs` at `web/src/TabNavPicker.tsx:17`: filename-prefix matches first, then other substring matches, ties broken by shortest path then `localeCompare`. The single top-ranked entry is the "best match" driving the ghost and the path line. An **empty query** shows no ghost and no path line. A query with **no matches** shows the text `(no matching files)` in place of the path line, no ghost, and Enter does nothing (the pop-up stays open).

5. **The list is fetched once per open, filtered client-side.** Opening the pop-up issues one request for the candidate list; the client keeps it in memory and re-filters on every keystroke (no per-keystroke server round-trip), exactly as the `nav` picker filters an in-memory tab list client-side (`web/src/useTabNav.ts:12`). The list is re-fetched each time the pop-up is (re)opened so it reflects the current on-disk state.

6. **The pop-up and button belong to `FileTreeTab`.** The feature is scoped to a single navigator, so the button lives in that tab's header `.files-actions` group and the pop-up renders inside `FileTreeTab` — it is **not** an App-level picker in `PickerOverlays.tsx`. This keeps selection (`FileTreeTab`'s existing `selected` state, `web/src/FileTreeTab.tsx:39`) and the reveal in one place.

7. **Reveal is server-expand + client-select.** On Enter the client sends a new fire-and-forget message telling the server to add every ancestor directory of the target path to that tab's `expanded` set (watching each and rebuilding), and separately sets its own `selected` to the target path. Because the row for the target only appears after the server's rebuilt rows arrive, the scroll-into-view must run **when the rows update**, not only when `selected` changes: a `pendingReveal` ref holds the target path and an effect keyed on `files.rows` selects + scrolls it once its row is present, then clears the ref. This extends the existing scroll effect at `web/src/FileTreeTab.tsx:49-52` rather than replacing it.

8. **Wording.** Button tooltip **Search files**; input placeholder **Find file…**; empty-results line **(no matching files)** (consistent with the `nav` picker's `(no matching tabs)` at `web/src/TabNavPicker.tsx:63`).

9. **The search RPC replies asynchronously (deferred), and delegates off `controller.ts`.** The reply transport already supports a **deferred** reply: `reply` is just `(event) => ws.send(...)` (`src/index.ts:108`) and may be invoked later, and `client.request<T>()` resolves whenever the reply for its id arrives (`web/src/ws.ts:51-53,66`). So the handler kicks off the async listing and calls `reply(...)` from its `.then()`, `return`ing immediately without hitting the trailing `result: 'ok'` reply (`src/message-handler.ts:95`) — exactly the early-`return` shape `complete`/`undoFileTreeItem` use, but resolved later instead of inline. **The async path must catch its own errors and still reply** (with an empty `{ paths: [] }`), because the outer `try/catch` in `src/index.ts:108-110` only catches synchronous throws — an unhandled rejection would leave `client.request` pending forever. Because `controller.ts` is size-constrained (267 lines; its file-tree RPCs already bridge out to a `fileTreeRpc` module, `src/controller.ts:187-188` → `controller-file-tree.js`), the new `fileTreeSearch`/`reveal` handlers delegate through that same module rather than adding fat methods to `controller.ts`.

10. **Rapid, non-blocking client filtering.** The pop-up must feel instant even on a large repo. Because matching only needs the **single best match** (Decisions 1 and 4), per-keystroke work is one linear pass over the in-memory path array (no sort of the whole list required — track the best-ranked candidate in a single scan), which stays well under a frame even for tens of thousands of files; no debounce is needed. While the initial list request is still in flight, the input is live and the path line shows a brief **Searching…** state (rather than a frozen or empty look); results appear the moment the list resolves. The fetched list is capped only by what git/​the walk returns — no artificial limit is needed since only the top match is computed, not a rendered list.

## What already exists (reuse, don't rebuild)

| Need | Reuse | Location |
|---|---|---|
| Async, non-blocking git invocation (`execFile` + fallback-to-empty on non-git) | `changedPaths` / `currentBranch` | `src/git-status.ts:41-65` |
| Deferred RPC reply (invoke `reply` later; `client.request` resolves on the id) | reply plumbing / `client.request` pending map | `src/index.ts:108`; `web/src/ws.ts:51-53,66` |
| Bridging an RPC off `controller.ts` to keep it under `max-lines` | `fileTreeRpc.*` delegation; `openTranscriptFor` bridge | `src/controller.ts:187-188`; `src/message-handler.ts:90-93` |
| A flat, root-relative file list & default excludes | `readDirSorted` / `buildRows` / `EXCLUDES` | `src/file-tree/index.ts:6,14,35` |
| Expanding directories and rebuilding the tree | `FileTreeManager.toggle` (adds to `expanded`, watches, rebuilds) | `src/file-tree/manager.ts:90-101` |
| Server-owned `expanded` set per tab | `FilesTabState.expanded` | `src/file-tree/manager.ts:22,79` |
| Substring filter + prefix-first ranking + match highlight | `filterTabs` / `highlightLabel` | `web/src/TabNavPicker.tsx:17,37` |
| An overlay with its own autofocused input that stops key propagation | `SearchBar` | `web/src/SearchBar.tsx:28-55` |
| Client keeps a list in memory and re-filters per keystroke | `useTabNav` | `web/src/useTabNav.ts:12` |
| RPC-with-reply from the client | `client.request<T>()` | `web/src/ws.ts:66` |
| Fire-and-forget client message | `client.send()` | `web/src/ws.ts:61` |
| Header button styling/placement, chord scoping in the tree | `.files-actions` buttons; `onKeyDown` ctrl/meta handling | `web/src/FileTreeTab.tsx:140-159,97-104` |
| Scroll the selected row into view | selection scroll effect | `web/src/FileTreeTab.tsx:49-52` |
| FontAwesome icon exports | `icons.ts` | `web/src/icons.ts` |

## Proposed changes

**Server — candidate-list source (new module, e.g. `src/file-tree/search.ts`).**
- Add an **async** function that, given an absolute root, resolves to a sorted array of root-relative file paths: run `git ls-files --cached --others --exclude-standard -z` with `cwd` = root using `execFileAsync` (the exact `promisify(execFile)` pattern of `src/git-status.ts:4,44`), split on NUL, and drop empties. On any failure (non-git root, git missing, non-zero exit) fall back to an **async** recursive walk using the promise-based `fs.readdir` (`node:fs/promises`), applying the same directories-vs-files and `EXCLUDES` semantics as `readDirSorted` (`src/file-tree/index.ts:14`) but never using its synchronous `readdirSync`, collecting file (non-dir) paths only. It must be async so the walk of a large tree never blocks the event loop (Decisions 3, 9). Keep this in its own module with a colocated test so `manager.ts` stays under the 200-line `max-lines` limit.

**Server — `FileTreeManager` (`src/file-tree/manager.ts`).**
- Add an **async** method to answer the search request for a tab (by `index`/label): look up the tab's `FilesTabState`, `await` the new search function with `state.root`, and resolve to the file list. This is wired as a deferred-reply RPC (see Protocol).
- Add a `reveal(label, relPath)` method: for the target path, compute each ancestor directory (the path's successive prefixes split on `/`), add any not already in `state.expanded`, `watchDir` each newly-expanded directory (as `toggle` does at `src/file-tree/manager.ts:98`), then `rebuild(label)`. A path whose ancestors are all already expanded still rebuilds harmlessly. Reuse `parentPath` (`src/file-tree/index.ts:72`) / plain prefix splitting for the ancestor computation.

**Protocol (`src/protocol.ts`, `src/message-handler.ts`, `src/controller-file-tree.ts`).**
- Add a request/reply method (e.g. `fileTreeSearch`, params `{ index }`) whose reply `result` carries `{ paths: string[] }`. Dispatch it with a **deferred** reply in `src/message-handler.ts`: call the async bridge, and in its `.then()` invoke `reply({ t: 'rpc-reply', id: message.id, result: { paths } })`, then `return` so the trailing `result: 'ok'` reply (`src/message-handler.ts:95`) does not also fire; add a `.catch()` that replies with `{ paths: [] }` so a failure never leaves `client.request` pending (Decision 9). This differs from the synchronous `undoFileTreeItem`/`complete` handlers, which reply inline. Bridge to the `fileTreeRpc`/`controller-file-tree.js` module rather than adding a fat method to `controller.ts`. Add the method to the `RpcCall` union in `src/protocol.ts` alongside the other `fileTree*` methods (`src/protocol.ts:169-187`).
- Add a fire-and-forget method (e.g. `revealFileTreeItem`, params `{ index, relPath }`) dispatched to the manager's `reveal`, modeled on the existing `fileTreeToggle` handler (`src/message-handler.ts:64`).

**Web — matching helper (new module, e.g. `web/src/file-search-match.ts`).**
- A pure function taking the candidate paths and the query, returning the **single best match** (and enough to rank if ever needed) using case-insensitive basename substring + prefix-first ranking described in Decision 4. Compute the best match in **one linear pass** — track the current best-ranked candidate rather than sorting the whole array — so per-keystroke cost stays O(n) with no allocation of a sorted copy (Decision 10). Factor it out (with a colocated test) rather than inlining, mirroring the `file-tree-keys.ts` / `filterTabs` split. Include a helper that, given the top match and the query, reports the ghost suffix (the filename remainder when the basename starts with the query, else none).

**Web — search pop-up (new component, e.g. `web/src/FileSearchPopup.tsx`).**
- Renders an autofocused input (modeled on `SearchBar`, `web/src/SearchBar.tsx`), the inline ghost completion, and the path/empty line below. Owns the query state; receives the candidate list, a **loading** flag, and callbacks (`onReveal(path)`, `onClose`) as props. While `loading` is true (the list request is still in flight), the input is fully usable and the line below reads **Searching…** instead of a path or the empty message (Decision 10). Handles Enter (reveal top match), Tab (accept ghost), Escape/blur (close), and stops key propagation so tree keys don't fire underneath. Keep it a focused component so it and `FileTreeTab` each stay under `max-lines`.

**Web — `FileTreeTab.tsx`.**
- Add the magnifying-glass button to the `.files-actions` group (`web/src/FileTreeTab.tsx:140-159`) with tooltip **Search files**; clicking it opens the pop-up. On open, set a `loading` state, `client.request({ method: 'fileTreeSearch', params: { index } })`, and on resolve store the `paths` and clear `loading` (guarding against a pop-up that was closed/re-opened before the reply arrived, so a late reply can't repopulate a closed pop-up). The pop-up renders immediately in its **Searching…** state; it never waits on the request to appear.
- Render `FileSearchPopup` when open. Its `onReveal(path)` sets a `pendingReveal` ref, sends `revealFileTreeItem`, and closes the pop-up; a new effect keyed on `files.rows` consumes `pendingReveal` — set `selected` to that path and scroll it into view once its row exists — reusing the scroll logic at `web/src/FileTreeTab.tsx:49-52`.

## Tests

- **`src/file-tree/search.test.ts`** (new): the function is async (returns a promise); in a temp git repo, the list includes tracked and new-but-unignored files and excludes `.gitignore`-matched paths; in a plain (non-git) temp directory, the async fallback walk lists files and skips the default `EXCLUDES`; directories are never included; paths are root-relative.
- **Deferred-reply handling** (extend the message-handler/controller-file-tree test): a successful `fileTreeSearch` resolves `client.request` with `{ paths }`; a failure (non-existent/blown-up root) still replies (`{ paths: [] }`) rather than leaving the request pending.
- **`web/src/file-search-match.test.ts`** (new): basename substring matching is case-insensitive; prefix matches rank before mid-string matches; ties broken by shortest path then name; empty query → no match; the ghost-suffix helper returns the remainder only when the basename starts with the query.
- **`web/src/FileTreeTab.test.tsx`** (extend): the Search-files button renders with its tooltip and opens the pop-up; the pop-up shows **Searching…** before the list resolves and switches to matches after; selecting a match sends `revealFileTreeItem` with the right path and, once the rows include that path, selects it; `(no matching files)` shows for a non-matching query and Enter is a no-op; a reply that arrives after the pop-up is closed does not reopen or repopulate it.
- **Optional server manager test** (extend `src/file-tree/manager.test.ts`): `reveal` adds every ancestor of a nested path to `expanded` and rebuilds so the target row becomes visible.

## Out of scope

- **File-content search** — this finds files by name only, never by their contents.
- **Directory targets** — only files are searchable and revealable; directories are not results.
- **A results list / multi-match cycling** — the pop-up commits to the single top-ranked match (the interaction the user chose). Disambiguating among several equally-named files (e.g. cycling with Tab through candidates) is not included.
- **Global / cross-navigator search** — the pop-up searches only the issuing navigator's own root. The separate `cmd+p` quick-open-into-editor feature is planned independently.
- **Fuzzy subsequence matching** across path segments — matching is plain substring on the basename.
- **Persisting** the pop-up query or the fetched list across navigator close/reopen.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff` after each change (lints changed files, typechecks affected projects, runs server + web tests for the touched areas).
- Manual end-to-end check:
  1. Open a file navigator (`files`, or the folder button on an agent tab) in a git repo with nested directories.
  2. Click the **Search files** magnifying-glass button; the pop-up opens with focus in its input.
  3. Type part of a filename that lives several directories deep and is not yet expanded; confirm the ghost completion shows the best match and the full path appears below.
  4. Press **Enter**; confirm the tree expands the necessary directories, selects the file's row, and scrolls it into view.
  5. Type a query matching a file inside `node_modules` (or another `.gitignore`-covered dir); confirm it is **not** found.
  6. Type a query with no matches; confirm `(no matching files)` shows and Enter does nothing. Press **Escape**; confirm the pop-up closes and the tree is unchanged.
  7. Re-open the pop-up, type a prefix, press **Tab**; confirm the ghost is accepted into the input without closing the pop-up.
  8. **Performance:** open the navigator on a very large tree (e.g. a repo with a populated `node_modules`, or a large non-git directory that exercises the walk fallback). While a harness/agent tab is actively streaming output, open the search pop-up and type: confirm the streaming output and the rest of the UI never freeze (the listing runs off the event loop), the pop-up appears immediately in its **Searching…** state, and matches update with no perceptible per-keystroke lag once the list has loaded.
