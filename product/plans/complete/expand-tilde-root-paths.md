# Expand ~ and $root in command path parameters

## Problem

Commands like `open`, `edit`, `files`, and tab-completion resolve paths relative to the tab's cwd, but do not recognize `~` (home directory) or `$root` (project root) as path prefixes. `~` only works in shell commands (where bash expands it) and in tab-completion (for directory scanning). `$root` is display-only — it is never expanded from user input.

## Complexity

3/10 — add a symmetric `expandUserPath()` utility alongside the existing `abbreviatePath()` in `src/paths.ts`, then call it in three path-resolution sites.

## Solution

1. Add `expandUserPath(input, context)` to `src/paths.ts` — the inverse of `abbreviatePath()`:
   - `~` at the start → `homedir()`
   - `$root` at the start → `context.root`

2. Call `expandUserPath()` before `path.isAbsolute()` / `path.resolve()` in:
   - `src/open-file-manager.ts` — `run()` line 38 and `edit()` line 47
   - `src/file-tree-manager.ts` — `open()` line 37
   - `src/completion-helpers.ts` — `splitToken()` line 25 (already expands `~`, add `$root`)

3. Expose project root via `launchDir` getter on `TabManager`.

## Changes

### `src/paths.ts`
- Add `expandUserPath(input: string, context: RootContext): string` — expands `~` to home and `$root` to project root at the path start.

### `src/tab-manager.ts`
- Add public getter `get launchDir()` returning `this.rootDir`.

### `src/open-file-manager.ts`
- Expand `parsed.target` via `expandUserPath()` before the `path.isAbsolute()` check in `run()` and `edit()`.

### `src/file-tree-manager.ts`
- Expand `target` via `expandUserPath()` before the `path.isAbsolute()` check in `open()`.

### `src/completion-helpers.ts`
- Expand `$root` in tokens (alongside existing `~` expansion) in `splitToken()`.

## Tests

- `src/paths.test.ts`: add tests for `expandUserPath` — `~`, `~/path`, `$root`, `$root/path`, `$root` under `~`, paths without prefixes.
- `src/open-file-manager.test.ts`: test that `~` and `$root` are expanded by the `open` command.
- `src/completion-helpers.test.ts`: test that `$root` is expanded in `splitToken()`.

## Spec

Update `specs/root-path.md` to note that `$root` is accepted as a path parameter prefix in commands (reversed from display-only). Add a line to `specs/commands.md` or relevant spec about `~` path expansion.

## Out of scope
- No changes to shell command execution (shells natively handle `~`, and `$root` would require pre-processing before spawning).
- No expansion of `~` or `$root` in mid-path position (only at the start, matching existing convention).
