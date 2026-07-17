# Task picker tasks from two directories

## Summary

The task picker today lists only the `.md` files under the project working directory's `ai/tasks/` (via `listTasks`, which walks `<cwd>/ai/tasks`). This feature makes the picker draw tasks from **two** places: the project working directory's `ai/tasks/` **and** the Janissary codebase's own `ai/tasks/` (the built-in tasks that ship with the `janus` package — `build-a-feature.md`, `fix-a-small-issue.md`, and the like). This lets a user run Janissary's shipped task prompts from any project, while still surfacing that project's own task files.

The two sources render as **two labeled sections** in the picker — a "Project" section and a "Janissary" section — so provenance is always clear. When the same task path exists in both directories, the **project copy wins** and the built-in copy is hidden, letting a project customize a shipped task by name. Because a built-in Janissary task file does not live under the project's `./ai/tasks`, selecting one inserts an **absolute-path** command (`execute <janissary-ai-tasks-dir>/<path>`) so the agent can find the file regardless of its working directory, while project tasks keep the existing relative form (`execute ./ai/tasks/<path>`).

## Design decisions

- **Two sources, always both.** The picker always reads both the project working directory's `ai/tasks/` and the Janissary install's `ai/tasks/`, matching the feature's "taken from two places" requirement. The Janissary directory is resolved from the running package's own location (the same `import.meta.dirname/..` root already used by `main.ts` and `cli-args.ts`), and `ai/` is already in the package's published `files` list, so the built-in tasks ship with `janus`.
- **Two labeled sections.** Rows are grouped into a "Project" section and a "Janissary" section, each rendering its own section header, with the project section first. Within each section the existing sort-and-recurse behavior is unchanged: `.md` files sorted alphabetically, subdirectories as collapsible rows indented one level deeper.
- **Project overrides built-in on duplicate path.** If a task with the same relative path (e.g. `build-a-feature.md`, or `sub/foo.md`) exists in both directories, only the project copy is listed; the Janissary copy of that path is dropped. Deduplication is by the relative `path`.
- **Absolute command for built-in tasks.** Selecting a Project task inserts `execute ./ai/tasks/<path>` exactly as today. Selecting a Janissary task inserts `execute <absolute-janissary-ai-tasks-dir>/<path>` (the built-in tasks directory's absolute path joined with the row's relative path), so the command resolves from any agent working directory. The path is still inserted verbatim with no quoting, matching the current spec.
- **Section labels.** The two section headers read "Project" and "Janissary".
- **Empty sections and empty state.** A section whose source has no task files is omitted (no empty header). When *neither* source has any task files, the picker shows the existing `(no tasks)` message unchanged.

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| Recursive walk of an `ai/tasks` directory into `TaskRow[]` | `walk` / `listTasks` | `src/tasks.ts` |
| Resolving the Janissary install root from the running code | `import.meta.dirname` + `'..'` pattern | `src/main.ts:103`, `src/cli-args.ts:91` |
| Shipping the built-in `ai/tasks` with the package | `files` array includes `ai` | `package.json:81` |
| Tasks carried to the client in the state snapshot | `buildStateEvent` (`tasks: listTasks()`) | `src/state-event.ts:15` |
| Project root already available server-side | `controller.rootDir` | `src/state-event.ts:16` |
| `TaskRow` shape on the wire | `TaskRow` type | `src/types.ts:126` |
| Flatten rows honoring expand/collapse for keyboard nav | `flattenVisibleTaskRows`, `handleTaskPickerKey` | `web/src/task-picker-keys.ts` |
| Picker rendering (rows, chevrons, depth indent, `(no tasks)`) | `TaskPicker` | `web/src/TaskPicker.tsx` |
| Building and inserting the `execute …` command line | `pickTask` → `populateCommandLine` | `web/src/useTaskPicker.ts:30` |
| Threading `tasks` from the server event into state | `useServerState`, `usePopulatePickers`, `ws.ts` | `web/src/useServerState.ts`, `web/src/usePopulatePickers.ts`, `web/src/ws.ts` |

## Proposed changes

**`src/tasks.ts` — dual-source listing with a `source` tag.** Extend `listTasks` (or add a companion function it delegates to) so it walks both roots: the project's `<projectDir>/ai/tasks` and the Janissary install's `<janissaryRoot>/ai/tasks`, where `janissaryRoot` is derived from `import.meta.dirname` joined with `'..'` (mirroring `main.ts`). Each produced `TaskRow` is tagged with its `source` (`'project'` or `'janissary'`). The two lists are merged with project-precedence deduplication: any Janissary row whose relative `path` also appears among the project rows is dropped (a directory row is dropped only when the project fully shadows it — keep the behavior simple by deduping on exact `path`, which naturally lets distinct subtrees coexist). The function accepts the project directory as a parameter (so `state-event.ts` can pass `controller.rootDir`) and internally knows the Janissary root.

