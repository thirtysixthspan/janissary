# ACP tool loop 5.1 — typed `file read` command on local tabs

**Complexity: 5/10** — ~50 added lines, 2 edited files, 9 requirements, 8 test scenarios (p=5.38); driven by the command, its registry and inventory row, and the tab reader's local-root rule

Run order: piece 1 of 2 of subplan 5 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-5-typed-file-command.md`. Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Typed `file` command"; decisions 12, 13, 17, 18, and 21; the `help/file.md` and `help/commands.md` bullet of "Specs and docs"). Depends on subplans 1 and 3 (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`, `product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`), implemented. It does not use subplan 4's port; piece 2 (`product/plans/draft/move-janissarys-acp-tool-loop-5-typed-file-command-2-remote-read.md`) does.

`file read` is both an ACP tool and a command a user can type. This piece adds the typed command, its registry and inventory entries, its help page and table row, and the tab reader `readFileInTab` with the local-root rule. A local tab reads its own root on this machine. A remote tab gets a fixed `Remote connection unavailable.` line from this piece and never falls back to the local disk; piece 2 replaces that with a real read of the remote workspace.

## Design decisions

- **One command definition** (architecture principle 5). A `Command` named `file` lives in `src/commands/file.ts` and is listed in `coreCommands` in `src/commands/index.ts`, immediately before `files`. Its `match` is `/^file\b/i`, which does not accept `files …` (no word boundary between `e` and `s`), and `files`'s `/^files\b/i` does not accept `file …`. `parseFileRead` (`src/file-read/command.ts`) does all argument handling, so bare `file`, `file read`, an unknown subcommand, and every bad flag print `FILE_READ_USAGE`.
- **Inventory row.** `BUILTIN_FORMS` in `src/application-commands.ts` gains `file: { name: 'file', forms: ['file'] }`, on its own line immediately before the `files:` entry (the object packs two entries per line elsewhere; key order does not affect output, because `buildApplicationCommands` walks `coreCommands` and sorts rows by name). Without it `buildApplicationCommands` skips the command, so the Commands tab cannot list or disable it, `disabledApplicationCommand` (`src/native-commands/policy.ts`) cannot refuse it, and subplan 6's native `file read` row has no parent. The forms list is only `['file']`: subplan 6 adds `file read` as a native row, and a builtin `file read` form would produce a second `['file read', ['file read']]` pair, which the uniqueness test in `src/application-commands.test.ts` ("keeps name and form pairs unique") rejects. A missing row is also caught by "lists every core command once, help, and all native commands" in `src/application-commands.claims.test.ts`, which walks `coreCommands` and fails for any command with no inventory row. `resolveApplicationCommand('file read a.md')` ranks rows by longest matching form (`rankCommandRows` in `src/shared/command-matching.ts`), and `files`'s forms never match at a word boundary of `file read …`, so it resolves to the `file` row.
- **One tab reader.** The local-or-remote choice lives in a new `src/file-read/tab-read.ts`, exporting `readFileInTab(managers: Managers, label: string, input: string): Promise<string>`. `input` is the whole command line (`file read <path> …`). It resolves to the text to print and never rejects. The typed command prints what it returns, and subplan 8's core-loop workspace runner calls the same function with the same signature, so a typed read and an agent read on the same tab always agree. This signature is the contract subplans 8 and 11 rely on; piece 2 keeps it unchanged. The pure `command.ts`, `format.ts`, and `read.ts` stay free of `Managers` because the far side imports them (`src/remote/filesystem/read-lines-operation.ts` imports `read.ts`). `tab-read.ts` is local-host glue: it may import `Managers` (and, from piece 2, the port), and no far-side module may import it.
- **Parse first.** `readFileInTab` calls `parseFileRead(input)` before anything else. A `{ error }` result is returned as is, with no tab lookup and no port. It does not call `readWorkspaceCommand` (`src/file-read/read.ts`, which parses and reads in one step): the parse must come before the tab lookup, and piece 2's remote branch needs the parsed `{ path, offset, limit }`.
- **Local root** (source decision 13). Look the tab up with `managers.tab.byLabel(label)`. When the tab has no `remote` field, the root is its `workspaceDir` when set, otherwise `managers.tab.launchDir` (the `TabManager` getter over the project directory in `src/tab/manager.ts`). A label with no tab is treated as local with `launchDir`. The read is `readWorkspaceLines(root, parsed)` from `src/file-read/read.ts`. It is synchronous and returns a string (every failure, including a missing file, is already a one-line result, not a throw), so `readFileInTab` is an `async` function that returns it directly; the `Promise` return type exists for piece 2's remote branch. The local reader already names the path as typed, so no rewrite applies. The root is `workspaceDir`, never the shell's current directory (`managers.tab.cwdOf`/`workingDirOf`): canonical decision 13 fixes the root, so a tab that has `cd`'d elsewhere still reads relative to its workspace.
- **Remote tabs in this piece** (source decisions 13 and 21). A tab with `tab.remote` set is remote. A remote tab's `workspaceDir` is deliberately undefined (comment above `remote?: RemoteTarget` in `src/tab/types.ts`), so `readFileInTab` tests `tab.remote` first and never reaches the local rule. Joined plugin and navigator tabs on a remote workspace also carry `remote` (`src/plugins/launch-tab-remote.ts`), so they take the same branch. Until piece 2 lands, that branch returns `Remote connection unavailable.` without touching any channel or port (it makes no `managers.remote` call at all), and never reads the local disk. Define the unavailable text once in `tab-read.ts` as a module constant; there is no exported constant for it today, and piece 2 reuses the same constant.
- **No host tag** (source plan "Out of scope"). Typed output is printed as returned, with no `[<host>] ` prefix, on either kind of tab.
- **Printing.** `command.run` awaits `readFileInTab(managers, tab.label, command_)` and appends `{ input: command_, output }` with `appendCommandOutput(managers, tab.label, entry, invocation)`, exactly as `src/commands/files.ts` does for its parse error. It appends once, after the read, and returns nothing. `command_` is the line as `resolveCommand` hands it over (trimmed, any leading `/` stripped); pass it to `readFileInTab` unchanged, since `parseFileRead` already accepts any letter case for `file` and `read`. `appendCommandOutput` routes to `tab.appendForInvocation` when an invocation is passed and to `tab.append` otherwise, so the command needs no branch of its own.
- **Help page and row land with the command.** `src/commands.test.ts` fails when a `help/commands.md` row is out of alphabetical order or when rows and pages in `help/` do not match one to one ("has a help page for each command row and no orphan command pages"), so the page and the row land in this piece (`ai/guidelines/documentation.md`, "Help Command Table"). Subplan 26 relies on both existing. The page's remote paragraph is added by piece 2, when remote reads work.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command shape and registry | `Command` in `src/commands/types.ts`; `coreCommands` in `src/commands/index.ts`; shadowing check `findPriorityConflicts` in `src/commands/priority.ts`, run over every command's `samples` by "routes every declared sample to the command that declares it" in `src/commands.test.ts` |
| Inventory rows for builtin commands | `BUILTIN_FORMS` and `buildApplicationCommands` in `src/application-commands.ts` |
| Printing a command's output into the issuing tab | `appendCommandOutput` in `src/command/append.ts` |
| Parser, usage line, local reader | `parseFileRead`, `FILE_READ_USAGE` in `src/file-read/command.ts`; `readWorkspaceLines` in `src/file-read/read.ts` |
| Fake `Managers` for a command test | `src/commands/new-file.test.ts` (`tab.append` collecting entries, `managers as never` cast); `launchDir` fakes in `src/commands/create.test.ts` |
| Help page shape and table | `help/files.md` (`### files`, intro, **Usage**, **Use cases**, **Examples**); the table in `help/commands.md`; the generated reference in `documentation/user-documentation/command-reference/[command].paths.ts`, rendered by `renderCommandPageContent` in `documentation/.vitepress/command-reference.ts` (it replaces the page's first `###` heading and inserts the sprite after it) |

## Proposed changes

Land these together; typecheck and tests are green only once the help page and row arrive with the command.

- New `src/file-read/tab-read.ts`: `readFileInTab` as decided above, with the parse-first step, the local-root rule, and the remote-tab branch returning the unavailable constant. Imports use `.js` extensions (`../managers.js`, `./command.js`, `./read.js`).
- New `src/commands/file.ts`: the `file` command with `name: 'file'`, the match above, and `samples` `['file', 'file read README.md', 'file read src/a.ts --offset 10 --limit 5']`, so the registry's shadowing test covers it.
- `src/commands/index.ts`: import it as `command as file` beside the `import { command as files } from './files.js';` line, and list `file` in the `coreCommands` array immediately before `files` (between `search` and `files`). The file is at 108 lines, so two more lines stay well under the limit.
- `src/application-commands.ts`: the `file` entry in `BUILTIN_FORMS` (101 lines today; one more line).
- New `help/file.md`, in the shape of `help/files.md` and starting with the `### file` heading (the docs generator replaces the first `###` line), covering:
  - the grammar `file read <path> [--offset <line>] [--limit <lines>]`, the defaults (offset 1, limit 2000), and the caps (2000 lines per read, 5 MB per file);
  - the numbered output, the line cut (lines longer than 2000 characters, counted in code points, are cut and end with `…`), the `(empty file)` line, and the continuation notice `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`;
  - every error line from source decision 17, with the offset error written exactly as printed, including the unpluralized `(1 lines)` for a one-line file; secret files (`.env`, `.env.*`, and `SECRET_DENY_PATHS` segments) refused anywhere in the workspace; the usage line and what triggers it;
  - the local root (the tab's workspace, else the project directory), and that output carries no host tag.

  Do not add an `<img>` tag; the docs build adds the sprite.
- `help/commands.md`: a `file` row between the `execute` and `files` rows, at most 200 characters of description (`src/commands.test.ts`, "limits ordinary command descriptions to 200 characters and bounds the files row"; only `files` is allowed past 200). Use the row `| \`file\` | Read a workspace file as numbered lines: \`file read <path> [--offset <line>] [--limit <lines>]\`, at most 2000 lines per read |`. It contains no `|` inside the description, so nothing needs escaping, and it says nothing about remote tabs until piece 2.

## Tests

- New `src/commands/file.test.ts`, colocated with the command. The fake `Managers` is cast `as never` like `new-file.test.ts` and carries `tab.byLabel` (returning a fake tab with or without `workspaceDir`/`remote`), `tab.launchDir`, and `tab.append` collecting entries; `run` is called without an invocation, so output lands in `tab.append`. Local reads use temp directories from `mkdtempSync(path.join(tmpdir(), …))`, removed in `afterEach`. Cases:
  - `match` accepts `file`, `FILE read x`, and rejects `files x`;
  - a local tab with a `workspaceDir` reads a file under it, printing numbered lines;
  - a local tab without one, and a label `byLabel` does not find, read under `launchDir`;
  - a usage error prints `FILE_READ_USAGE` without calling `tab.byLabel`;
  - a remote tab (one with `remote` set) prints `Remote connection unavailable.` and does not read the local disk (a file at the same relative path under `launchDir` is not printed), and makes no `managers.remote` call (the fake's `remote.get`/`readyOf`/`workspaceOf` record calls and the test asserts none). Piece 2 replaces this case with its remote scenarios.
  - every case asserts exactly one appended entry whose `input` is the typed line.
- `src/application-commands.test.ts`: in a new `it` block, a builtin `file` row with forms `['file']` and no `parent` exists, and `resolveApplicationCommand('file read a.md')` resolves to `{ name: 'file', forms: ['file'] }`.
- `src/commands.test.ts` and `src/application-commands.claims.test.ts` keep passing with the new command, row, and page; no edit expected.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab:
- `file read .env` prints `Secret file: .env.`;
- `file read ../x` prints `Outside the workspace: ../x.`;
- `file read README.md --limit 3` prints three numbered lines and the continuation notice;
- `file read` prints the usage line;
- `file read .` prints `Is a directory: ..`;
- `help file` shows the new page, and `help commands` lists the `file` row before `files`.

## Out of scope

Reading a remote workspace: the port, its session, the rejection mapping, the path-as-typed rewrite, and the help page's remote paragraph (piece 2). Adding `file read` to the native vocabulary (subplan 6) and to default grants (subplan 9). Any ACP or agent-run path, including calling `readFileInTab` from the tool loop (subplans 8, 11, and 13). Tagging typed output with a host. Specs and the other docs pages (subplan 26).
