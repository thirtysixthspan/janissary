# Navigate into task-picker subdirectories with Left/Right arrows

**Complexity: 6/10** — not new architecture (`FileTreeTab`/`file-tree-keys.ts` is a direct template to mirror), but it touches the shared server↔client protocol type for `tasks` and every file in the task-picker's data path (server listing, protocol, client state, key handling, rendering).

## Goal

The task picker (Ctrl+A / `tasks`) recursively lists `.md` files in subdirectories under `ai/`, showing directories as collapsed rows by default. Right arrow expands a directory (revealing its children indented beneath it); Left arrow collapses an expanded directory, or moves the selection up to the parent directory if the selected row is already collapsed or is a file. Up/Down move the selection through the currently-visible rows as before. Enter on a file picks it (unchanged); Enter on a directory toggles it, mirroring Right/Left.

## Design decisions

**`ai/guidelines/` and `ai/personas/` stay excluded by name; every other subdirectory becomes navigable.** `src/tasks.ts`'s existing comment and test (`excludes subdirectories such as guidelines and personas`) document a deliberate distinction: those two hold binding project docs and monitor persona bodies, not executable task prompts, and picking one would insert a nonsensical `execute ./ai/guidelines/...` command. The issue asks for *tasks* in subdirectories to become reachable — it doesn't ask to reclassify known non-task content as tasks. So the fix keeps the two names hard-excluded and makes recursion generic for anything else, which is both the literal ask (future task subdirectories become browsable) and preserves the already-tested boundary.

**Expand/collapse state is client-local, not server-round-tripped.** `FileTreeTab` mirrors the file *navigator*, which needs live filesystem watching per expanded directory, so its expand state lives server-side (`FileTreeManager`, `fileTreeToggle` RPC) and the server sends only the currently-visible rows. The task list has no such live-watching requirement — it's already re-read from disk on every state broadcast, same as today. So the server sends the *full* recursive tree every time (all rows, all depths), and the client — inside `useTaskPicker` — holds a `Set<string>` of expanded directory paths and filters the full tree down to the currently-visible rows itself. This avoids adding a new manager, a new RPC, or any server-side mutable state for a picker overlay that's disposable UI state.

**A dedicated `task-picker-keys.ts`, not an extension of `handlePickerKey`.** `web/src/keyboard-handlers.ts`'s `handlePickerKey` is shared, as a plain flat-`string[]` list navigator, by the theme picker and the recent-commands picker as well as (today) the task picker. Directory/file distinction and Left/Right semantics don't fit that shared shape, and bending it would risk the other two pickers. Following `file-tree-keys.ts`'s precedent (`handleFileTreeKey`, kept in its own module, pure and unit-testable without rendering), the task picker gets its own small module.

**Row shape mirrors `FileTreeRow` but drops the `expanded` field from the wire type.** The server-sent `TaskRow` is `{ path, name, depth, dir }` — no `expanded`, since the server has no opinion on it. The client's flatten step (`flattenVisibleTaskRows`) produces a client-only `VisibleTaskRow = TaskRow & { expanded?: boolean }` (expanded computed from the client's `Set`), analogous to how `FileTreeRow.expanded` is populated server-side today — same shape, different owner.

## Server changes

