# ACP tool loop 5.2 — typed `file read` on remote tabs

**Complexity: 5/10** — ~45 added lines, 1 edited file, 9 requirements, 11 test scenarios (p=5.28); driven by the rejection mapping and the path-as-typed rewrite around one port read

Run order: piece 2 of 2 of subplan 5 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-5-typed-file-command.md`. Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Typed `file` command"; decisions 13, 17, and 21; the `help/file.md` bullet of "Specs and docs"). Depends on piece 1, `product/plans/draft/move-janissarys-acp-tool-loop-5-typed-file-command-1-local-command.md` (the `file` command, `readFileInTab` in `src/file-read/tab-read.ts` with its remote-tab placeholder and unavailable constant, and `help/file.md`), and on both pieces of subplan 4: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-1-far-side-operation.md` (the far-side `read-lines` operation) and `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-2-port-read-lines.md` (`RemoteFileSystemPort.readLines`, whose "Contract subplan 5 relies on" section this piece implements). Subplan 4 is implemented.

Piece 1 left a remote tab printing `Remote connection unavailable.` for every read. This piece makes a remote tab read the remote workspace through the far side, and still never fall back to the local disk. `readFileInTab`'s signature does not change, so subplans 8 and 11, which reuse it for the core loop's workspace runner, get remote reads with no further work.

## Design decisions

