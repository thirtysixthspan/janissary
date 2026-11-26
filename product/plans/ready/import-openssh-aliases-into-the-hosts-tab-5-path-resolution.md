# Resolve ssh config operands to paths and display forms
**Complexity: 5/10** — ~95 added lines, 13 requirements, 18 test scenarios (p=5.54)

## Goal

Add the pure resolver that turns a typed file operand into a local absolute path and its abbreviated display form. It is the fifth piece of `import-openssh-aliases-into-the-hosts-tab.md`. `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` uses it for both command and intent operands; no file content is read or written here — the presence check of Requirement 7 is the only filesystem touch.

## Requirements

1. An operand of `~` resolves to the home directory ("~, $root, $HOME, $workspace").
2. An operand beginning `~/` resolves to a path under the home directory ("~, $root, $HOME, $workspace").
3. An operand beginning `$HOME/` resolves to a path under the home directory ("~, $root, $HOME, $workspace").
4. An operand equal to `$root` or beginning `$root/` resolves against the project root ("~, $root, $HOME, $workspace"; the boundary at `src/paths.ts:18` `if (input === '$root' || input === '$root/') return root;`).
5. An operand equal to `$workspace` or beginning `$workspace/` resolves against `$root/.janissary/workspace` ("~, $root, $HOME, $workspace").
6. A `~user` form is not expanded and resolves as a relative path ("Quoted paths", Design decisions).
7. A relative operand is tried first against the typing tab's working directory, then against the project root, and the first existing file wins ("cwd, then project").
8. A relative export operand that exists in neither place is created in the typing tab's working directory ("Create it").
9. The resolver produces a local absolute path together with its abbreviated display form (source plan Implementation step 4).
10. The display form shows the home directory as `~` and the project root as `$root` ("No dialog, notification" and "One summary line").
11. The module imports nothing through `../` (`import-openssh-aliases-into-the-hosts-tab.md` Assumptions 5).
12. An operand that is already absolute is used as given, with no cwd-then-root lookup, and receives the same display abbreviation (`src/paths.ts:25` `return input;`, source plan Implementation step 4).
13. Prefixes match only at a token boundary: `$rootnote` and `$workspace-2` are relative operands, not expansions (`src/paths.ts:18` `if (input === '$root' || input === '$root/') return root;`).

## Design decisions

Depends on nothing earlier. `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` consumes the resolver, so it lands later.

- The new module is `src/plugins/hosts/ssh-config-target.ts` beside `ssh-config-target.test.ts`. It is pure path work: it never reads file content, never writes, and only performs the presence check of Requirement 7; it never calls `originTab()`.
- Export one function named `resolveSshConfigTarget`. It takes the project root, home directory, workspace container directory, typing-tab cwd, and raw operand as plain arguments and returns one record carrying the absolute path and its display string, so the two cannot drift. There is no mode flag: a relative operand present in neither base resolves to the cwd-based path for both import and export, which is where a later write creates it (Requirement 8).
- The workspace argument is the container `<root>/.janissary/workspace`, passed by the caller as such; it is not `originTab().workspace.dir`, which names a single clone one level deeper (Assumption 5). A bare `$workspace` yields the container and `$workspace/<rest>` appends the rest, matching Requirement 5.
- The plugin cannot import `src/paths.ts` (Assumption 1), so the resolver copies the prefix expansion of `src/paths.ts:15` `expandUserPath` only for `~`, `~/`, `$root`, and `$root/`, and adds `$HOME/` and `$workspace` itself. It likewise copies the display rule of `src/paths.ts:56` `abbreviatePath`, including the state-directory fold at `src/paths.ts:58` `const state = path.join(root, '.janissary');`: a resolved workspace path displays as `$root/workspace/<name>`, and no `$workspace` display form is introduced (Requirement 10). Those few lines are a deliberate duplicate; a third plugin needing them is the signal to add `src/paths.ts` to the boundary allowlist instead. No `../` path appears (Requirement 11).
- Lookup tries the cwd base first and the project root second, taking the first present path. Presence is an existence check only: a directory at the first candidate counts as present here, and whether it is readable or a regular file is diagnosed by `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`. Expanded home, root, and workspace prefixes are used as given, with no cwd/root fallback.
- Keep the resolver under the complexity signal at `eslint.config.mjs:98` `'sonarjs/cognitive-complexity': ['warn', 15]`: prefix matching, the cwd-then-root lookup, and display abbreviation may be private helpers in the same file, but `resolveSshConfigTarget` is the only export.
- Tests build scratch directories for home, root, and workspace container with `mkdtempSync` and remove them after each case, the pattern used in `src/plugins/hosts/catalog-commands.test.ts:26`.

