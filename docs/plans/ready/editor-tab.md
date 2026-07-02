# Plan: Editor Tab

## Goal

A new `editor` view tab for editing plain-text files — markdown, source code, configuration files, `.txt` — in the app. The tab shows the file's name, size, and location in the same metadata header the image tab uses; the body is a hand-rolled text editor with a numbered line gutter, soft-wrapped long lines, mouse-wheel scrolling, full cursor/selection keyboard support, an undo/redo buffer, and Cmd+S / Ctrl+S save back to disk.

---

## Background

### How view tabs work today

View tabs (`'image'`, `'page'`, `'markdown'`, `'harness'`, `'monitor'`) are live, in-memory tabs created server-side and projected to the client through `Controller.view()` → `TabView` (`src/protocol.ts`). The `open <file>` command dispatches through `OpenFileManager` to the opener registry (`src/openers/index.ts`); an opener's `inline` handler registers the file with `TabManager.registerFile()` (which allow-lists the absolute path and returns an `/open/<id>` ref) and calls a `TabManager.open*Tab()` creator. The web client fetches file bytes from `/open/<id>?token=…` (see `src/index.ts` `serveStatic`), and `ViewTabBody.tsx` mounts the matching React component.

The image tab's metadata header is the model for ours: `ImageTab.tsx` renders `image-meta` with `image-name` (basename), `image-size` (human size from `openers/size.ts`), and `image-loc` (absolute path).

### Gaps

1. **No editor.** Text files other than markdown have no opener at all (`open foo.ts` → `No opener for ".ts" files`), and markdown files can only be *viewed* (rendered) — nothing can modify a file.
2. **No write path.** The client↔server protocol is read-only with respect to files: `/open/<id>` serves bytes; no RPC writes them back.
3. **View tabs unmount when inactive.** `ViewTabBody` returns the body only for the rendered tab; harness tabs stay mounted specially for xterm state. An editor with unsaved changes and an undo buffer must likewise survive tab switches.

---

## Approach

### Opening: a new opener plus an `edit` command

- **`editor` opener** (`src/openers/editor.ts`), registered after `markdown` in `src/openers/index.ts`. It claims common plain-text extensions: `.txt`, `.text`, `.log`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.cfg`, `.env`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.rb`, `.go`, `.rs`, `.c`, `.h`, `.cpp`, `.hpp`, `.java`, `.sh`, `.bash`, `.zsh`, `.css`, `.html`, `.xml`, `.sql`, `.csv`. `open notes.txt` therefore opens an editor tab; `open -e notes.txt` (external) hands the file to the OS default app, mirroring the other openers.
- **`edit <file>` command** (new built-in in `src/commands/`), which forces the editor for *any* file the editor can sensibly hold, regardless of which opener owns the extension. This is how a markdown file gets edited — `open readme.md` keeps today's rendered view, `edit readme.md` opens the editor. `edit` reuses `OpenFileManager`'s path resolution (cwd-relative, absolute) but skips the opener registry and calls the editor's `inline` directly. Extensionless files (`Makefile`, `.gitignore`-style dotfiles) are editable via `edit` even though `open` has no opener for them.

Both routes converge on the shared inline handler: stat the file for `humanSize`, `registerFile` it, and call a new `context.openEditorTab(view)`.

### The `EditorView` payload and tab plumbing

Follows `MarkdownView` exactly:

```ts
export type EditorView = {
  name: string;   // basename, e.g. "config.yaml"
  path: string;   // absolute path (the "location")
  size: string;   // human-readable size at open time, e.g. "4.2 kB"
  url: string;    // /open/<id> ref for fetching the contents
};
```

Plumbing changes, each a one-line addition alongside the markdown equivalents:

- `src/types.ts` — `EditorView`; `Tab.view` union gains `'editor'`; `Tab.editor?: EditorView`.
- `src/tab.ts` — `makeEditorTab` (title `'editor'`, like image/markdown tabs).
- `src/tab-creators.ts` — `uniqueEditorLabel` (`editor`, `editor-2`, …) and `addEditorTab`.
- `src/tab-manager.ts` — `openEditorTab(view)`; `view()` projects `editor: t.editor`.
- `src/openers/types.ts` — `OpenContext.openEditorTab`.
- `src/open-file-manager.ts` — wire `openEditorTab` into the context it builds.
- `src/protocol.ts` — `TabView.view` union gains `'editor'`; `TabView.editor?: EditorView`; export the type.

Editor tabs are live and in-memory like the other view tabs — not persisted across relaunch.

### Loading and saving

