# ACP tool loop 5 — typed `file read` command for local and remote tabs

**Complexity: 5/10** — ~75 added lines, 9 requirements, 10 scenarios (p=5.35)

Run order: 5 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Typed `file` command"; decisions 12, 13, and 21; the `help/file.md` and `help/commands.md` bullet of "Specs and docs"). Depends on subplans 1, 3, and 4 (`move-janissarys-acp-tool-loop-1-file-read-parser.md`, `move-janissarys-acp-tool-loop-3-file-read-reader.md`, `move-janissarys-acp-tool-loop-4-read-lines-operation.md`). Subplan 8 reuses its tab reader for the core loop's local workspace runner.

`file read` is both an ACP tool and a command a user can type. This subplan adds the typed command and the one rule both of them use to pick where a tab's read happens. A local tab reads its own root on this machine. A remote tab reads the remote workspace through the far side and never falls back to the local disk.

## Design decisions

- **One command definition** (architecture principle 5). A `Command` named `file` lives in `src/commands/file.ts` and is listed in the registry in `src/commands/index.ts`. Its `match` is `^file\b`, case-insensitive, which neither claims nor is claimed by `files` (`^files\b`). `parseFileRead` does all argument handling, so bare `file`, `file read`, and an unknown subcommand print the usage line from subplan 1.
- **Local root** (source decision 13). On a local tab the root is the tab's `workspaceDir` when it has one, otherwise the project directory, `managers.tab.launchDir` (the `TabManager` getter over the project directory in `src/tab/manager.ts`). Paths are relative to that root.
- **Remote root** (source decisions 13 and 21). A tab with `tab.remote` set is remote. A remote tab's `workspaceDir` is deliberately undefined (`src/tab/types.ts`), so the branch tests `tab.remote` first and never reaches the local rule. It reads the remote workspace clone:
  - It opens a `RemoteFileSystemPort` the way `resourceFor` in `src/plugins/remote-capabilities.ts` does, using `managers.remote.get(label)`, `readyOf(label)`, and `workspaceOf(label)`.
  - The port uses its own session id, `file-read-<n>` from a module counter, because the plugin and navigator ports already use the tab label as their session id on the same channel.
  - It calls `readLines(workspace, path, offset, limit)` and disposes the port in a `finally`.
- **Unavailable** (source decision 21). These print exactly `Remote connection unavailable.`:
  - a missing channel;
  - a missing ready promise or workspace, which means the channel is still connecting;
  - a request rejected with `Remote connection unavailable.`.
  
  A request the far side's containment gate refused, which subplan 4 returns as an `OUTSIDE_ROOT_REASON` rejection, prints `Outside the workspace: <path>.`. Any other rejection prints its error text as one line.
- **Path as typed** (source decision 17). `readLines` maps the path through `paths.to`, which normalizes it, so `./notes/a.md` reaches the far side as `notes/a.md`. When the sent spelling differs from the typed one, a one-line error result that ends with `: <sent>.` is rewritten to end with `: <typed>.`. Every error line in decision 17 has that shape, so error lines always name the path as the caller typed it.
- **No host tag** (source plan "Out of scope"). Typed output is printed as returned, with no `[<host>] ` prefix, on either kind of tab.
- **One tab reader.** The local-or-remote choice lives in a new `src/file-read/tab-read.ts`, as `readFileInTab(managers, label, input)`, which resolves to the text to print. The typed command prints what it returns. Subplan 8's core-loop workspace runner calls the same function, so a typed read and an agent read on the same tab always agree. The pure `command.ts`, `format.ts`, and `read.ts` stay free of `Managers` because the far side imports them. This module is the local-host glue and may import `Managers`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command shape and registry | `Command` in `src/commands/types.ts`; `src/commands/index.ts` |
| Printing a command's output into the issuing tab | `appendCommandOutput` in `src/command/append.ts` |
| Opening a remote port from a tab's channel | `resourceFor` in `src/plugins/remote-capabilities.ts`; `RemoteManager.readyOf`/`workspaceOf` in `src/remote/manager.ts` |
| Port read and teardown | `RemoteFileSystemPort.readLines` (subplan 4), `dispose` in `src/file-navigator/remote/port.ts` |
| The containment reason the far side replies with | `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` |
| Help pages and the generated command reference | `help/*.md`, the table in `help/commands.md`, `documentation/user-documentation/command-reference/[command].paths.ts` |

## Proposed changes

- New `src/file-read/tab-read.ts`: `readFileInTab`, as above. It parses first, so a usage error never opens a port.
- New `src/commands/file.ts`: the `file` command, with `samples` such as `file`, `file read README.md`, and `file read src/a.ts --offset 10 --limit 5`, so the registry's shadowing test in `src/commands.test.ts` covers it. It appends `{ input, output }` with `appendCommandOutput`.
- `src/commands/index.ts`: list it.
- New `help/file.md`, covering:
  - the grammar, the defaults, and the caps;
  - the numbered output and the continuation notice;
  - every error and usage line;
  - the local and remote roots, and the unavailable line.
  
  Do not add an `<img>` tag; the docs build adds the sprite.
- `help/commands.md`: a `file` row in its alphabetical place, just before `files`. `src/commands.test.ts` fails when a row is out of order or a command has no page, so the page and the row must land with the command (`ai/guidelines/documentation.md`, "Help Command Table").

## Tests

- New `src/commands/file.test.ts`:
  - a local tab with a `workspaceDir` reads under it;
  - a local tab without one reads under the project directory;
  - a usage error prints the usage line and opens no port;
  - a remote tab reads through a fake channel's `read-lines` reply and prints the text untagged;
  - a remote tab with no channel, or one still connecting, prints `Remote connection unavailable.`;
  - an unattached channel's rejection prints the same line;
  - the containment rejection prints `Outside the workspace: ../x.`;
  - a not-found error for `./a.md` names `./a.md`, not `a.md`;
  - the port is disposed after both a success and a failure.
- `src/commands.test.ts` keeps passing with the new row and page.

## Out of scope

Adding `file read` to the native vocabulary (subplan 6) and to default grants (subplan 9). Any ACP or agent-run path (subplans 8 and 13). Tagging typed output with a host.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab:
- `file read .env` prints `Secret file: .env.`;
- `file read ../x` prints `Outside the workspace: ../x.`;
- `file read README.md --limit 3` prints three numbered lines and the continuation notice.

On a remote tab, `file read <file only the remote clone has> --limit 3` prints three numbered lines, untagged.
