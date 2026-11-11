# ACP tool loop 5 — typed `file read` command for local and remote tabs

**Complexity: 6/10** — ~90 added lines, 12 requirements, 14 test scenarios (p=5.88); driven by the remote branch's rejection mapping and path-as-typed rewrite on top of the command, registry, and inventory row

Run order: 5 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Typed `file` command"; decisions 12, 13, 17, 18, and 21; the `help/file.md` and `help/commands.md` bullet of "Specs and docs"). Depends on subplans 1 and 3 (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`, `product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`) and on both pieces of subplan 4: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-1-far-side-operation.md` (the far-side `read-lines` operation) and `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-2-port-read-lines.md` (`RemoteFileSystemPort.readLines`, whose "Contract subplan 5 relies on" section this plan implements). All of them are implemented. Subplan 6 hangs the native `file read` row under the builtin `file` row this plan adds. Subplans 8 and 11 reuse its tab reader for the core loop's workspace runner, and subplan 26 relies on the help page and table row landing here.

`file read` is both an ACP tool and a command a user can type. This subplan adds the typed command and the one rule both of them use to pick where a tab's read happens. A local tab reads its own root on this machine. A remote tab reads the remote workspace through the far side and never falls back to the local disk.

## Design decisions

- **One command definition** (architecture principle 5). A `Command` named `file` lives in `src/commands/file.ts` and is listed in `coreCommands` in `src/commands/index.ts`, immediately before `files`. Its `match` is `/^file\b/i`, which does not accept `files …` (no word boundary between `e` and `s`), and `files`'s `/^files\b/i` does not accept `file …`. `parseFileRead` (`src/file-read/command.ts`) does all argument handling, so bare `file`, `file read`, an unknown subcommand, and every bad flag print `FILE_READ_USAGE`.
- **Inventory row.** `BUILTIN_FORMS` in `src/application-commands.ts` gains `file: { name: 'file', forms: ['file'] }`, in alphabetical position next to `files`. Without it `buildApplicationCommands` skips the command, so the Commands tab cannot list or disable it, `disabledApplicationCommand` (`src/native-commands/policy.ts`) cannot refuse it, and subplan 6's native `file read` row has no parent. The forms list is only `['file']`: subplan 6 adds `file read` as a native row, and a builtin `file read` form would produce a second `['file read', ['file read']]` pair, which the uniqueness test in `src/application-commands.test.ts` ("keeps name and form pairs unique") rejects.
- **One tab reader.** The local-or-remote choice lives in a new `src/file-read/tab-read.ts`, exporting `readFileInTab(managers: Managers, label: string, input: string): Promise<string>`. `input` is the whole command line (`file read <path> …`). It resolves to the text to print and never rejects. The typed command prints what it returns, and subplan 8's core-loop workspace runner calls the same function with the same signature, so a typed read and an agent read on the same tab always agree. The pure `command.ts`, `format.ts`, and `read.ts` stay free of `Managers` because the far side imports them (`src/remote/filesystem/read-lines-operation.ts` imports `read.ts`). `tab-read.ts` is local-host glue: it may import `Managers` and the port, and no far-side module may import it.
- **Parse first.** `readFileInTab` calls `parseFileRead(input)` before anything else. A `{ error }` result is returned as is, with no tab lookup and no port.
- **Local root** (source decision 13). Look the tab up with `managers.tab.byLabel(label)`. When the tab has no `remote` field, the root is its `workspaceDir` when set, otherwise `managers.tab.launchDir` (the `TabManager` getter over the project directory in `src/tab/manager.ts`). A label with no tab is treated as local with `launchDir`. The read is `readWorkspaceLines(root, parsed)` from `src/file-read/read.ts`. The local reader already names the path as typed, so no rewrite applies.
- **Remote root** (source decisions 13 and 21). A tab with `tab.remote` set is remote. A remote tab's `workspaceDir` is deliberately undefined (comment above `remote?: RemoteTarget` in `src/tab/types.ts`), so the branch tests `tab.remote` first and never reaches the local rule. Joined plugin and navigator tabs on a remote workspace also carry `remote` (`src/plugins/launch-tab-remote.ts`), so they read remotely too. The remote branch:
  - Gets `channel = managers.remote?.get(label)`, `ready = managers.remote?.readyOf(label)`, and `workspace = managers.remote?.workspaceOf(label)`, the same three lookups `resourceFor` in `src/plugins/remote-capabilities.ts` makes. If any is missing (no remote manager, no channel, or a channel still connecting, which has a ready promise but no workspace yet), it returns `Remote connection unavailable.` without constructing a port.
  - Otherwise constructs `new RemoteFileSystemPort(channel, session, ready)` with its own session id `file-read-<n>`, where `n` is a module-level counter incremented per read. It does not reuse the label: the plugin resource and the navigator ports already use the tab label as their session id on the same channel. It does not reuse `resourceFor`'s cached resource either. This module owns the port: one port per read, disposed in a `finally` whether the read resolved or rejected.
  - Calls `port.readLines(workspace, parsed.path, parsed.offset, parsed.limit)`. Because `root` equals the workspace root, the port's `paths.to` only normalizes the path (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`), with no sub-root prefix. `readLines` resolves to `{ text, path }` (`remoteReadLines` in `src/file-navigator/remote/port-reads.ts`), where `path` is the spelling actually sent. Use the returned `path`; never recompute the mapping.
  - An absolute typed path needs no special case: `remoteReadLines` answers it without traffic as `{ text: 'Outside the workspace: <typed>.', path: <typed> }`.