## Preserved behavior

None found. This module is new and no existing production consumer is edited, so no existing test is affected.

## Assumptions

1. A concrete server plugin cannot import `src/paths.ts`: the `no-restricted-imports` pattern at `eslint.plugin-boundaries.mjs:36` `api\.js|files\.js` is an explicit allowlist of host modules, and `paths.js` is not among the modules it lists.
2. Prefix expansion has only a partial reference implementation to copy: `src/paths.ts:15` `export function expandUserPath(` handles `~`, `~/`, `$root`, and `$root/`, falling through with `src/paths.ts:25` `return input;`; `$HOME/` and `$workspace` are new here.
3. Display abbreviation has a reference implementation to copy: `src/paths.ts:56` `export function abbreviatePath(`, which folds `<root>/.janissary` into `$root/` at `src/paths.ts:58` `const state = path.join(root, '.janissary');`.
4. A plugin learns cwd, root, and remote from `originTab()`: `src/plugins/api-origin-tab.ts:22` `export type TabPluginOriginTab = {`, with `remote?: true;` at `:29`. The caller supplies these values; this module does not read the capability.
5. A tab's workspace field names one clone, not the workspace container: `src/plugins/api-origin-tab.ts:8` `dir: string;`, whose display is `abbreviateWorkspaceDir(dir)` at `:12`.

## Existing functionality

1. The prefix-expansion rule to copy for `~` and `$root`: `src/paths.ts:15` `export function expandUserPath(`.
2. The display-abbreviation rule to copy, including its `.janissary` fold: `src/paths.ts:56` `export function abbreviatePath(`.
3. The scratch-directory test pattern used by hosts tests: `src/plugins/hosts/catalog-commands.test.ts:26` `function directories(): { home: string; root: string } {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes two new files and imports no project module, so the file list is sufficient to compile at this commit with no dangling reference.

1. Add `src/plugins/hosts/ssh-config-target.ts`. Export `resolveSshConfigTarget` as described under Design decisions, implementing Requirements 1 to 13 and returning the absolute path and display form together in one record. Use only Node built-ins and no `../` import; keep prefix matching, lookup, and abbreviation in private helpers if needed so only the resolver is exported. Build with `$janissary/scripts/run.mjs check-diff`.
2. Add `src/plugins/hosts/ssh-config-target.test.ts` with scratch root, home, and workspace container directories, covering Requirements 1 to 13 as listed under Tests. Build with `$janissary/scripts/run.mjs check-diff` and confirm the whole server test project still passes.

## UI design

1. No user interface surface changes. This is a server-side pure helper with no client entry point.

## Tests

In `src/plugins/hosts/ssh-config-target.test.ts`:

- Each of `~`, `~/notes`, `$HOME/notes`, `$root/notes`, and `$workspace/notes` resolves to the expected scratch path, and `~user` falls through to relative lookup (Requirements 1 to 6).
- Bare `$root` and `$workspace` and an absolute operand such as `<scratch>/config` resolve as decided, while `$rootnote` and `$workspace-2` take the relative path (Requirements 4, 5, 12, 13).
- A relative operand present in both cwd and root picks cwd; one present only in root picks root; one absent from both picks cwd; a directory at the first candidate counts as present and is not rejected here (Requirements 7 and 8).
- The display form folds a home path to `~...`, a project path to `$root/...`, and a workspace path to `$root/workspace/...` (Requirements 9 and 10).
- The test file's own imports stay inside `./` and package specifiers (Requirement 11).

## Out of scope

- No file-content read and no write; the only filesystem touch is the presence check of Requirement 7. Size limits, error wording, and symlink handling belong to `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`.
- No ssh config parsing, section splicing, alias conversion, catalog access, command, intent, or button.
- No change to `src/paths.ts` or the ESLint boundary allowlist, and no `$workspace` display form.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config-target.test.ts` and read the cwd-then-root case. Confirm an operand that exists in both bases resolves to the cwd copy, `$workspace/notes` resolves under the scratch root's `.janissary/workspace` (one level above a clone), and a display path under home starts with `~`. Also read `src/plugins/hosts/ssh-config-target.ts` and confirm it has no `../` import, no file-content read or write, no mode flag, and that `$HOME/` and `$workspace` are expanded explicitly rather than inherited from `expandUserPath`. A failure looks like the root copy winning, a `~user` expansion, an unabbreviated display path, or a workspace path resolved to a clone directory. Because the helper has no user surface until `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md`, the running-app end-to-end check belongs to that plan.