**Load** exactly as `MarkdownTab` does: `fetch(`${view.url}?token=…`)` → `.text()`. Add the plain-text MIME entries the editor's extensions need to the `MIME` map in `src/index.ts` (all `text/plain; charset=utf-8` unless already present) so responses carry a sane content type; `fetch().text()` decodes UTF-8 either way.

**Save** is the one genuinely new protocol surface. New RPC:

```ts
| { method: 'saveFile'; params: { url: string; content: string } }
```

- `url` is the tab's `/open/<id>` ref, **not** a raw path: the server resolves it through the existing `openFilePath(id)` allow-list, so the client can only ever write to files the user explicitly opened. An unknown id is an error reply.
- Handler in `src/index.ts` `handle()` → `controller.saveFile(url, content)` → new small module `src/editor-save.ts` (keeps `controller.ts` under the line limit): resolve id → `writeFileSync(path, content, 'utf8')` → re-stat for the new `humanSize` → update the owning tab's `editor.size` → `emitState`.
- The RPC reply carries `result: 'ok'` or `error: <message>` (e.g. permission denied); the client resolves its pending save on the reply — `ws.ts` already correlates replies by id for `complete`, reuse that.

### The web editor component

A hand-rolled controlled editor — no external editor dependency. It is deliberately a plain-text editor (no syntax highlighting) in this iteration.

**Rendering model.** The document is `lines: string[]` (split on `\n`). The body is one scrollable container (`overflow-y: auto` — mouse-wheel scrolling comes free). Each logical line renders as a flex row:

- **Gutter cell**: fixed width (sized to the digit count of the last line number), right-aligned, muted color, numbered from 1, `user-select: none`.
- **Content cell**: `white-space: pre-wrap; word-break: break-all;` monospace. Long lines soft-wrap within the cell, so a wrapped line occupies several visual rows while its gutter number sits on the first — the row layout gives correct number↔line alignment with zero measurement code.

The caret is an absolutely positioned blinking element inside the content cell at the cursor's (line, column); selection is rendered by splitting affected lines' text into before/selected/after spans with a highlight background. The row containing the cursor (gutter cell included) carries a current-line highlight class — a subtle background tint, the standard "where am I" cue. Only state, no `contenteditable`.

**Input capture.** A hidden, always-focused `<textarea>` (1×1, transparent, positioned at the caret) receives keystrokes: its `input` event supplies typed text and paste (and keeps IME composition working); `keydown` intercepts everything else before the browser or the app-level handlers see it. The editor calls `stopPropagation()` on keys it consumes so App's global bindings (Ctrl+T collapse, Ctrl+R history, Ctrl+arrows tab moves) never fire while an editor tab is active. Clicking anywhere in the editor refocuses the textarea.

**State model** (extracted to `web/src/editor/model.ts`, pure functions — this is where the tests live):

```ts
type EditorState = {
  lines: string[];
  cursor: { line: number; col: number };
  anchor: { line: number; col: number } | null;  // selection anchor; null = no selection
};
```

Pure transitions: `insertText`, `deleteBackward`, `deleteForward`, `moveCursor(dir, extend)`, `movePage(dir, pageLines, extend)`, `moveLineEdge(edge, extend)`, `moveDocumentEdge(edge, extend)`, `killToLineEnd` (returns the removed text for the kill buffer; deletes the line break when the cursor is already at end of line), `setSelection`, `collapseSelection`, `selectedText`, `replaceSelection`, plus `wordRangeAt(line, col)` for double-click word selection. The kill buffer itself is a single string held by the component (yank is just `insertText` of it) — not a kill ring. Editing operations first delete any active selection, as editors conventionally do.

**Key bindings** (in `web/src/editor/keys.ts`):

