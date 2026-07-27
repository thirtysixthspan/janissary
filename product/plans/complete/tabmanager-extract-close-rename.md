# Extract TabManager.closeTab and renameTab into sibling helpers

**Complexity: 3/10** — a mechanical extraction following an already-established pattern
(`src/tab/dock.ts`, `src/tab/reorder.ts`, `src/tab/navigation-commands.ts` were extracted
from `TabManager` the same way), touching one file split into two new ones, with no
behavior change and full existing test coverage.

## Goal

`src/tab/manager.ts` is 257 non-blank/non-comment lines (313 raw), over the 200-line
guideline in `ai/guidelines/code-guidelines.md`. `TabManager.closeTab` and
`TabManager.renameTab` are the last two "full inline operations" that never got extracted
the way `setActiveTab`, `moveTab`, `reorderTab` (→ `navigation-commands.ts`), the dock
resolution (→ `dock.ts`), and tab removal (→ `reorder.ts`) already were. Extract their
bodies into new `src/tab/*.ts` helpers following that same pattern, and call them from
`TabManager`.

## Approach

Follow the pattern used by `navigation-commands.ts` and `dock.ts`: a plain exported
function that takes the manager's relevant state (`tabs`, `activeTab`, etc.) and explicit
callbacks for anything that touches private manager fields (focus-history bookkeeping,
persistence), performs the same computation and `messageBus` emits the original inline
code did, and returns the new state for `TabManager` to assign. `TabManager`'s public API
(`closeTab(index)`, `renameTab(index, title)`) is unchanged, so all existing tests keep
passing unmodified.

- `src/tab/close.ts` — new `closeTabOp` function holding `closeTab`'s body.
- `src/tab/rename.ts` — new `renameTabOp` function holding `renameTab`'s body (this stays
  distinct from `src/tab/rename-editor.ts`, which already holds the editor-specific rename
  mechanics that `renameTabOp` will keep delegating to).

## Implementation steps

1. **`src/tab/close.ts`** (new file) — export `closeTabOp(tabs, activeTab, index, managers,
   openFiles, context, queue, discardFocusHistoryLabel, popFocusHistory)`. Body is
   `TabManager.closeTab`'s current logic verbatim: look up the tab, compute
   `nonDockedCount`, call `closeTabResources`, emit `app:exit` and return `undefined` when
   closing the last non-docked tab, otherwise discard the closing tab's label from focus
   history (via the `discardFocusHistoryLabel` callback), remove it from `tabs`
   (`removeTabAt`), restore focus via `popFocusHistory()` when the closed tab was active,
   clear `hasUnread` on the new active tab, emit `state:dirty`, and return the resulting
   `{ tabs, activeTab }`.
2. **`src/tab/rename.ts`** (new file) — export `renameTabOp(tabs, index, title, maxLength,
   registerFile, watchEditor, persist, buildAgentState)`. Body is `TabManager.renameTab`'s
   current logic verbatim: look up the tab, delegate to `renameEditorTab` for editor tabs or
   do the plain title-trim/assign otherwise, persist, and emit `state:dirty` in both
   branches.
3. **`src/tab/manager.ts`** — replace the two method bodies with thin delegations:
   - `closeTab(index)` calls `closeTabOp` with `this.tabs`, `this.activeTab`, `this.managers`,
     `this.fileRegistry.map`, `this.context`, `this.queue`, a callback that filters the
     given label out of `this.focusHistory`, and `() => this.popFocusHistory()`; assigns
     `this.tabs`/`this.activeTab` from the result when defined.
   - `renameTab(index, title)` calls `renameTabOp` with `this.tabs`, `index`, `title`,
     `TAB_RENAME_MAX_LENGTH`, `(p) => this.registerFile(p)`,
     `(l, p) => this.managers.editorWatch.watch(l, p)`, `(s) => this.persist(s)`,
     `(t) => this.buildAgentState(t)`.
   - Drop the `closeTabResources`/`removeTabAt`/`renameEditorTab` imports that become
     unused in `manager.ts` once their call sites move; add imports for `closeTabOp` and
     `renameTabOp`.
4. Re-check `manager.ts`'s line count; if it drops to 200 or fewer non-blank/non-comment
   lines, remove the `/* eslint-disable max-lines */` at the top of the file (leave it in
   place otherwise — this task only extracts `closeTab`/`renameTab`, not a full pass to get
   the file under the limit).

## Tests

No new test files. `src/tab/manager.test.ts` already exercises `closeTab` and `renameTab`
exhaustively through `TabManager`'s public API (last-tab-closes-app, focus restoration,
queue/context cleanup, editor vs. plain-tab rename, label-vs-title collision, max-length
truncation) — the same way `manager.test.ts` already covers `dock.ts`, `reorder.ts`, and
`navigation-commands.ts` without dedicated test files for those modules. Since the public
API and behavior are unchanged, these tests must continue to pass unmodified and are the
verification for this change.

## Out of scope

- Any other inline operation in `manager.ts` (`setDock`, `view`, `rehydrate`, etc.) — only
  `closeTab` and `renameTab` are in scope per the backlog item.
- Changing `closeTab`/`renameTab` behavior in any way.
- Getting `manager.ts` under 200 lines if this extraction alone doesn't reach it — no
  further extraction beyond `closeTab`/`renameTab`.
