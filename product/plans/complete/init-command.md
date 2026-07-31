# Add a `janus init` command to scaffold the `ai/` and `product/` directory tree

**Complexity: 3/10** — mirrors the existing `stop` subcommand's plumbing (`cli-args.ts`, `main.ts`, `bin/janus.mjs`) with a new pure directory-creation helper. No new subsystems.

## Goal

`ai/` and `product/` are the conventions this tool's task/backlog/plan/spec workflow relies on (documented in `CLAUDE.md`'s Project Structure section), but a new project has to create that directory tree by hand. Add `janus init [<project-dir>]` that creates the standard `ai/` and `product/` subdirectory tree recursively in the target directory and drops a `.gitkeep` file in every directory that ends up empty, so git tracks the empty scaffold.

## Approach

Model `init` exactly on the existing `stop` subcommand:

- `src/cli-args.ts`: recognize a leading `init` positional the same way `stop` is recognized, adding an `init: boolean` field to `CliArgs`. `init` and `stop` are mutually exclusive positionals (only the first positional is inspected), same as today's `stop` handling — reuse `parseProjectDir` for the optional trailing `<project-dir>`.
- `bin/janus.mjs`: add `'init'` to the `isForegroundCommand` set of first-argument checks (`arguments_[0] === 'stop'`) so `init` runs attached and prints straight to the terminal instead of detaching a server.
- `src/main.ts`: in `boot()`, handle `args.init` right after `args.stop` — call the new `scaffoldProject(cwd)` helper, print a confirmation, and return before `acquireLock`.
- New module `src/project-init.ts` exporting `scaffoldProject(projectDir: string): string[]`: creates the fixed list of `ai/` and `product/` subdirectories (see below) with `mkdirSync(..., { recursive: true })`, then for every directory in that list that is still empty after creation, writes an empty `.gitkeep` file into it. Returns the list of directories created, for the caller to report.

Directory list (matches `CLAUDE.md`'s documented structure exactly — no undocumented subfolders):

```
ai/guidelines
ai/personas
ai/tasks
product/backlog
product/plans/draft
product/plans/ready
product/plans/complete
product/plans/deferred
product/specs
```

## Implementation steps

1. `src/project-init.ts`: new file with `scaffoldProject(projectDir)` as described above.
2. `src/cli-args.ts`: add `init: boolean` to `CliArgs`; recognize `positionals[0] === 'init'` alongside the existing `stop` check, reusing `parseProjectDir` on the remaining positionals for both.
3. `src/cli-info.ts`: add `janus init [<project-dir>]` to the usage synopsis and an `init` row to the Commands section.
4. `src/main.ts`: import `scaffoldProject`, handle `args.init` before `acquireLock`, printing the created directories.
5. `bin/janus.mjs`: add `'init'` to the foreground-command check alongside `'stop'`.

## Tests

- `src/project-init.test.ts`: new file —
  - creates the full directory tree in a temp dir and asserts every directory in the list exists.
  - asserts a `.gitkeep` file exists in each of the created (empty) directories.
  - running it twice against the same directory does not throw (idempotent).
- `src/cli-args.test.ts`: add cases —
  - `parseCliArgs(['init'])` → `init: true`, `projectDir: undefined`.
  - `parseCliArgs(['init', tmpDir])` → `init: true`, `projectDir: tmpDir`.
  - `init` stays `false` for a normal invocation.
  - `usageText()` mentions the `init` subcommand.

Run `./scripts/run.mjs check-diff` after each step.

## Spec updates

- `product/specs/cli.md`: already documents `stop`/`--help`/`--version` in the same style. Add `janus init [<project-dir>]` to the Commands table and a new "Scaffolding a new project" section describing what it creates and that it runs attached like `stop`.

## Docs

- Check `help.md` and `documentation/user-documentation/` for any page documenting CLI commands/flags; update only if one already exists and would now be inaccurate. Do not add new documentation pages for previously-undocumented CLI behavior.

## Out of scope

- Populating the scaffolded directories with any starter content (guideline files, task files, spec templates) — directories only, per the issue.
- Changing `stop`'s behavior or parsing.
- Adding `init` to the in-app command bar (`src/command/*`) — this is a `bin/janus` CLI-level command, not a tab command.
