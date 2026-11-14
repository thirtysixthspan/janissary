# File glob 9 — command-bar completion and end-to-end verification

**Complexity: 5/10** — ~25 added lines over 3 files, but 8 requirements and 17 test scenarios, most of them the series' end-to-end checks moved into tests (p=5.52)

Run order: 9 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 7 (the typed command exists to complete) and subplan 8 (the ACP wiring and the `ask` default grant the end-to-end check exercises). Subplans 1–8 are implemented: `src/file-glob/`, `src/remote/filesystem/glob-paths-operation.ts`, `src/file-navigator/remote/port-reads.ts`, `src/commands/file.ts`, `src/acp/tool-table.ts`, `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, and `src/plugins/roles/roles-file.ts` (whose default `ask` role already grants `file glob`).

This subplan adds command-bar completion for `file glob`, then closes the series with one end-to-end check of the finished feature. Every manual check that subplans 1–8 deferred to here is either already proved by an existing test, gets a new automated end-to-end test in this subplan, or becomes a step in the pull request's **How to verify** section for `ai/tasks/feature/test-pull-request.md` to run in the real app. Nothing is left as an implied "verify manually" step.

## Design decisions

All from the source plan unless marked:

- Typing in the command bar completes `glob` after `file` (beside `read`), completes the flags `--dirs`, `--hidden`, `--limit`, and `--path` for a `--` token, completes directory names after `--path`, and leaves the token unchanged after `--limit`. The pattern token is not completed.
- Directory-only completion is an optional options argument `{ directoriesOnly?: boolean }` on `completeFilePath` in `src/completion/fs.ts`, which filters entries with the existing `isDir` helper (`src/completion/helpers.ts:6`, `export const isDir`). Existing callers (`src/completion/index.ts`, `src/completion/candidates.ts`, `src/completion/runscript-commands.ts`) pass nothing and are unchanged.
- Paths complete against the same `fileReadRoot` the read uses. `src/controller/completion.ts` passes `localReadRoot(managers, tab.label)` (`src/file-read/tab-read.ts`), which returns `undefined` for a tab with `remote` set, so a remote tab completes no directories after `--path`. Flags and subcommands still complete on a remote tab. This matches what the command does: `globFilesInTab` (`src/file-glob/tab-glob.ts`) sends a remote tab's glob over the port instead of walking a local root.
- After `--path` the token always gets directory completion, even when it starts with `--`. This mirrors the `read` branch, which checks the previous flag before the `--` token test, and `scanPath` in `src/file-glob/command.ts` rejects a `--path` value starting with `--` anyway, so no flag belongs there.
- Hidden directories follow the existing `completeFilePath` rule: offered only when the typed name starts with `.`. Nothing new is needed for this.
- Subplan decision: the `file` subcommand list is filtered through the completion policy, the way `completeBrowserCommand` does at `src/completion/browser.ts:16` (`BROWSER_SUBCOMMANDS.filter((word) => policy.allows(\`browser ${word}\`))`). `file read` and `file glob` are separate rows that can each be disabled (`src/native-commands/policy.test.ts`, "refuses a disabled file glob row without disabling bare file"), and `product/specs/tab-completion.md` already says disabled commands and their fixed forms are not offered. Without the filter, `file ` would offer `glob` while `file glob` is disabled. Arguments under a disabled `file glob` are already suppressed by the existing `policy.allows(prefix)` check at the top of `completeCommandLine`, so only the subcommand word needs the filter.
- Subplan decision: `product/specs/tab-completion.md` states today, in the "File read command (`file read`)" section, that "any argument under a subcommand other than `read` gets no candidates". That sentence changes with this behavior, so the spec section is updated in the same change (architecture principle 10 in `ai/guidelines/architecture-principles.md`). The source plan doesn't name this file, but leaving it would make the spec wrong. No user documentation describes `file read` completion, so no doc page changes.
- Subplan decision: the source plan's manual checks are proved by tests where a test can drive the same code path, and the rest go into the pull request's **How to verify** section (see Verification). An agent with no interactive app runs the tests through `check-diff`; `ai/tasks/feature/test-pull-request.md` later runs the How to verify steps against a started app.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `completeFileReadCommand`, `FILE_SUBCOMMANDS` (today `['read']`), `FILE_READ_FLAGS` | `src/completion/file-read.ts` (20 lines) | The dispatcher to extend. |
| `completeFilePath` | `src/completion/fs.ts` (30 lines) | Path completion; gains the `directoriesOnly` option. It already appends `/` to a unique directory match and a space to a unique file match. |
| `isDir` | `src/completion/helpers.ts` | The directory test for the filter. |
| `completeWord` | `src/completion/helpers.ts` | Word completion; sorts matches and appends a space to a unique match. |
| `unchanged` | `src/completion/candidates.ts` | The no-op result. |
| `CompletionPolicy`, `ALL_ENABLED_POLICY` | `src/completion/command-policy.ts` | Subcommand filtering, as `src/completion/browser.ts` uses it. |
| `fileReadRoot` wiring | `src/completion/index.ts` (`completeCommandLine`), `src/controller/completion.ts` (`localReadRoot`) | Unchanged; the `index.ts` doc comment gains `file glob`. |
| Typed-entry test harness (`managers()`, `run(line, label)`) | `src/commands/file.test.ts`, `describe('file command run')` | The local-tab end-to-end test runs the real `command.run` through it. |
| Loop test harness (`makeSession`, `makeHandlers`, `coreSnapshot`) | `src/acp/drive-loop.test.ts` | The ACP end-to-end test drives `driveToolLoop` through it. |
| `globWorkspaceCommand` | `src/file-glob/glob.ts` | The real glob the ACP test's host runs. |
| Default `ask` grants | `src/plugins/roles/roles-file.ts` (the `ask` entry's `commands`, which ends `'file read', 'file glob'`) | The grants the ACP test uses. |

## Proposed changes

- `src/completion/file-read.ts`:
  - `FILE_SUBCOMMANDS` becomes `['glob', 'read']`.
  - `completeFileReadCommand` gains a third parameter `policy: CompletionPolicy = ALL_ENABLED_POLICY`. At `argumentIndex === 1` it completes from `FILE_SUBCOMMANDS` filtered by `policy.allows(\`file ${word}\`)`, as `src/completion/browser.ts:16` does.
  - When `preceding[1]` (lowercased) is `glob`, a new local function `completeGlobArgument(cursor, root)` handles the token, keeping `completeFileReadCommand` under the cognitive-complexity limit. Its rules, in order, using the lowercased previous token: after `--limit`, `unchanged`; after `--path`, `completeFilePath(cursor, root, { directoriesOnly: true })` when `root` is defined, else `unchanged`; a token starting with `--` completes from `['--dirs', '--hidden', '--limit', '--path']` with `completeWord`; anything else (the pattern) `unchanged`.
  - Any subcommand other than `glob` or `read` stays `unchanged`. The `read` branch is unchanged.
  - The header comment covers both subcommands and the remote-tab rule.
- `src/completion/fs.ts`: `completeFilePath(cursor, cwd, options?)` takes `{ directoriesOnly?: boolean }`. When set, the prefix-and-dotfile filter also requires `isDir(path.join(dir, entry))`, before sorting and the common-prefix step, so a file never affects the common prefix or the match list.
- `src/completion/index.ts`: `completeCommandLine` passes its existing `policy` as the third argument to `completeFileReadCommand(cursor, fileReadRoot, policy)`, and the doc comment's `file read` bullet covers `file glob` (subcommand, flags, and directories after `--path` against `fileReadRoot`; none on a remote tab).
- `product/specs/tab-completion.md`: the "File read command (`file read`)" section becomes "File command (`file read`, `file glob`)". The first argument offers the enabled subcommands `glob` and `read`. After `file glob`, a `--` word offers `--dirs`, `--hidden`, `--limit`, and `--path`, the word after `--path` completes directory names only (against the same root as `file read`), and the pattern and the `--limit` value get no candidates. A remote tab gets no directory candidates. A disabled `file read` or `file glob` row's subcommand is not offered. Arguments under any other subcommand get no candidates and do not fall back to filesystem completion. The existing `file read` sentences stay.

All three source files stay far under the 200-line `max-lines` limit (`file-read.ts` grows from 20 to about 35 lines, `fs.ts` from 30 to about 33, and `index.ts` stays at about 81). Relative imports carry `.js`.

## Tests

Completion, in `src/completion/file-read.test.ts`:

- `file ` offers `['glob', 'read']`. This replaces the existing assertion `matches).toEqual(['read'])` in "completes the read subcommand". `file g` completes to `file glob ` and `file r` to `file read `. The two names share no prefix, so there is no shared-prefix case.
- With a policy whose snapshot disables the `file glob` row, `file ` offers only `['read']`. Build the policy the way the local `policyWith` helper in `src/completion/command-policy.test.ts` does: a temporary home whose `.janissary/commands.json` disables `file glob`, read through `NativeCommandSettingsManager(...).current()` and passed to `completionPolicy`.
- `file glob *.ts --` offers the four flags in sorted order, and `file glob *.ts --h` completes to `file glob *.ts --hidden `.
- After `--path`, using the `root` fixture (`docs/` directory, `notes.md` file), plus a new `dogs.md` file and a `.hidden/` directory: `file glob * --path do` completes to `file glob * --path docs/`, because `dogs.md` is filtered out before the common-prefix step. `file glob * --path n` offers nothing, since `notes.md` is a file.
- `file glob * --path do` with root `undefined` returns the line unchanged with no matches.
- `file glob * --limit ` and `file glob * --limit 5` are returned unchanged with no matches.
- The pattern token (`file glob *.t`, `file glob src/fi`) is returned unchanged with no matches and does not fall back to filesystem completion.
- The existing "offers nothing after a subcommand other than read" keeps `file write no` (still not a completed subcommand) and is renamed "offers nothing after a subcommand other than read or glob".

`completeFilePath`, in a new `src/completion/fs.test.ts` (no such file exists today; follow `src/completion/file-read.test.ts`'s temporary-directory fixture and `readCompletionCursor` helper):

- With `{ directoriesOnly: true }`, a directory and a file sharing a prefix leave only the directory, and the unique match gets a trailing `/`.
- With `{ directoriesOnly: true }`, a hidden directory is offered only when the typed name starts with `.`.
- Without the option, the same fixture still offers the file and the directory.

Local-tab end to end, in `src/commands/file.test.ts`: a new nested `describe('file glob end to end')` inside `describe('file command run')`, so it reuses the `managers()`/`run()` harness and the `root` launch directory (label `janus` with no tab globs the project directory, as "globs under the project directory for a local tab without a workspace" already does). Its `beforeEach` writes this fixture under `root`: `src/file-read/command.test.ts`, `src/file-read/policy.test.ts`, `src/file-read/command.ts`, the directories `src/alpha/`, `src/beta/`, `src/delta/`, `src/epsilon/`, `src/gamma/`, and the root files `.env.example` and `.env.local`. One `it` per line, since `run` asserts exactly one appended entry:

- `file glob **/*.test.ts --path src/file-read` prints `src/file-read/command.test.ts` and `src/file-read/policy.test.ts`, in that order, and nothing else.
- `file glob * --dirs --path src --limit 5` prints `src/alpha/`, `src/beta/`, `src/delta/`, `src/epsilon/`, `src/file-read/`, then `(showing the first 5 matches; narrow the pattern or raise --limit)`. `src/gamma/` is not listed.
- `file glob nothing-matches-this` prints `(no matches)`.
- `file glob *.ts --path missing` prints `Directory not found: missing.`
- `file glob .env.* --hidden` prints `(no matches)`, and `file glob * --hidden` lists neither `.env.example` nor `.env.local`, which proves `.env.*` is never listed through the typed entry.

ACP end to end, in `src/acp/drive-loop.test.ts`: a new `describe('driveToolLoop file glob end to end')` with one test. It writes a temporary root containing `product/plans/complete/editor-split.md`, `product/plans/complete/editor-tabs.md`, and `product/plans/complete/other.md`. It drives `driveToolLoop` with `coreSnapshot('ask', <the default ask commands>)`. Read those from the `ask` entry of the exported `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` (`DEFAULT_ROLES.find((role) => role.name === 'ask')`), not by copying the list, so the test fails if the default ever stops granting `file glob`. The scripted replies are `'Let me look.\nfile glob *editor* --path product/plans/complete'` and then `'Done.'`. The host's `runCaller` is a `vi.fn` and `runWorkspace` calls `globWorkspaceCommand(root, command)`. Wait for the `finished` event with `vi.waitFor`. Then assert:

- `runWorkspace` ran exactly once with the `file glob` line, and `runCaller` never ran.
- The second prompt contains `` Output of `file glob *editor* --path product/plans/complete`: `` followed by `product/plans/complete/editor-split.md` and `product/plans/complete/editor-tabs.md`, and no `other.md`.
- The `ranCommand` event carries `workspace` `true`.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes: lint, typecheck, and the server tests above.
- Coverage of the series' deferred checks. The source plan's Verification section and the manual checks subplans 1–8 deferred here map as follows:

| Check | Proved by |
| --- | --- |
| Local tab: sorted test paths, `--dirs --limit 5` with the truncation line, `(no matches)`, `Directory not found: missing.` | New `file glob end to end` tests in `src/commands/file.test.ts` |
| `.env.*` never listed, even with `--hidden` (subplan 7) | Same new tests; also `src/file-glob/glob.test.ts` "lists dotfiles under --hidden but omits secret files" |
| ACP `ask` session emits one `file glob` line and receives the matching paths | New test in `src/acp/drive-loop.test.ts`; extraction of a trailing glob line is also pinned by `src/acp/tool-table.test.ts` "finds a trailing file glob on a table granting file glob" |
| Disabled `file glob` refuses an agent step with `Command is disabled: file glob.` (subplan 8) | `src/acp/tool-table.test.ts` "refuses a disabled file glob" |
| Disabled `file glob` refuses a typed line, and bare `file` stays enabled (subplan 8) | `src/native-commands/policy.test.ts` "refuses a disabled file glob row without disabling bare file" |
| `help file` shows the glob section (subplan 7) | `src/commands.test.ts` "scopes the file page read notes to file read and leaves glob its own limit" |
| Commands tab has a `file glob` row under `file` (subplan 8) | `src/application-commands.test.ts` (`row.name === 'file glob'`, `parent: 'file'`) |
| Remote tab: `file glob *.md` untagged, `--path ../x` gives `Outside the workspace: ../x.` (subplans 5–7) | Client half: `src/commands/file.test.ts` remote cases ("sends glob-paths on its own session and prints the reply unchanged", the `../x` case). Far half: `src/remote/serve-file-navigator.test.ts` ("globs the far-side workspace…", "refuses a glob-paths dir that escapes the workspace as an error"). ACP remote step: `src/remote/serve-acp-loop.test.ts` "runs a granted file glob against the workspace as a workspace step". |
| Completion | New tests above |

- The pull request's **How to verify** section, which `ai/tasks/feature/test-pull-request.md` runs in a started app. These are the only in-app checks, and they are written there in its Do/Expect shape:
  - In a local tab's command bar, type `file g` and press Tab: the line becomes `file glob `. Type `*.ts --p` and press Tab: the line becomes `file glob *.ts --path `. Type `src/file-r` and press Tab: the line becomes `file glob *.ts --path src/file-read/`.
  - In a local tab, run `file glob **/*.test.ts --path src/file-read`: a sorted list of `src/file-read/…test.ts` paths. Run `file glob * --dirs --path src --limit 5`: five `src/<name>/` lines, then `(showing the first 5 matches; narrow the pattern or raise --limit)`. Run `file glob nothing-matches-this`: `(no matches)`. Run `file glob *.ts --path missing`: `Directory not found: missing.`
  - Run `help file`: the page has the glob section. Open the Commands tab: a `file glob` row under `file`.
  - Optional, needs an ACP harness: with no `.janissary/roles.json` in the project and no `ask` role in `~/.janissary/roles.json`, ask an `ask` session to list the plan files under `product/plans/complete` whose names mention `editor`. The connection tab shows one `file glob` line and its matching paths. This needs a live model, so it stays optional; the drive-loop test is the required proof.
  - Optional, needs a remote host: on a remote tab, `file glob *.md` lists the remote clone's files with no host tag, and `file glob * --path ../x` prints `Outside the workspace: ../x.`

## Out of scope

Completing the pattern token. Completing `~`-prefixed `--path` values differently from today's `completeFilePath` (the command rejects paths outside the workspace on its own). Any web UI beyond the command's transcript output. Any change to the glob command, walker, remote operation, or ACP wiring from subplans 1–8. A new end-to-end test needing a live model or a real remote host.
