# File glob 6 — near-side `globPaths` on `RemoteFileSystemPort`

**Complexity: 3/10** — ~20 added lines, 2 files edited, 5 requirements, 4 test scenarios (p=4.60)

Run order: 6 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 5 (the `glob-paths` operation and its result decoder).

This subplan gives the near side a way to send `glob-paths`: a helper beside `remoteReadLines` and a one-statement port method. Subplan 7 calls it for a typed glob on a remote tab.

## Design decisions

All from the source plan:

- `remoteGlobPaths(request, paths, root, args)` does what `remoteReadLines` does. An absolute `--path` is answered locally with `Outside the workspace: <dir>.` before anything is sent, because the path mapper would turn one inside the remote workspace into a relative path, while the local glob refuses every absolute path. A relative `--path` is mapped with `paths.to(root, dir)` and sent. With no `--path`, no `dir` is sent.
- It returns the far side's `text` and the `dir` spelling actually sent, so the caller can rewrite a line naming the sent spelling back to what the user typed, the same contract `remoteReadLines` has.
- `pattern`, `hidden`, `dirs`, and `limit` are forwarded unchanged; `hidden` and `dirs` are sent only when true.
- `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts` gains a `globPaths` method beside `readLines` that delegates in one statement. `port.ts` is at about 196 lint-counted lines, so the method must stay one statement; anything more lives in `port-reads.ts`.
- The request uses the standard 60-second deadline; `glob-paths` is not added to `LONG_RUNNING` in `port-requests.ts`.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `remoteReadLines` | `src/file-navigator/remote/port-reads.ts` | The model for the absolute-path short circuit and the returned sent spelling. |
| `RemoteFileSystemPort.readLines` | `src/file-navigator/remote/port.ts` | The model for the one-statement delegate using `this.requester()` and `this.paths`. |
| `RemoteRequest`, `RemotePortPaths` | `src/file-navigator/remote/port-git.ts`, `port-paths.ts` | The bound request sender and path mapper. |
| `FileGlobArgs` | `src/file-glob/command.ts` (subplan 1) | The argument type passed in. |

## Proposed changes

- `src/file-navigator/remote/port-reads.ts`: add `remoteGlobPaths(request, paths, root, args)`, returning `{ text, dir }` where `dir` is the sent spelling or `undefined`. Update the file's header comment to mention the glob.
- `src/file-navigator/remote/port.ts`: add `globPaths(root, args)` returning that promise, one statement, and import `remoteGlobPaths`.

## Tests

`src/file-navigator/remote/port.test.ts` (or a new `port-reads.test.ts` if `port.test.ts` is unwieldy):

- A glob with no `--path` sends `glob-paths` with the pattern and limit, no `dir`, and returns the reply text.
- A relative `--path` is mapped and sent; the returned `dir` is the sent spelling.
- An absolute `--path` answers `Outside the workspace: <dir>.` and sends nothing.
- `hidden` and `dirs` are sent only when true.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

Choosing a remote tab's root, port lifecycle, mapping connection failures to user lines, and routing the typed command are subplan 7.