- **Path as typed** (source decision 17). On resolve, print `text` unchanged unless all of these hold: the returned `path` differs from the typed `parsed.path`, `text` has no newline and no tab character, and `text` ends with `: <path>.`. Then replace that suffix with `: <typed>.`. Every numbered output line contains a tab after its number (`formatFileLines` in `src/file-read/format.ts`), so a numbered result is never rewritten, even a one-line file whose content ends in `: a.md.`. Every reader error line, including `Offset past end of file (<n> lines): <path>.`, ends with that suffix and has no tab. `(empty file)` has no suffix and is left alone. For a typed `.` the far side answers `Is a directory: .` (sent path `''`, so the suffix is `: .`), which becomes `Is a directory: ..` — the same line a local tab prints for `.`.
- **Rejections** (source decision 21). Compare the rejection's `error.message` (use `String(error)` when it is not an `Error`) with `===`:
  - `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`), the far side's containment gate: print `Outside the workspace: <typed>.`.
  - `Remote connection unavailable.` (the channel's `unavailableSend` reply in `src/remote/channel/unavailable.ts`): print it as is.
  - Anything else, including `CLOSED_REASON`, `ENDED_REASON`, and `TIMED_OUT_REASON` from `src/file-navigator/remote/port-requests.ts`: print the message unchanged. Every reason the port can reject with is a single line.

  Define the unavailable text once in `tab-read.ts` as a module constant; there is no exported constant for it today.
- **No host tag** (source plan "Out of scope"). Typed output is printed as returned, with no `[<host>] ` prefix, on either kind of tab.
- **Printing.** `command.run` awaits `readFileInTab(managers, tab.label, command_)` and appends `{ input: command_, output }` with `appendCommandOutput(managers, tab.label, entry, invocation)`, exactly as `src/commands/files.ts` does for its parse error. It appends once, after the read, and returns nothing.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command shape and registry | `Command` in `src/commands/types.ts`; `coreCommands` in `src/commands/index.ts`; shadowing check `findPriorityConflicts` in `src/commands.test.ts` |
| Inventory rows for builtin commands | `BUILTIN_FORMS` and `buildApplicationCommands` in `src/application-commands.ts` |
| Printing a command's output into the issuing tab | `appendCommandOutput` in `src/command/append.ts` |
| Parser, usage line, local reader | `parseFileRead`, `FILE_READ_USAGE` in `src/file-read/command.ts`; `readWorkspaceLines` in `src/file-read/read.ts` |
| Remote channel lookups | `RemoteManager.get`/`readyOf`/`workspaceOf` in `src/remote/manager.ts`, used the same way by `resourceFor` in `src/plugins/remote-capabilities.ts` |
| Port read and teardown | `RemoteFileSystemPort.readLines` and `dispose` in `src/file-navigator/remote/port.ts`, delegating to `remoteReadLines` in `src/file-navigator/remote/port-reads.ts` |
| Rejection reasons | `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts`; `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON` in `src/file-navigator/remote/port-requests.ts` |
| Fake channel for a real port in tests | the `harness()` helper at the top of `src/file-navigator/remote/port.test.ts` (`attachNavigator` capturing the listener, `send` collecting frames, a `reply` that calls `listener.onReply`) |
| Fake `Managers` for a command test | `src/commands/new-file.test.ts` (`tab.append` collecting entries); `launchDir` fakes in `src/commands/create.test.ts` |
| Help page shape and table | `help/files.md` (`### files`, intro, **Usage**, **Use cases**, **Examples**); the table in `help/commands.md`; the generated reference in `documentation/user-documentation/command-reference/[command].paths.ts` |

## Proposed changes

Land these together; each step keeps typecheck and tests green only once the help page and row arrive with the command.

- New `src/file-read/tab-read.ts`: `readFileInTab` as decided above, with the remote branch and the rewrite as unexported helpers. Imports use `.js` extensions (`../managers.js`, `../file-navigator/remote/port.js`, `../file-navigator/file-operation-result.js`, `./command.js`, `./read.js`). Expected well under 100 lines.
- New `src/commands/file.ts`: the `file` command with `name: 'file'`, the match above, and `samples` `['file', 'file read README.md', 'file read src/a.ts --offset 10 --limit 5']`, so the registry's shadowing test covers it.
- `src/commands/index.ts`: import it as `command as file` and list it immediately before `files`.
- `src/application-commands.ts`: the `file` entry in `BUILTIN_FORMS`.
- New `help/file.md`, in the shape of `help/files.md`, covering:
  - the grammar `file read <path> [--offset <line>] [--limit <lines>]`, the defaults (offset 1, limit 2000), and the caps (2000 lines per read, 5 MB per file);
  - the numbered output, the line cut (lines longer than 2000 characters, counted in code points, are cut and end with `…`), the `(empty file)` line, and the continuation notice `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`;
  - every error line from source decision 17, with the offset error written exactly as printed, including the unpluralized `(1 lines)` for a one-line file; secret files (`.env`, `.env.*`, and `SECRET_DENY_PATHS` segments) refused anywhere in the workspace; the usage line and what triggers it;
  - the local root (the tab's workspace, else the project directory) and the remote root (the remote workspace clone, never the local disk), the `Remote connection unavailable.` line, and that output carries no host tag.

  Do not add an `<img>` tag; the docs build adds the sprite.
- `help/commands.md`: a `file` row between `execute` and `files`, at most 200 characters of description (`src/commands.test.ts`, "limits ordinary command descriptions to 200 characters"). `src/commands.test.ts` fails when a row is out of alphabetical order or when rows and pages in `help/` do not match one to one ("has a help page for each command row and no orphan command pages"), so the page and the row land in the same change (`ai/guidelines/documentation.md`, "Help Command Table").

## Tests

- New `src/commands/file.test.ts` (fake `Managers` collecting `tab.append` entries; a real `RemoteFileSystemPort` over a fake channel like `port.test.ts`'s `harness()`; a temp directory via `mkdtempSync` for local reads):
  - `match` accepts `file`, `FILE read x`, and rejects `files x`;
  - a local tab with a `workspaceDir` reads a file under it, printing numbered lines;
  - a local tab without one reads under `launchDir`;
  - a usage error prints `FILE_READ_USAGE` and constructs no port (the fake channel's `attachNavigator` is never called);
  - a remote tab sends `read-lines` with the normalized path on a session whose id starts with `file-read-` and is not the tab label, and prints the reply's text untagged;
  - a remote tab with no channel, and one with a channel but no workspace yet, print `Remote connection unavailable.` and construct no port;
  - an error reply of `Remote connection unavailable.` prints that line;
  - an error reply of `OUTSIDE_ROOT_REASON` for typed `../x` prints `Outside the workspace: ../x.`;
  - a channel close mid-read prints `The remote connection ended.`;
  - a reply `File not found: a.md.` for typed `./a.md` prints `File not found: ./a.md.`;
  - a reply `Is a directory: .` for typed `.` prints `Is a directory: ..`;
  - a one-line numbered reply ending in `: a.md.` for typed `./a.md` is printed unchanged;
  - the port's `detachNavigator` is called after both a successful and a rejected read.
- `src/application-commands.test.ts`: a builtin `file` row with forms `['file']` exists, and `resolveApplicationCommand('file read a.md')` resolves to it.
- `src/commands.test.ts` keeps passing with the new row and page; no edit expected.

## Out of scope

Adding `file read` to the native vocabulary (subplan 6) and to default grants (subplan 9). Any ACP or agent-run path, including calling `readFileInTab` from the tool loop (subplans 8, 11, and 13). Tagging typed output with a host. Specs and the other docs pages (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab:
- `file read .env` prints `Secret file: .env.`;
- `file read ../x` prints `Outside the workspace: ../x.`;
- `file read README.md --limit 3` prints three numbered lines and the continuation notice;
- `file read` prints the usage line;
- `help file` shows the new page, and `help commands` lists the `file` row before `files`.

On a remote tab:
- `file read <file only the remote clone has> --limit 3` prints three numbered lines, untagged;
- `file read ./<that file> --offset 999999` prints `Offset past end of file (<n> lines): ./<that file>.`;
- `file read .` prints `Is a directory: ..`;
- with the connection dropped, `file read README.md` prints `Remote connection unavailable.`.
