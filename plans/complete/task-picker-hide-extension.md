# Hide the `.md` extension in the task picker's display

**Complexity: 1/10** — display-only change to one render call in one component; the underlying data and command insertion are untouched.

## Goal

The task picker lists rows like `fix-a-small-issue` instead of `fix-a-small-issue.md`. Selecting a
row still inserts `execute ./ai/fix-a-small-issue.md` into the command line exactly as before — only
the on-screen label changes.

## Design decision

**Strip the extension for display only, in `TaskPicker.tsx`; leave `listTasks()` and `pickTask`
untouched.** `src/tasks.ts`'s `listTasks()` deliberately keeps the `.md` suffix in the data it
returns — its own comment says the picker inserts `execute ./ai/<name>` verbatim, and
`web/src/useTaskPicker.ts`'s `pickTask(name)` builds that exact command from the raw `name` prop.
Stripping the extension anywhere upstream of the render call would either break that command or
require re-adding the suffix later — doing it once, at the point of display, is simplest and keeps
the picker's `onClick`/`onPick` wiring (which passes the untouched `name`) unchanged.

## Implementation

1. **`web/src/TaskPicker.tsx`** — render `name.replace(/\.md$/, '')` as the row's visible text
   instead of the raw `name`, while every other use of `name` (the `key`, `onClick={() =>
   onPick(name)}`) keeps passing the untouched filename.

## Tests

- **`web/src/TaskPicker.test.tsx`** — update the existing `renders all task items` case to assert
  the displayed text has no `.md` suffix (`a`, `b` for `a.md`, `b.md`). Add a case confirming
  `onPick` still receives the full filename (`a.md`) when a row showing `a` is clicked, so the
  strip-for-display / keep-for-command split is pinned.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related web tests.
- Manual (not run in this environment): open the task picker (Ctrl+A), confirm rows show names
  without `.md`, pick one, confirm the command line receives `execute ./ai/<name>.md`.

## Out of scope

- `src/tasks.ts` / `listTasks()` — no change; extension stays in the underlying data.
- Any other picker (history, queue, theme, etc.) — this issue is specific to the task picker.
