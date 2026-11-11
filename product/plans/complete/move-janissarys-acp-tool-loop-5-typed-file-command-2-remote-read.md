# ACP tool loop 5.2 — typed `file read` on remote tabs

**Complexity: 5/10** — ~40 added lines in 1 file, 10 requirements, 12 test scenarios (p=5.35); driven by the rejection mapping and the path-as-typed rewrite around one port read

Run order: piece 2 of 2 of subplan 5 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-5-typed-file-command.md` (its decisions are authoritative). Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Typed `file` command"; decisions 13, 17, and 21; the `help/file.md` bullet of "Specs and docs"). Depends on piece 1, `product/plans/complete/move-janissarys-acp-tool-loop-5-typed-file-command-1-local-command.md`, and its three repair plans `product/plans/complete/file-help-usage-inputs.md`, `product/plans/complete/file-help-error-conditions.md`, and `product/plans/complete/file-read-tab-completion.md`, all implemented. Depends also on both pieces of subplan 4: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-1-far-side-operation.md` (the far-side `read-lines` operation) and `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-2-port-read-lines.md` (`RemoteFileSystemPort.readLines`, whose "Contract subplan 5 relies on" section this piece implements), both implemented. Nothing else has to land first.

Piece 1 left a remote tab printing `Remote connection unavailable.` for every read. This piece makes a remote tab read the remote workspace through the far side, and still never fall back to the local disk. `readFileInTab`'s signature does not change, so subplans 8 and 11, which reuse it for the core loop's workspace runner, get remote reads with no further work.

## What piece 1 left in place

`src/file-read/tab-read.ts` today (19 lines) holds:
- the unexported module constant `REMOTE_UNAVAILABLE = 'Remote connection unavailable.'`;
- the exported `localReadRoot(managers, label)`, which returns `undefined` for a tab with `remote` set and otherwise `tab?.workspaceDir ?? managers.tab.launchDir`. It was exported by `file-read-tab-completion.md` so tab completion and the read share one root rule; `src/controller/completion.ts` passes its result to `completeCommandLine`, and `src/file-read/tab-read.test.ts` pins its three cases;
- the exported `readFileInTab(managers, label, input)`, which parses first (`parseFileRead`, returning `parsed.error` before any lookup), calls `localReadRoot`, and returns `REMOTE_UNAVAILABLE` when the root is `undefined` (the line `if (root === undefined) return REMOTE_UNAVAILABLE;`), otherwise `readWorkspaceLines(root, parsed)`.

That `root === undefined` return is the "remote-tab placeholder" this piece replaces.

## Design decisions

- **Where the remote branch hooks in.** `localReadRoot` does not change: its `undefined` still means "remote tab", which is exactly the condition for the remote branch, and completion and its tests depend on it as is. In `readFileInTab`, the `root === undefined` line returns the result of a new unexported helper (name it `readRemoteFile(managers, label, parsed)`) instead of `REMOTE_UNAVAILABLE`. The parse-first step and the local path are untouched, so a usage error still makes no tab lookup and no `managers.remote` call.
- **Remote root** (source decisions 13 and 21). `readRemoteFile`:
  - Gets `channel = managers.remote?.get(label)`, `ready = managers.remote?.readyOf(label)`, and `workspace = managers.remote?.workspaceOf(label)`, the same three lookups `resourceFor` in `src/plugins/remote-capabilities.ts` makes, written with the same `managers.remote?.` optional access (it passes lint there and keeps test fakes without `remote` safe). If any of the three is missing (no channel, or a channel still connecting, which has a ready promise but no workspace yet), it returns `REMOTE_UNAVAILABLE` without constructing a port.
  - Otherwise constructs `new RemoteFileSystemPort(channel, session, ready)` with its own session id `file-read-<n>`, where `n` is a module-level counter incremented before each port is constructed (first id `file-read-1`). It does not reuse the label: the plugin resource and the navigator ports already use the tab label as their session id on the same channel. It does not reuse `resourceFor`'s cached resource either. This module owns the port: one port per read, disposed in a `finally` whether the read resolved or rejected. `dispose` (`src/file-navigator/remote/port.ts`) sends the session close and calls `channel.detachNavigator(session)`.
  - Calls `port.readLines(workspace, parsed.path, parsed.offset, parsed.limit)`. Because `root` equals the workspace root (the value `ready` resolves to), the port's `RemotePortPaths.to` (`src/file-navigator/remote/port-paths.ts`) only normalizes the path (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`), with no sub-root prefix. `readLines` resolves to `{ text, path }` (`remoteReadLines` in `src/file-navigator/remote/port-reads.ts`), where `path` is the spelling actually sent. Use the returned `path`; never recompute the mapping.
  - An absolute typed path needs no special case: `remoteReadLines` answers it without traffic as `{ text: 'Outside the workspace: <typed>.', path: <typed> }`, and the rewrite below does not apply because the returned path equals the typed one.
