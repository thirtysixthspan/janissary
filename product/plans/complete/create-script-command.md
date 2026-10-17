# `create script <name>` makes an empty runscript and opens it in the editor

**Complexity: 4/10** — one new command that reuses the existing runscript path resolution, the scripts-directory safety checks, the Git-exclusion step, and the editor hand-off that `edit` already uses. The new code is one exclusive file creation and the directory creation that the reader never needed. No new architecture.

Today a runscript is made by hand: the user creates `.janissary/scripts/<name>.rs` in another tool, then runs `edit <name>` or `execute <name>`. The issue asks for `create script <name>` to open a new runscript in an editor tab at its real path, creating `.janissary/scripts/` when it does not exist.

## Design decisions

- **Grammar**: `create script <name>`. The `script` keyword is required so the command can grow other kinds later. A bare `create` or `create script` prints `Usage: create script <name>`. Keywords match case-insensitively; the name keeps its spelling for validation.
- **Name rules**: the same `isRunscriptName` rule the rest of the feature uses. An invalid name prints `Invalid runscript name "<name>".` and creates nothing.
- **Creation is exclusive**: the file is created with an exclusive flag, so creating never overwrites. If the runscript already exists, the command opens it unchanged and says so in the transcript. This matches `edit <name>` for an existing runscript and never discards content.
- **Directory creation**: `.janissary/` and `.janissary/scripts/` are created only when missing. An existing path that is a symlink or not a directory is refused, using the same check the reader uses, so creation never follows a link out of the project.
- **Git exclusion**: creating the directory goes through the same path that already excludes the durable paths from Git, so a new scripts directory is never picked up as a tracked change.
- **Editor**: once the file exists, the command hands the absolute path to `editForCommand`, the same call `edit` makes. It does not use `newFile`, because `newFile` would choose `<name>-2.rs` when the name is taken.
- **Failure text**: an unsafe path or failed creation prints `Could not create runscript "<name>".` and opens nothing. This mirrors `Could not read runscript`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Runscript name validation | `src/schedule/system/runscript.ts` (`isRunscriptName`) | Validate the argument |
| Runscript path, directory checks, Git exclusion | `src/schedule/system/runscript-files.ts` (`scriptsDirectory`, `assertDirectory`, `readRunscript`) | Add a sibling `createRunscript` that reuses `scriptsDirectory` and `assertDirectory` |
| Editor hand-off for a file path | `src/commands/edit.ts` → `managers.openFile.editForCommand` | Same call with the created absolute path |
| Transcript output | `appendCommandOutput` in `src/command/append.js` | Same output pattern as `edit` |
| Command registration | `src/commands/index.ts` | Add one entry next to `edit` and `execute` |

## Proposed changes

**Runscript files.** In `src/schedule/system/runscript-files.ts`, add `createRunscript(projectRoot: string, name: string): { file: string; created: boolean }`:
- throw `Invalid runscript name` when the name is invalid;
- call `scriptsDirectory(projectRoot)`, which runs the Git exclusion and the existing checks;
- when the scripts directory does not exist, create `.janissary` and then `scripts` with a non-recursive `mkdirSync` each, running `assertDirectory` on each first so an existing symlink or non-directory is refused;
- create the file with `writeFileSync(file, '', { flag: 'wx' })`, returning `created: true`;
- on `EEXIST`, validate the existing entry with `readRunscript` (which rejects symlinks and non-regular files, and throws for them), then return `created: false`.

**Command.** Add `src/commands/create.ts`:
- `name: 'create'`, `match: /^create\b/i`, `samples: ['create script deploy']`;
- parse the remainder with `/^script\s+(\S+)$/i`; anything else prints the usage line;
- validate the name, call `createRunscript(managers.tab.launchDir, name)`, and on a thrown error print `Could not create runscript "<name>".`;
- append an empty output line for a created file, or `Runscript "<name>" already exists.` for an existing one, then call `managers.openFile.editForCommand(command, file, tab.label, undefined, invocation?.runId)` after the append, the same order `edit` uses.

**Registry.** In `src/commands/index.ts`, import `command as create` from `./create.js` and add it to the list next to `edit` and `execute`.

**Spec.** In `product/specs/scheduling.md`, in the runscripts paragraph, add one sentence: `create script <name>` makes an empty runscript at the same path, creating `.janissary/scripts/` when missing, opens it in an editor tab, never overwrites an existing runscript, and refuses an unsafe existing path. Also state that an invalid name creates nothing.

**Documentation.** No change. The playbook does not add user documentation for a new command, and the existing pages describing manual creation remain accurate.

## Tests

- `src/commands/create.test.ts` (new):
  - the command name, and that `create script deploy` matches case-insensitively while `created` does not match;
  - bare `create` and `create script` print `Usage: create script <name>` and open nothing;
  - `create script Deploy` and `create script deploy-` print the invalid-name message and create no `.janissary` directory;
  - `create script deploy` in a project with no `.janissary` creates `.janissary/scripts/deploy.rs`, opens that absolute path through `editForCommand`, and appends an empty output line before the open;
  - when `deploy.rs` already exists with contents, the contents are unchanged, the editor opens that file, and the output reads `Runscript "deploy" already exists.`;
  - a symlinked `.janissary/scripts` prints `Could not create runscript "deploy".` and opens nothing.
- `src/schedule/system/runscript-files.test.ts`, added cases for `createRunscript`: it creates both missing directories and the empty file; it returns `created: false` and keeps existing content for an existing file; it throws for an invalid name; it refuses a symlinked scripts directory.

Existing tests for `edit`, `execute`, and the runscript readers must keep passing unchanged.

## Out of scope

- Creating a runscript with initial contents, a template, or the command text.
- A `create` form for anything other than `script`.
- Any change to `edit`, `execute`, or the catalog.
- User documentation for the new command (see Documentation above).

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: in a project without `.janissary/`, run `create script deploy` and confirm `.janissary/scripts/deploy.rs` appears and opens in an editor tab; run it again and confirm the existing file opens with its contents unchanged.
