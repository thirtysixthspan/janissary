# File navigator drag-to-command-bar

**Complexity: 5/10** — no new RPC or persistence, but the client-side wiring is real: a new wire field, a hit-test extension, a second ref-exposed imperative escape hatch threaded across two branches of the component tree, and a new highlight mechanism, touching five-plus web files plus their tests.

Dragging a row in the file tree tab and releasing it over the command bar inserts that file or directory's path — relative to the target tab's current working directory — into the command bar at the caret, without moving the file on disk. This gives a fast way to reference a file from the tree while composing a command (`open `, `edit `, etc.) instead of typing or tab-completing the path by hand. It reuses the tree's existing click-drag-release gesture (the same one that already moves files between directories) and adds a second possible drop target — the command bar — alongside the existing directory-row drop target.

## Design decisions

1. **The inserted path is relative to the target tab's cwd**, not the file tree's own root. The target tab is whichever tab's command bar receives the drop — its own commands (`open <path>`, `edit <path>`) already resolve relative arguments against that tab's cwd, so the dropped path must match.

2. **The path lands at the current caret position**, replacing any active selection — the same behavior a normal paste would have. It does not append to the end of the command bar's text and does not replace the box's entire contents.

3. **Both file and directory rows can be dropped onto the command bar.** This mirrors the tree's existing move-drag, which already lets either kind of row be picked up.

4. **The command bar is not a valid drop target whenever `CommandInput` isn't mounted for the active tab — and this needs no special-casing, it falls out of the hit-test itself.** `CommandInput` is only rendered when the active tab is a plain agent tab with no live PTY (`App.tsx`'s `!isViewTab && !current.activePty` guard, `useViewSearchState.ts`'s `VIEW_TAB_KINDS`); it is absent for every view-kind active tab — `image`, `markdown`, `page`, `editor`, `notifications`, a harness tab (a live PTY, no textarea — the same case `populateCommandLine`'s existing PTY fallback handles for picker selections), and **the file tree tab itself** when it is the active, non-docked (center) tab. It is also swapped out for `SearchBar` while transcript search is open (`CommandArea.tsx`). In every one of these cases the new hit-test marker (Decision/step below) simply isn't in the DOM, so `hoveredRowPath`-style hit-testing naturally finds nothing there — no highlight, no insertion, no per-case branching required in the drag code. One concrete consequence: dragging within a center-mounted, active file tree tab can never find a command-bar target (there is none while it's active), so in practice this feature is only ever reachable when the file tree is docked into a sidebar while some other, plain agent tab is active in the center.

5. **The inserted path is never quoted, regardless of whether it contains spaces.** `open`/`edit` (`src/commands/open.ts:9-26`, `src/commands/edit.ts:9-13`) take everything after the keyword as a single verbatim target string — they do not split on spaces and do not strip surrounding quotes. Wrapping the path in quotes would insert literal quote characters that these commands would treat as part of the filename, breaking a direct drop-then-`open` flow. A path with a space already works correctly today when typed unquoted after `open`/`edit`, so the drop simply inserts the raw path text. (`edit` does additionally strip a trailing `:<digits>` suffix as a line-number, `edit.ts:11-13` — irrelevant here since real file/directory paths dropped from the tree essentially never end in `:<digits>`, but worth knowing if a future change makes that ambiguous.)