1. **`src/tasks.ts`** — replace the single non-recursive `readdirSync` with a depth-first recursive walk of `ai/`, skipping `guidelines` and `personas` by name at any recursion depth 0 (only at the top level, matching today's behavior — nested directories named similarly, if any existed, are not specially excluded since the two known names are only ever top-level). Returns `TaskRow[]`: for each directory, push a `{ path, name, depth, dir: true }` row, then recurse into it (children immediately follow, depth-first, so the flat array is already in display order); for each `.md` file, push `{ path, name, depth, dir: false }`. `path` is the slash-joined path relative to `ai/` (e.g. `sub/example.md`, not `ai/sub/example.md`); `name` is the basename. Sort each directory's own entries (files and subdirectories together) alphabetically via `localeCompare`, matching the existing top-level sort.

2. **`src/types.ts`** — add `TaskRow = { path: string; name: string; depth: number; dir: boolean }` near `FileTreeRow`, with a short comment distinguishing it (no `expanded` — the client owns that).

3. **`src/protocol.ts`** — import/re-export `TaskRow` alongside `FileTreeRow`; change `StateEvent.tasks: string[]` to `tasks: TaskRow[]`.

4. **`src/index.ts` / `src/message-handler.ts`** — no code changes; both already just spread `tasks: listTasks()` into the state event, and `listTasks`'s new return type flows through.

## Web changes

5. **`web/src/task-picker-keys.ts` (new)** —
   - `VisibleTaskRow = TaskRow & { expanded?: boolean }`.
   - `flattenVisibleTaskRows(rows: TaskRow[], expandedPaths: Set<string>): VisibleTaskRow[]` — depth-first walk of the full row list; while inside a collapsed directory's subtree (tracked by a `hideBelowDepth` depth marker), skip rows; otherwise include the row (annotating `expanded` when it's a directory) and, if it's itself a collapsed directory, arm the marker with its depth so its children are skipped next.
   - `handleTaskPickerKey(rows: VisibleTaskRow[], index: number, key: string): { index: number; action?: { type: 'toggle' | 'pick' | 'close'; path?: string } }` — ArrowUp/Down clamp-move `index` over `rows`; ArrowRight on a collapsed dir toggles it (index unchanged, children appear next render), on an expanded dir moves `index` to its first child, on a file is a no-op; ArrowLeft on an expanded dir toggles (collapses) it, otherwise moves `index` to the row's nearest shallower-depth ancestor (or stays put at a top-level row); Enter toggles a dir or picks a file; Escape closes. Helpers `parentIndex`/`firstChildIndex` walk `rows` by `.depth`, mirroring `file-tree-keys.ts`'s `parentOf`.
   - `dispatchTaskPickerKey(e, rows, index, setIndex, toggleDir, pickTask, setOpen)` — the `useWindowKeys` dispatch glue: guards on the handled key set, calls `preventDefault()`, runs `handleTaskPickerKey`, and applies the resulting index/action via the passed callbacks. Keeps `useWindowKeys.ts`'s `dispatchModalKey` branch a single call, matching its existing style for the other pickers.

6. **`web/src/useTaskPicker.ts`** — accepts `tasks: TaskRow[]` (was `string[]`). Adds `expandedTaskDirs` state (`Set<string>`) and `toggleTaskDir(path)` setter (add/remove from the set). Computes `visibleTasks = useMemo(() => flattenVisibleTaskRows(tasks, expandedTaskDirs), [tasks, expandedTaskDirs])`. `pickTask(path)` unchanged in body (still `execute ./ai/${path}` — `path` now may include subdirectories, which is exactly the desired command). Returns `visibleTasks` and `toggleTaskDir` alongside the existing fields.

7. **`web/src/TaskPicker.tsx`** — `items: string[]` → `rows: VisibleTaskRow[]`; add `onToggleDir: (path: string) => void`. Each row's `onClick` toggles for a directory, picks for a file. Directory rows render a chevron (▸/▾) and indent via `paddingLeft: 12 + row.depth * 16` (matching `FileTreeTab`'s row styling); file rows keep the existing `.md`-stripped label (from the prior fix) with the same indent.