- **Remote root** (source decisions 13 and 21). The remote branch piece 1 added (taken when `tab.remote` is set, before the local rule) now:
  - Gets `channel = managers.remote?.get(label)`, `ready = managers.remote?.readyOf(label)`, and `workspace = managers.remote?.workspaceOf(label)`, the same three lookups `resourceFor` in `src/plugins/remote-capabilities.ts` makes. If any is missing (no remote manager, no channel, or a channel still connecting, which has a ready promise but no workspace yet), it returns `Remote connection unavailable.` (piece 1's module constant) without constructing a port.
  - Otherwise constructs `new RemoteFileSystemPort(channel, session, ready)` with its own session id `file-read-<n>`, where `n` is a module-level counter incremented per read. It does not reuse the label: the plugin resource and the navigator ports already use the tab label as their session id on the same channel. It does not reuse `resourceFor`'s cached resource either. This module owns the port: one port per read, disposed in a `finally` whether the read resolved or rejected.
  - Calls `port.readLines(workspace, parsed.path, parsed.offset, parsed.limit)`. Because `root` equals the workspace root, the port's `paths.to` only normalizes the path (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`), with no sub-root prefix. `readLines` resolves to `{ text, path }` (`remoteReadLines` in `src/file-navigator/remote/port-reads.ts`), where `path` is the spelling actually sent. Use the returned `path`; never recompute the mapping.
  - An absolute typed path needs no special case: `remoteReadLines` answers it without traffic as `{ text: 'Outside the workspace: <typed>.', path: <typed> }`.
- **Path as typed** (source decision 17). On resolve, print `text` unchanged unless all of these hold: the returned `path` differs from the typed `parsed.path`, `text` has no newline and no tab character, and `text` ends with `: <path>.`. Then replace that suffix with `: <typed>.`. Every numbered output line contains a tab after its number (`formatFileLines` in `src/file-read/format.ts`), so a numbered result is never rewritten, even a one-line file whose content ends in `: a.md.`. Every reader error line, including `Offset past end of file (<n> lines): <path>.`, ends with that suffix and has no tab. `(empty file)` has no suffix and is left alone. For a typed `.` the far side answers `Is a directory: .` (sent path `''`, so the suffix is `: .`), which becomes `Is a directory: ..` — the same line a local tab prints for `.`.
- **Rejections** (source decision 21). Compare the rejection's `error.message` (use `String(error)` when it is not an `Error`) with `===`:
  - `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`), the far side's containment gate: print `Outside the workspace: <typed>.`.
  - `Remote connection unavailable.` (the channel's `unavailableSend` reply in `src/remote/channel/unavailable.ts`): print it as is.
  - Anything else, including `CLOSED_REASON`, `ENDED_REASON`, and `TIMED_OUT_REASON` from `src/file-navigator/remote/port-requests.ts`: print the message unchanged. Every reason the port can reject with is a single line.
- **Helpers stay private.** The remote branch and the rewrite are unexported helpers in `tab-read.ts`; `readFileInTab` remains the module's only export, and it still never rejects.
- **No host tag** (source plan "Out of scope"). Remote output is printed as returned, with no `[<host>] ` prefix, exactly as on a local tab.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Tab reader, remote-tab branch, unavailable constant, `file` command | `readFileInTab` in `src/file-read/tab-read.ts` and `src/commands/file.ts` (piece 1) |
| Remote channel lookups | `RemoteManager.get`/`readyOf`/`workspaceOf` in `src/remote/manager.ts`, used the same way by `resourceFor` in `src/plugins/remote-capabilities.ts` |
| Port read and teardown | `RemoteFileSystemPort.readLines` and `dispose` in `src/file-navigator/remote/port.ts`, delegating to `remoteReadLines` in `src/file-navigator/remote/port-reads.ts` |
| Rejection reasons | `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts`; `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON` in `src/file-navigator/remote/port-requests.ts` |
| Fake channel for a real port in tests | the `harness()` helper at the top of `src/file-navigator/remote/port.test.ts` (`attachNavigator` capturing the listener, `send` collecting frames, a `reply` that calls `listener.onReply`) |
| Command test file and fake `Managers` | `src/commands/file.test.ts` (piece 1) |

## Proposed changes

- `src/file-read/tab-read.ts`: replace the remote-tab placeholder with the remote branch decided above, plus the unexported rewrite and rejection-mapping helpers and the module-level session counter. New imports use `.js` extensions (`../file-navigator/remote/port.js`, `../file-navigator/file-operation-result.js`). The whole module stays well under 100 lines.
- `help/file.md`: add the remote root (the remote workspace clone, never the local disk) and the `Remote connection unavailable.` line, beside piece 1's local-root text. No `help/commands.md` change.

## Tests

In `src/commands/file.test.ts`, replace piece 1's remote-placeholder case with these, using a real `RemoteFileSystemPort` over a fake channel like `port.test.ts`'s `harness()`:
- a remote tab sends `read-lines` with the normalized path on a session whose id starts with `file-read-` and is not the tab label, and prints the reply's text untagged;
- a remote tab with no channel, and one with a channel but no workspace yet, print `Remote connection unavailable.` and construct no port;
- an error reply of `Remote connection unavailable.` prints that line;
- an error reply of `OUTSIDE_ROOT_REASON` for typed `../x` prints `Outside the workspace: ../x.`;
- a channel close mid-read prints `The remote connection ended.`;
- a reply `File not found: a.md.` for typed `./a.md` prints `File not found: ./a.md.`;
- a reply `Is a directory: .` for typed `.` prints `Is a directory: ..`;
- a one-line numbered reply ending in `: a.md.` for typed `./a.md` is printed unchanged;
- the port's `detachNavigator` is called after both a successful and a rejected read.

Also extend piece 1's usage-error case to assert it constructs no port (the fake channel's `attachNavigator` is never called) on a remote tab.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a remote tab:
- `file read <file only the remote clone has> --limit 3` prints three numbered lines, untagged;
- `file read ./<that file> --offset 999999` prints `Offset past end of file (<n> lines): ./<that file>.`;
- `file read .` prints `Is a directory: ..`;
- with the connection dropped, `file read README.md` prints `Remote connection unavailable.`.

Re-run piece 1's local-tab checks once to confirm the local branch is unchanged.

## Out of scope

The command, its registry and inventory row, the local root, and `help/commands.md` (piece 1). Adding `file read` to the native vocabulary (subplan 6) and to default grants (subplan 9). Any ACP or agent-run path, including calling `readFileInTab` from the tool loop (subplans 8, 11, and 13). Tagging typed output with a host. Specs and the other docs pages (subplan 26).