6. **Resolving the path relative to the target tab's cwd happens entirely client-side, with no new RPC.** The file tree's wire payload (`FileTreeView`, `src/types.ts:115`) currently sends only a display-abbreviated root (`root`, already shortened via `abbreviatePath` before being sent — `src/tab/view.ts:47`); it does not currently carry the tree's real absolute root path, which is needed to combine with a row's tree-relative `path` and then compute that combination's path relative to the target tab's (unabbreviated) `cwd`. Rather than adding a request/response RPC that resolves the relative path on the server (and introduces a round-trip delay before the path appears), `FileTreeView` gains a second field, `absoluteRoot`, carrying the real absolute root (`src/file-tree-manager.ts:82`'s `root`, already an absolute path before it reaches `buildTabView`), and a small new pure client-side utility computes the relative path locally. This keeps the drop-to-insert interaction synchronous, matching how releasing a drag over a directory row already applies instantly (fire-and-forget) rather than waiting on a server round trip.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Click-drag-release gesture (threshold, ghost label, global mousemove/mouseup, Escape/blur cancel) | `useFileTreeDrag` | `web/src/useFileTreeDrag.ts` |
| Pure drop-target resolution logic (given rows + dragged path + hovered path) | `resolveDropTarget` | `web/src/file-tree-drag.ts` |
| Hit-testing an arbitrary DOM element under the pointer during a drag | `hoveredRowPath` (via `document.elementFromPoint`) | `web/src/useFileTreeDrag.ts:32-36` |
| A docked file tree (in a sidebar) and an active tab's command bar are DOM siblings, not nested — confirms a pointer-based hit test works across that boundary | `AppShell` (`Sidebar` / `app-center` as siblings) | `web/src/AppShell.tsx` |
| Populating the command bar without submitting, plus the harness-tab PTY-input fallback | `populateCommandLine` | `web/src/populate-command-line.ts` |
| Splicing text into the command bar at the current caret/selection, dispatching a real `input` event | `insertNewline` | `web/src/CommandInput.tsx:79-88` |
| A ref-exposed imperative function the parent can call into the command bar (the `recallRef` pattern) | `recall` / `recallRef` | `web/src/CommandInput.tsx:44-48` |
| Server-side absolute-vs-abbreviated path handling to model the new wire field on | `shorten` / `abbreviatePath`, `tab.files.root` (absolute before shortening) vs. `tab.cwd` (sent raw) | `src/tab/manager.ts:350-352`, `src/tab/view.ts:10,25,47` |
| Existing drag/drop interaction spec to extend | "Moving files by drag-and-drop" section | `product/specs/file-tree-tab.md` |

## Proposed changes

### Wire payload

`FileTreeView` (`src/types.ts:115`) gains a second field, `absoluteRoot: string`, carrying the tree's real, unabbreviated absolute root path, alongside the existing display-abbreviated `root`. `buildTabView`'s file-tree mapping (`src/tab/view.ts:47`) is updated to populate both fields: `root` continues to be `tab.files.root` passed through `shorten`, and the new `absoluteRoot` is the same `tab.files.root` value passed through unshortened, verbatim.

### Client-side relative-path computation

A new small pure utility (sibling to `file-tree-drag.ts`) computes a path relative to a base directory, given two absolute, `/`-separated paths — a minimal POSIX-style equivalent of Node's `path.relative`, since the browser bundle does not currently depend on Node's `path` module anywhere in `web/src` (confirmed: no existing import of `path` or `node:path` under `web/src`). It is used to combine a dragged row's tree-relative `path` with the tree's new `absoluteRoot` field into an absolute path, then relativize that against the target tab's `cwd` (already sent raw/absolute on `TabView`, `src/protocol.ts:38`).

### Drop-target detection

The existing drag gesture (`useFileTreeDrag`) is extended to also hit-test, at move and release time, for a stable marker on the command bar's outer container (a new `data-` attribute added to `CommandInput`'s root element), the same way `hoveredRowPath` already hit-tests for a file-tree row via `data-path`. Three drop outcomes become possible on release: over a tree row (existing move behavior, unchanged), over the command bar marker (new: insert-path behavior), or neither (existing no-op/cancel).

### Insert-at-caret