- **Path as typed** (source decision 17). On resolve, print `text` unchanged unless all of these hold: the returned `path` differs from the typed `parsed.path`, `text` has no newline and no tab character, and `text` ends with `: <path>.`. Then replace that suffix with `: <typed>.`. Every numbered output line contains a tab after its number (`formatFileLines` in `src/file-read/format.ts`), so a numbered result is never rewritten, even a one-line file whose content ends in `: a.md.`. Every reader error line (`readWorkspaceLines` in `src/file-read/read.ts`, built as `` `${failure}: ${args.path}.` ``), including `Offset past end of file (<n> lines): <path>.`, ends with that suffix and has no tab. `(empty file)` has no suffix and is left alone. For a typed `.` the far side answers `Is a directory: .` (sent path `''`, which `read-lines`' `rootDestination: true` in `src/remote/filesystem/read-lines-operation.ts` lets past the containment gate; the suffix is `: .`), which becomes `Is a directory: ..` — the same line a local tab prints for `.`.
- **Rejections** (source decision 21). `read-lines` has no refusal shape in its descriptor, so every far-side failure and every unanswered request reaches the caller as a rejection (`settle` in `src/file-navigator/remote/port-requests.ts`), and the far side's containment gate replies with the bare `OUTSIDE_ROOT_REASON` error (`refuse` in `src/remote/serve-file-navigator.ts`). Compare the rejection's `error.message` (use `String(error)` when it is not an `Error`) with `===`:
  - `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`): print `Outside the workspace: <typed>.`.
  - `Remote connection unavailable.` (the channel's `unavailableSend` reply in `src/remote/channel/unavailable.ts`): print it as is. Compare against `REMOTE_UNAVAILABLE`; do not add a second literal.
  - Anything else, including `CLOSED_REASON`, `ENDED_REASON`, and `TIMED_OUT_REASON` from `src/file-navigator/remote/port-requests.ts`: print the message unchanged. Every reason the port can reject with is a single line.
- **Helpers stay private.** `readRemoteFile`, the rewrite, and the rejection mapping are unexported helpers in `tab-read.ts`. The module's exports stay exactly `localReadRoot` and `readFileInTab`, and `readFileInTab` still never rejects.
- **No host tag** (source plan "Out of scope"). Remote output is printed as returned, with no `[<host>] ` prefix, exactly as on a local tab.
- **Tab completion does not change.** On a remote tab `localReadRoot` keeps returning `undefined`, so `completeFileReadCommand` (`src/completion/file-read.ts`) keeps offering the `read` subcommand and flags but no path candidates. Path completion is synchronous over the local disk (`completeFilePath` in `src/completion/fs.ts`), no source or canonical decision asks for remote path completion, and offering local entries would name files the remote read cannot see. The `file read` section of `product/specs/tab-completion.md` ("A remote tab offers no path candidates") stays true, so no spec edit.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Tab reader, root rule, unavailable constant, `file` command | `readFileInTab`, `localReadRoot`, `REMOTE_UNAVAILABLE` in `src/file-read/tab-read.ts`; `src/commands/file.ts` (piece 1) |
| Remote channel lookups | `RemoteManager.get`/`readyOf`/`workspaceOf` in `src/remote/manager.ts`, used the same way by `resourceFor` in `src/plugins/remote-capabilities.ts` |
| Port read and teardown | `RemoteFileSystemPort.readLines` and `dispose` in `src/file-navigator/remote/port.ts`, delegating to `remoteReadLines` in `src/file-navigator/remote/port-reads.ts` |
| Rejection reasons | `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts`; `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON` in `src/file-navigator/remote/port-requests.ts` |
| Fake channel for a real port in tests | the `harness()` helper at the top of `src/file-navigator/remote/port.test.ts` (`attachNavigator` capturing the listener, `detachNavigator: vi.fn()`, `send` collecting frames, a `reply(result, error?)` that calls `listener.onReply` for the last request) |
| Command test file and fake `Managers` | `src/commands/file.test.ts` (piece 1): `managers()` with `tab.byLabel`/`launchDir`/`append` and a `remote` object recording `get`/`readyOf`/`workspaceOf` calls |

## Proposed changes

Land both bullets together in one change; `src/` and `help/` are independent, so the order inside it does not matter.

- `src/file-read/tab-read.ts`: replace the `if (root === undefined) return REMOTE_UNAVAILABLE;` line with a call to `readRemoteFile`, and add `readRemoteFile`, the unexported rewrite and rejection-mapping helpers, and the module-level session counter. New imports use `.js` extensions: `RemoteFileSystemPort` from `../file-navigator/remote/port.js` and `OUTSIDE_ROOT_REASON` from `../file-navigator/file-operation-result.js`. Type the helper's parsed argument as `FileReadArgs` (`import type` from `./command.js`, which already supplies `parseFileRead`) rather than redeclaring it. The module stays well under 100 lines, so no extraction.
- `help/file.md`:
  - In the opening paragraph, after the local-root sentence, add that a remote tab reads from its remote workspace clone on the remote machine, never from the local disk, with paths relative to that workspace. Keep "The output carries no host tag."
  - In **Errors**, the intro says every failure names the path as typed; the connection lines do not, so add a short paragraph after the bullet list (not a bullet under that intro) saying that on a remote tab `Remote connection unavailable.` is printed when the tab has no live connection or its workspace is still being prepared, and that a connection that drops or stops answering mid-read prints `The remote connection ended.` or `The remote machine did not answer in time.`.
  - No `help/commands.md` change; its `file` row says nothing tab-specific.

## Tests

In `src/commands/file.test.ts` (test files are exempt from `max-lines`, so no split), replace piece 1's case "prints the unavailable line on a remote tab without reading the local disk" with the cases below. Make the fake `managers().remote` return a fake channel built like `port.test.ts`'s `harness()` (a real `RemoteFileSystemPort` is constructed by the code under test, not the test), with `readyOf` returning `Promise.resolve('/remote/ws')` and `workspaceOf` returning `'/remote/ws'`, each still recording its call; the remote tab is `{ label: 'janus', remote: { host: 'box' } }`. Because the command awaits the reply, start `command.run` without awaiting, wait for the `filesystem-request` frame with `vi.waitFor` as `port.test.ts`'s first case does, reply, then await the run. Cases:
- a remote tab sends `read-lines` with args `{ path: 'notes/a.md', offset: 1, limit: 2000 }` for typed `./notes/a.md` (`parseFileRead` always fills the defaults, so both fields are always sent), on a session whose id starts with `file-read-` and is not the tab label, and prints the reply's text untagged (and not the local `notes.md` under `launchDir`);
- typed `--offset 5 --limit 3` reaches the request args as `offset: 5, limit: 3`;
- a remote tab with no channel, and one with a channel but `workspaceOf` returning `undefined`, print `Remote connection unavailable.` and construct no port (`attachNavigator` never called);
- an error reply of `Remote connection unavailable.` prints that line;
- an error reply of `OUTSIDE_ROOT_REASON` for typed `../x` prints `Outside the workspace: ../x.`;
- typed `/etc/passwd` prints `Outside the workspace: /etc/passwd.` and sends no `filesystem-request`;
- a channel close mid-read (`listener.onClose()`) prints `The remote connection ended.`;
- a reply `File not found: a.md.` for typed `./a.md` prints `File not found: ./a.md.`;
- a reply `Is a directory: .` for typed `.` prints `Is a directory: ..`;
- a one-line numbered reply ending in `: a.md.` for typed `./a.md` is printed unchanged;
- the fake channel's `detachNavigator` is called after both a successful and a rejected read.

Also extend piece 1's case "prints the usage line without looking up the tab" with a remote tab present (label `janus`) and assert the fake channel's `attachNavigator` is never called and `remoteCalls` stays empty. `src/file-read/tab-read.test.ts` (the `localReadRoot` cases) needs no change and must still pass.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a remote tab:
- `file read <file only the remote clone has> --limit 3` prints three numbered lines, untagged;
- `file read ./<that file> --offset 999999` prints `Offset past end of file (<n> lines): ./<that file>.`;
- `file read .` prints `Is a directory: ..`;
- `file read ../outside` prints `Outside the workspace: ../outside.`;
- `file read r<Tab>` still offers no path candidates;
- with the connection dropped, `file read README.md` prints `Remote connection unavailable.`.

Re-run piece 1's local-tab checks once to confirm the local branch is unchanged.

## Out of scope

The command, its registry and inventory row, the local root, and `help/commands.md` (piece 1). Remote path completion for `file read` (see "Tab completion does not change"). Adding `file read` to the native vocabulary (subplan 6) and to default grants (subplan 9). Any ACP or agent-run path, including calling `readFileInTab` from the tool loop (subplans 8, 11, and 13). Tagging typed output with a host. Specs and the other docs pages (subplan 26).