**`src/types.ts` — `TaskRow`.** Add a `source: 'project' | 'janissary'` field so the client can group rows into sections and choose the correct insertion command. Keep `path`, `name`, `depth`, `dir` as-is.

**State event — carry the built-in tasks base path.** Add a field to the state snapshot (e.g. `janissaryTasksDir: string`) holding the absolute path of the Janissary install's `ai/tasks` directory, so the client can build the absolute `execute` command for Janissary rows without hardcoding a path. Set it in `buildStateEvent` (`src/state-event.ts`) alongside `tasks`, and add it to the `ServerEvent`/state type in the shared protocol. Update `state-event.ts` to call the dual-source `listTasks(controller.rootDir)`.

**Shared protocol (`@shared/protocol`).** Extend the `TaskRow` type with `source` and the state payload with `janissaryTasksDir`, mirroring the server types so both sides agree.

**`web/src/ws.ts`, `web/src/useServerState.ts`, `web/src/usePopulatePickers.ts`.** Thread the new `janissaryTasksDir` value from the incoming state event through to wherever `tasks` are stored, so the task-picker hook can read it. No behavioral change beyond carrying one more field.

**`web/src/task-picker-keys.ts` — section grouping.** Update `flattenVisibleTaskRows` (or add a wrapper) to emit section-header rows between the Project and Janissary groups, and update the keyboard-navigation helpers (`handleTaskPickerKey`, `dispatchTaskPickerKey`, and the parent/child index helpers) so header rows are skipped for selection and never treated as files or directories. A `VisibleTaskRow` variant gains a way to mark a header (and its source) so `TaskPicker` can render it distinctly.

**`web/src/TaskPicker.tsx` — render section headers.** Render a non-selectable header row (styled like `picker-title` but as a section divider) for each present source, labeled "Project" and "Janissary". File and directory rows render exactly as today beneath their section header. The `(no tasks)` empty state is unchanged (shown only when there are no rows at all).

**`web/src/useTaskPicker.ts` — source-aware command insertion.** In `pickTask`, when the selected row's `source` is `'project'`, insert `execute ./ai/tasks/<path>` as today; when it is `'janissary'`, insert `execute <janissaryTasksDir>/<path>` using the absolute base carried in state. The harness-tab path (sending the command directly into the terminal) uses the same computed command string.

**`product/specs/task-picker.md` — spec update.** Update the spec to describe the two sources, the "Project"/"Janissary" section layout, project-overrides-built-in deduplication, and the absolute-vs-relative inserted command. (Per the code guidelines, a behavior change updates the matching spec.)

## Tests

- **`src/tasks.test.ts`** — extend the existing `listTasks` fixtures: tasks present only in the project produce `source: 'project'` rows; tasks present only in the Janissary root produce `source: 'janissary'` rows; a path present in both appears once tagged `'project'`; ordering places project rows before Janissary rows with each group internally sorted and recursed; both-empty yields `[]`. Follow the colocated server (`vitest` `server` project) convention already used in this file.
- **`web/src/task-picker-keys.test.ts`** — cover header-row insertion in `flattenVisibleTaskRows` and that keyboard navigation skips header rows (Up/Down land on selectable rows only; Left/Right on a directory still behave, unaffected by a header above it).
- **`web/src/TaskPicker.test.tsx`** — a rows array spanning both sources renders a "Project" header and a "Janissary" header with the right rows beneath each; an all-project set renders only the "Project" header; an empty set still renders `(no tasks)`.
- **`web/src/useTaskPicker.test.ts`** — picking a `'project'` row populates `execute ./ai/tasks/<path>`; picking a `'janissary'` row populates `execute <janissaryTasksDir>/<path>` using the absolute base from state.
- Follow the colocated `*.test.ts(x)` convention (server → `src/**`, client → `web/src/**`).

## Out of scope

- Showing both copies of a duplicated task path — the project copy always wins and the built-in one is hidden; there is no "show both, labeled" mode.
- Any source beyond the project `ai/tasks` and the Janissary install `ai/tasks` (e.g. a user home-directory tasks dir, or a configurable additional path).
- Reordering or letting the user collapse an entire section; section order is fixed (Project first) and headers are always shown for present sources.
- Changing how `execute` itself resolves or runs a task file — only the *inserted command string* changes for built-in tasks.
- Interactive filtering/search within the picker.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected server and web projects, and runs the affected server and web tests.
- Manual: in a project whose `ai/tasks/` differs from Janissary's built-in tasks, open the task picker (`Ctrl+A`). Confirm a "Project" section lists the project's tasks and a "Janissary" section lists the built-in tasks, that a task name present in both appears only once under "Project", that picking a Project task populates `execute ./ai/tasks/<name>` and picking a Janissary task populates `execute <absolute-janissary-path>/ai/tasks/<name>`, and that a project with no `ai/tasks/` still shows the Janissary section (and a setup with neither shows `(no tasks)`).