| Key | Action |
| --- | --- |
| printable | insert at cursor (replacing selection) |
| `Enter` | split line |
| `Tab` | insert a tab character at the cursor (`preventDefault` — Tab must never move browser focus out of the editor) |
| `Backspace` / `Delete` | delete selection, else char before/after (joining lines at edges) |
| `Arrow keys` | move cursor (clamped; up/down keep a goal column) |
| `Shift+Arrow` | extend selection |
| `PageUp` / `PageDown` | move cursor a viewport's worth of lines |
| `Home` / `End`, `Cmd+Left` / `Cmd+Right`, `Ctrl+A` / `Ctrl+E` | begin / end of current line (`Shift+` extends) — the Cmd aliases matter because many Mac keyboards have no Home/End keys; the Ctrl aliases match the Emacs-style bindings macOS supports in every native text field |
| `Ctrl+Home` / `Ctrl+End`, `Cmd+Up` / `Cmd+Down` | begin / end of document (`Shift+` extends) |
| `Ctrl+F` / `Ctrl+B` | cursor forward / back one character (Emacs style; aliases for `ArrowRight`/`ArrowLeft`) |
| `Ctrl+N` / `Ctrl+P` | cursor to next / previous line (Emacs style; aliases for `ArrowDown`/`ArrowUp`, goal column included) |
| `Ctrl+D` | delete character forward (Emacs style; alias for `Delete`) |
| `Ctrl+K` | kill from cursor to end of line into an internal kill buffer (joins the next line when pressed at end of line) |
| `Ctrl+Y` | yank — reinsert the kill buffer at the cursor |
| `Escape` | clear selection (collapse to cursor) |
| `Cmd+S` / `Ctrl+S` | save (preventDefault — never the browser save dialog; a deliberate divergence from Emacs isearch) |
| `Cmd+Z` / `Ctrl+Z` | undo |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | redo |
| `Cmd+A` | select all (falls out of the selection model for free; `Ctrl+A` is line-begin above, per the macOS/Emacs convention) |
| `Cmd+C` / `Cmd+X` | copy / cut selection via the clipboard API |
| `Cmd+V` | paste — arrives through the hidden textarea's paste/`input` event rather than a keydown intercept, but is listed (and tested) as a first-class binding |

After any cursor movement the caret is scrolled into view (`scrollIntoView({ block: 'nearest' })` on the caret element). PageUp/PageDown compute the page size from the container height and the measured line row height.

**Mouse selection.** `mousedown` on a content cell maps the click to (line, col) — the line index comes from the row, the column from `document.caretPositionFromPoint` (with the `caretRangeFromPoint` fallback) against the cell's text node, resolved to a string offset. Drag extends the selection from the mousedown anchor; `mouseup` ends the drag. Double-click selects the word under the pointer, using a small word-boundary helper in `editor/model.ts` (`wordRangeAt(line, col)`). Clicking a line number in the gutter selects that entire line (the "selection margin" convention); dragging in the gutter extends the selection line-by-line.

**Undo buffer** (`web/src/editor/undo.ts`): two stacks of `EditorState` snapshots (lines arrays are shared structurally, so snapshots are cheap). Push rules:

- Every discrete edit (paste, Enter, deletion with a selection, cut) pushes a snapshot.
- Consecutive single-character typing **coalesces** into one undo step; a pause (>1s), a cursor move, or a different edit kind seals the group.
- Any new edit clears the redo stack.
- Cursor-only movement and selection changes are never undo steps, but each snapshot records the cursor so undo restores it.
- Capped (e.g. 500 entries) to bound memory.

**Dirty state and the header.** The header reuses the image tab's classes: `image-meta` / `image-name` / `image-size` / `image-loc`, so name-size-location appear at the top of the window exactly like the image tab. Additions: a dirty dot (`●`) after the name while the buffer differs from the last-saved text, a transient `Saved` flash (and the refreshed size, recomputed from the buffer byte length) after a successful save, and a visible error line if the save RPC returns an error or the initial load fails.

**Keeping state across tab switches.** Editor tabs join harness tabs in the "always mounted" set: `App.tsx` renders every editor tab's body persistently and toggles `display: none` on inactive ones, instead of routing through `ViewTabBody`'s mount-on-demand path. This preserves the buffer, undo stacks, cursor, and scroll position when the user switches tabs — losing unsaved edits on a tab switch is not acceptable. The hidden textarea only holds focus while its tab is active.

### File layout (respecting the 200-line limit)

New web files, all small and single-purpose:

```
web/src/EditorTab.tsx        — component shell: load/save, header, dirty state, wiring
web/src/editor/model.ts      — EditorState + pure transition functions
web/src/editor/keys.ts       — keydown → model transition dispatch table
web/src/editor/undo.ts       — undo/redo stacks with typing coalescing
web/src/editor/mouse.ts      — point → (line, col) mapping and drag-selection handlers
web/src/editor/render.tsx    — gutter/row/caret/selection-span rendering
```

New server files:

```
src/openers/editor.ts        — the opener (extension list + external/inline)
src/commands/edit.ts         — the `edit <file>` built-in
src/editor-save.ts           — saveFile: id → path via allow-list, write, re-stat, emit
```

Touched files: `src/types.ts`, `src/protocol.ts`, `src/tab.ts`, `src/tab-creators.ts`, `src/tab-manager.ts`, `src/openers/types.ts`, `src/openers/index.ts`, `src/open-file-manager.ts`, `src/controller.ts`, `src/index.ts` (RPC case + MIME entries), `web/src/App.tsx` (persistent mounting, key-handler deference), `web/src/ViewTabBody.tsx` (or bypassed by the persistent path), `web/src/ws.ts` (typed reply for `saveFile`), `web/src/theme.css` (editor styles).