`CommandInput` gains a second ref-exposed imperative object, following the same pattern `recallRef`/`recall` already establishes, exposing two functions: `insertAtCaret(text)`, which splices given text into the textarea at the current caret position (or over the current selection) rather than replacing the whole value — reusing `insertNewline`'s existing selection-splice/`input`-event-dispatch approach (`CommandInput.tsx:79-88`) as the model, generalized to arbitrary inserted text instead of a fixed `\n` — and `setDropHighlighted(active: boolean)`, which toggles a `drop-target` class (reusing the same class name `FileTreeTab.tsx` already uses for row highlighting, `FileTreeTab.tsx:158`) on `CommandInput`'s root `<div className="command-area">` (`CommandInput.tsx:161`). Both are exposed together on one new ref object (call it `dropRef`) rather than as two separate refs, since they are always consumed together by the same caller. `setDropHighlighted` exists because, unlike the row highlight (computed from state already local to `FileTreeTab`), the command bar's highlight must be driven imperatively across a component-tree boundary — see Wiring below — so it cannot be plain conditional-class-from-props.

`CommandInput`'s root `<div>` also gains the new hit-test marker attribute, `data-command-bar` (a bare boolean attribute, present whenever `CommandInput` is mounted), mirroring the existing `data-path` marker `useFileTreeDrag`'s `hoveredRowPath` already hit-tests for on tree rows (`useFileTreeDrag.ts:32-36`).

### Wiring the drop to the insert

`Sidebar` (`web/src/Sidebar.tsx`) and `CommandArea`/`CommandInput` are not siblings that need some new cross-tree mechanism — both are descendants of `App`, exactly like the existing `recallRef`/`inputReference` refs that `App.tsx` already threads down two separate branches to serve both `CommandInput` and the queue/task/profile pickers (`App.tsx:58-61`, `:96`, `:99`). The new `dropRef` (Insert-at-caret, above) and the currently-active tab's `cwd` (`current.cwd`, already computed in `App.tsx` as `current`) follow the same shape: created/held in `App.tsx`, passed through `CommandArea` into `CommandInput` on one branch (for `dropRef` to be assigned, mirroring `recallRef`), and through `AppShell` (`web/src/AppShell.tsx`) into `Sidebar` into `FileTreeTab` into `useFileTreeDrag` on the other branch, alongside the existing `client`/`index` `useFileTreeDrag` already receives — this means `AppShell`'s and `Sidebar`'s prop types both grow by two fields (the ref and the cwd).

The center-mounted `FileTreeTab` (rendered by `ViewTabBody`, `web/src/ViewTabBody.tsx:23-24`, when the file tree itself is the active tab) does **not** need this wiring at all: per Decision 4, `CommandInput` is never mounted while a view-kind tab (including `files`) is active, so a center-mounted, active file tree tab can never find `data-command-bar` in the DOM regardless of what it's given — threading `dropRef`/cwd into `ViewTabBody`'s call site would be dead code. Only the `Sidebar`-mounted `FileTreeTab` (docked while some other, plain agent tab is active in the center) can ever produce a valid command-bar drop.

At drag-move and drag-release time, the hit-test in `useFileTreeDrag` additionally checks for a `[data-command-bar]` ancestor (alongside the existing `[data-path]` check) and, when found, calls `dropRef.current?.setDropHighlighted(...)` on hover changes and `dropRef.current?.insertAtCaret(relativePath)` on release — computing `relativePath` from the dragged row's tree-relative `path`, the tree's `absoluteRoot`, and the passed-in target `cwd` (Client-side relative-path computation, above). No RPC is sent for this drop outcome, unlike the existing directory-row `moveFileTreeItem` send.

### Visual feedback