8. **`web/src/theme.css`** — add a `.picker-chevron` rule (`flex: none; width: 1em; color: var(--muted); font-size: 10px;`), matching `.files-chevron`; give `.picker-row` `display: flex; align-items: center;` so the chevron and label sit inline (currently a plain block — verify this doesn't visually regress the other pickers that reuse `.picker-row` with plain text, since flex on a single text node is a no-op visually).

9. **`web/src/ws.ts`** — `StateListener`'s 7th parameter type: `tasks: string[]` → `tasks: TaskRow[]` (import `TaskRow` from `@shared/protocol`).

10. **`web/src/App.tsx`** — `useState<string[]>([])` → `useState<TaskRow[]>([])` for `tasks`; destructure `visibleTasks, toggleTaskDir` from `useTaskPicker`; `stateReference`'s snapshot field renames `tasks` → `visibleTasks`; `keyCallbacksRef` gains `toggleTaskDir`; `PickerOverlays` call passes `rows={visibleTasks}` and `onToggleDir={toggleTaskDir}` instead of `tasks={tasks}`.

11. **`web/src/useServerState.ts`** — `setTasks: (tasks: string[]) => void` → `(tasks: TaskRow[]) => void`.

12. **`web/src/PickerOverlays.tsx`** — `tasks: string[]` prop → `taskRows: VisibleTaskRow[]`; add `onToggleDir: (path: string) => void`; forward as `<TaskPicker rows={taskRows} selected={taskPickerIndex} onPick={onPickTask} onToggleDir={onToggleDir} />`.

13. **`web/src/useWindowKeys.ts`** — `StateSnapshot.tasks: string[]` → `visibleTasks: VisibleTaskRow[]`; `Callbacks` gains `toggleTaskDir: (path: string) => void`; the `taskPickerOpen` branch in `dispatchModalKey` calls `dispatchTaskPickerKey(e, snap.visibleTasks, snap.taskPickerIdx, cb.setTaskPickerIndex, cb.toggleTaskDir, cb.pickTask, cb.setTaskPickerOpen)` instead of `handlePickerKey`.

## Tests

- **`src/tasks.test.ts`** — update the "excludes subdirectories" case to assert `guidelines`/`personas` are still excluded, and add cases: a non-special subdirectory (e.g. `extra/`) appears as a `dir: true` row followed by its `.md` children as `dir: false` rows with `depth: 1` and `path` prefixed `extra/`; nested (two-level) subdirectories produce correct `depth`/`path`; sorting interleaves files and directories alphabetically within a directory.
- **`web/src/task-picker-keys.test.ts` (new)** — mirrors `file-tree-keys.test.ts`'s structure: `flattenVisibleTaskRows` hides a collapsed directory's descendants and reveals them once expanded (including a nested collapsed-within-expanded case); `handleTaskPickerKey` cases for Up/Down clamping, Right expanding a collapsed dir vs. descending into an expanded one, Left collapsing vs. moving to parent, Enter on dir vs. file, Escape closing, and a no-op Right on a file.
- **`web/src/useTaskPicker.test.ts`** — update existing tests for the new `TaskRow[]` input shape; add a case that `toggleTaskDir` adds/removes a path from `expandedTaskDirs` and that `visibleTasks` reflects it (children hidden/shown).
- **`web/src/TaskPicker.test.tsx`** — update for the `rows`/`onToggleDir` prop shape; add a case that clicking a directory row calls `onToggleDir` (not `onPick`) and a file row still calls `onPick` with its full path.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server/web tests.
- Manual (not run in this environment): open the task picker, confirm top-level tasks show unchanged; if a non-special subdirectory with task files exists, confirm it appears collapsed, Right expands it revealing indented children, Left on a child moves to the parent directory row, Left on the expanded directory collapses it, and picking a nested file inserts `execute ./ai/<subdir>/<file>.md`.

## Out of scope

- Making `ai/guidelines/` or `ai/personas/` browsable/pickable — they remain excluded, per the existing design boundary.
- Server-side expand state, a new RPC, or file-watching for the task list — client-local state is sufficient since the list has never needed live watching.
- Type-ahead search, Home/End/PageUp/PageDown, or a "reroot" concept in the task picker — `handleFileTreeKey`'s full feature set is a superset; only Up/Down/Left/Right/Enter/Escape are needed here, matching the picker's existing key surface plus the two new arrow keys.