---

## Implementation steps

1. **Types and plumbing** — `EditorView`, `Tab`/`TabView` unions, `makeEditorTab`, `addEditorTab`, `openEditorTab`, `OpenContext`, protocol export. Mirror the markdown tab line-for-line.
2. **Opener and `edit` command** — `src/openers/editor.ts`, registry entry, `src/commands/edit.ts`, MIME additions. At this point `open notes.txt` opens an (empty-bodied) editor tab.
3. **Read-only editor body** — `EditorTab.tsx` + `editor/render.tsx`: fetch content, render gutter + wrapped lines + header, wheel scrolling. Mount persistently in `App.tsx`.
4. **Cursor and keyboard navigation** — `editor/model.ts` movement transitions, hidden textarea, arrows/PageUp/PageDown/Home/End (with Cmd aliases) and document begin/end, caret rendering + scroll-into-view, current-line highlight.
5. **Selection** — shift+arrow extension, Escape collapse, selection spans, mouse down/drag/up mapping, double-click word selection, gutter click/drag line selection, copy/cut, select-all.
6. **Editing and undo** — insert/delete/Enter transitions, typing coalescing, `editor/undo.ts`, Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
7. **Save** — `saveFile` RPC end to end: protocol, `src/editor-save.ts`, `controller.saveFile`, `index.ts` case, client dirty tracking, Cmd/Ctrl+S, saved/error feedback, size refresh.
8. **Verify** — `./scripts/run.mjs check-diff` throughout; manual pass with a small `.txt`, a long-lined `.json` (wrap check), a several-thousand-line source file (scroll/PageDown check), and an `edit README.md` round-trip.

## Testing

- **`web/src/editor/model.test.ts`** — the bulk of the coverage, all pure: cursor clamping at line/document edges, goal-column preservation through short lines, selection extension/collapse/replace, insert/delete across line boundaries, Enter splitting, Tab insertion, page and line/document-edge movement, `killToLineEnd` (mid-line, end-of-line join, last line), `wordRangeAt` boundaries (word middle, whitespace, punctuation, line edges).
- **`web/src/editor/undo.test.ts`** — coalescing rules, redo invalidation on new edits, cursor restoration, stack cap.
- **`web/src/EditorTab.test.tsx`** — renders header (name/size/path) and numbered gutter from fetched content; dirty dot appears on edit and clears on save reply, mirroring `MarkdownTab.test.tsx`'s fetch-mocking pattern.
- **`src/openers/editor.test.ts`** — extension claims, inline calls `openEditorTab` with name/size/url, external falls through to `didOsOpen`, following `markdown.test.ts`.
- **`src/editor-save.test.ts`** — writes through the allow-list, rejects unknown ids, updates the tab's `editor.size`, surfaces write errors.
- **`src/tab.test.ts` / `tab-creators`** — `makeEditorTab` shape and `editor-2` label uniqueness, alongside the existing markdown cases.

## Out of scope (this iteration)

- Syntax highlighting, search/replace, multiple cursors, auto-indent beyond plain Enter.
- Word-wise cursor movement (Ctrl/Option+Left/Right) — deferred deliberately; plain Ctrl+Arrow is already bound app-wide to tab reordering, so this needs a conflict decision first. Double-click word *selection* is in scope (it shares `wordRangeAt` but no keybinding).
- A line:column cursor-position indicator in the header.
- Shift+Insert / Shift+Delete paste/cut aliases, Option+Up/Down paragraph movement, Insert-key overwrite mode, and VS Code-style "cut/copy whole line when nothing is selected".
- **Cross-platform keybinding compatibility.** The bindings target macOS conventions (Cmd for app chords, Ctrl free for the Emacs-style subset). Windows/Linux CUA variants — Ctrl+A select-all, Ctrl+Y redo, Ctrl+C/X/V clipboard, Ctrl+Home/End as the only document-edge chords — would conflict with the Emacs-style Ctrl bindings and need platform detection in `editor/keys.ts`; that split is deliberately not attempted in this iteration.
- The rest of the Emacs surface: Meta/Option bindings, a kill ring (the kill buffer is a single string), Ctrl+Space mark, Ctrl+X prefix chords, Ctrl+T transpose, and Ctrl+S/Ctrl+R incremental search.
- Detecting external modification of the file while the editor is open (last-writer-wins on save).
- A quit/close guard for unsaved changes (candidate follow-up: hook into `QuitDialog`).
- Binary/huge-file guards beyond a simple size ceiling at open time (propose refusing > 2 MB with a note, as a cheap safety valve — decide during step 2).
