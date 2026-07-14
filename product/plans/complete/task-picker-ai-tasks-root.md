# Task picker should open in ./ai/tasks, not ./ai/

**Complexity: 3/10** — a one-line walk-root change plus a matching client-side string change, dead code cleanup, and updates across three tests and a spec. No architecture changes; all consumers of `listTasks`/the picker are already dynamic.

## Goal

Today `listTasks` walks `ai/` from the top, so opening the task picker shows a single collapsed `tasks` row that must be expanded before any task file is visible (since every real task lives under `ai/tasks/`, and `ai/guidelines/`, `ai/personas/` are explicitly excluded at the top level to avoid showing non-task content). After this fix, the picker walks `ai/tasks/` directly, so task files (and any subdirectories under `ai/tasks/`) are visible immediately on open, with no extra expand step, and there is no longer a need to exclude `guidelines`/`personas` by name since they are siblings of `ai/tasks/`, not descendants.

## Approach

Two locations independently hardcode the `./ai/` prefix and must change together:

1. **Server** — `src/tasks.ts:40` (`listTasks`) walks `path.join(root, 'ai')`. Change to `path.join(root, 'ai', 'tasks')`. Once the walk root is `ai/tasks/`, `EXCLUDED_TOP_LEVEL_DIRS` (`guidelines`, `personas`) no longer means anything — those directories are siblings of `ai/tasks/`, not descendants — so the exclusion set and its filter branch become dead code and should be removed.
2. **Client** — `web/src/useTaskPicker.ts:24` (`pickTask`) builds `execute ./ai/${path}` where `path` is relative to whatever root the server walked. This is a second, independently-hardcoded `./ai/` prefix, not derived from the server's walk root. It must become `execute ./ai/tasks/${path}` in lockstep with step 1, or a picked task inserts a command pointing at a nonexistent file (`execute ./ai/fix-a-small-issue.md` instead of the real `ai/tasks/fix-a-small-issue.md`).

No other picker or component is affected — `TaskPicker.tsx`, `task-picker-keys.ts`, and `PickerOverlays.tsx` all consume `TaskRow[]`/paths generically with no hardcoded root, and no other picker shares this walk logic.

## Implementation steps

1. `src/tasks.ts`:
   - Change `listTasks`'s walk call from `walk(path.join(root, 'ai'), '', 0)` to `walk(path.join(root, 'ai', 'tasks'), '', 0)`.
   - Remove `EXCLUDED_TOP_LEVEL_DIRS` and the `(depth > 0 || !EXCLUDED_TOP_LEVEL_DIRS.has(dirent.name))` condition in the directory filter, simplifying it to just `dirent.isDirectory()`.
   - Update the top-of-file comments (the `EXCLUDED_TOP_LEVEL_DIRS` comment, and the `listTasks` doc-comment referencing "the top-level `ai/` directory" and the exclusion) to describe the new `ai/tasks/` root with no exclusions.
2. `web/src/useTaskPicker.ts:24` — change `execute ./ai/${path}` to `execute ./ai/tasks/${path}`. Update the file's top comment (`Selecting a task writes execute ./ai/<path>...`) to match.
3. `web/src/TaskPicker.tsx:7` — update the comment referencing `execute ./ai/<path>` to `execute ./ai/tasks/<path>`.

## Tests

- `src/tasks.test.ts`:
  - Update `writeTask`'s fixture path from `path.join(root, 'ai', ...)` to `path.join(root, 'ai', 'tasks', ...)`, and the `beforeEach` setup to `mkdirSync(path.join(root, 'ai', 'tasks'), { recursive: true })`.
  - Remove the `'excludes the guidelines and personas subdirectories'` test — the exclusion no longer exists once the walk root is `ai/tasks/`.
  - Keep the remaining tests (top-level listing, ignoring non-.md files, recursion, empty-list cases) — they exercise `listTasks` generically and pass unchanged once fixtures point at `ai/tasks/`.
- `web/src/useTaskPicker.test.ts:49` — update the assertion from `execute ./ai/fix-a-small-issue.md` to `execute ./ai/tasks/fix-a-small-issue.md`.

## Spec updates

- `specs/task-picker.md`:
  - "Listing" section: change "The picker lists the `.md` files inside `ai/`... recursing into subdirectories" to describe listing files inside `ai/tasks/`, and remove the `ai/guidelines/`/`ai/personas/` exclusion sentence (no longer applicable — those directories are outside the walked tree).
  - Remove the sentence documenting the current bug ("Since every task file lives under `ai/tasks/`, opening the picker shows a single collapsed `tasks` row... it must be expanded once...") — this behavior no longer exists after the fix.
  - Update the "Return, or clicking a file row" table entry: `execute ./ai/<path>` → `execute ./ai/tasks/<path>`.
  - The closing line "When `ai/tasks/` has no task files, the picker shows `(no tasks)`" already anticipates the new root and needs no change.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks affected projects, runs related server + web tests.
- Manual: not performed in this environment (no way to drive the Electron/web app here); behavior is covered by the updated automated tests, which directly exercise `listTasks`'s walk root and `pickTask`'s inserted command string.

## Out of scope

- The task-picker keyboard-focus/harness-tab issue (separate tracked issue) — not touched here.
- `src/controller.test.ts`'s harness-profile fixtures that reference `execute ./ai/fix-a-small-issue.md` in unrelated JSON config parsing tests — these test `run`/`schedule` config string literals, not `listTasks` or the picker, and don't need to change for this fix.