While a drag is over the command bar, it is highlighted the same way a valid directory-row target is today (`FileTreeTab.tsx`'s `drop-target` class, `FileTreeTab.tsx:158`) — via `setDropHighlighted` (above) rather than a class computed from local render state, since the command bar lives outside `FileTreeTab`'s own subtree. The existing drag-ghost label that follows the cursor (`FileTreeTab.tsx`'s `.files-drag-ghost`) needs no change — it already renders at a fixed screen position and will keep following the cursor as it moves over the command bar.

### File-size headroom

`CommandInput.tsx` is already ~147 non-blank/non-comment lines against the 200-line `max-lines` cap (`FileTreeTab.tsx` similarly ~170); the new `insertAtCaret`/`setDropHighlighted` pair and the `data-command-bar` attribute are a modest addition and likely fit, but if `CommandInput.tsx` crosses 200 lines once written, extract the two new functions' pure logic (the string-splice math for `insertAtCaret`; the classList toggle for `setDropHighlighted` needs no extraction, it's one line) into a new sibling pure module — mirroring how `command-completion.ts` and `ghost-suggestion.ts` are already split out of `CommandInput.tsx` — keeping only the thin DOM-touching wrapper inline. Do not compact or strip comments to stay under the limit (see `ai/guidelines/code-guidelines.md`).

## Tests

- **A new sibling test file for the relative-path utility** (named to match wherever the utility itself lands, e.g. `web/src/file-tree-relative-path.test.ts`) — cases for the new relative-path computation: same directory, target nested under root, root nested under target, sibling directories requiring `..` segments, and the no-op case where root and target are identical.
- **`web/src/useFileTreeDrag.test.ts`** — extend with cases covering: a drag released over the `data-command-bar` marker calls `dropRef.current.insertAtCaret` with the expected relative path (not the `moveFileTreeItem` send); a drag released over a tree row still behaves exactly as before (regression coverage); a drag released over neither is a no-op; a drag over where the command bar would be, while the active tab has no `CommandInput` mounted (harness tab is the concrete case to drive, per Decision 4), finds no marker and is not treated as a valid target.
- **`web/src/CommandInput.test.tsx`** — cases for the new `insertAtCaret`: inserting into an empty box, inserting at a mid-string caret position, inserting over an active selection (replacing it), and confirming existing `recall` (replace-all) behavior is unchanged. Add a case for `setDropHighlighted(true)`/`(false)` toggling the `drop-target` class on the root element.
- **`web/src/FileTreeTab.test.tsx`** — a case confirming a drag over a docked `FileTreeTab`'s sibling command bar calls through to highlight it (mirroring the existing directory-row highlight test, if one exists there); this needs the `Sidebar`-mounted rendering path, not `FileTreeTab` in isolation, since the command bar lives outside `FileTreeTab`'s own subtree.
- **`src/tab/view.test.ts`** — confirm `FileTreeView`'s new `absoluteRoot` field carries the pre-shortened value while the existing `root` field remains shortened, unchanged from today.

## Out of scope

- Multi-row drag — the tree has no multi-select today, and this feature does not add one.
- Dropping onto anything other than the command bar of the active tab — e.g. there is no way to target a different, inactive tab's command bar directly.
- Any change to how `open`/`edit`/other commands parse their arguments (quoting, tokenizing) — this feature only affects what text gets inserted, never how the app's commands interpret it.
- Undo/redo for the inserted text — the command bar's existing native text-editing undo (browser-level, via `execCommand`/normal `input` events) is what applies, the same as typing or pasting; no new undo stack is added.
- Dropping a file tree row onto anything other than a directory row or the command bar (e.g. onto the transcript, onto another tab in the tab strip) — remains a no-op, unchanged from today.
- Dragging within a center-mounted, active file tree tab has no reachable command-bar target at all (see Decision 4) — not a bug to fix, since the tree must be docked to a sidebar for another tab's command bar to be visible at the same time.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open a file tree tab (`files`) and dock it into a sidebar (it must be docked — a non-docked/center file tree tab has no other tab's command bar visible alongside it, see Decision 4/Out of scope), then focus an agent tab in the center whose cwd differs from the tree's root, type `open ` into its command bar, then drag a file row from the docked tree and release it over the command bar — confirm the correct path (relative to the *tab's* cwd, not the tree's root) is inserted at the caret, that the file is not moved on disk, and that submitting the resulting command opens the right file. Repeat with a directory row. Also confirm: switching the center's active tab to a harness tab and dropping over its area does nothing (no highlight, no insertion); dropping onto a directory row in the tree still moves the file as before; and dropping while the active tab has the transcript search bar open (in place of the command bar) also does nothing.
