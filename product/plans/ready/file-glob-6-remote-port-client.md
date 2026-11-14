# File glob 6 — near-side `globPaths` on `RemoteFileSystemPort`

**Complexity: 4/10** — 8 requirements, 7 test scenarios, ~20 added lines across 2 files (p=5.05)

Run order: 6 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`FileGlobArgs` in `src/file-glob/command.ts`) and subplan 5 (the `glob-paths` operation, its args shape in `src/remote/protocol-frames.ts`, and its `{ text }` decoder in `src/remote/filesystem/result-decoders.ts`), all already on this branch.

This subplan gives the near side a way to send `glob-paths`: a helper beside `remoteReadLines` and a one-statement port method. Subplan 7 calls it for a typed glob on a remote tab and maps its rejections to user lines.

## Design decisions

From the source plan, plus details checked against the code:

- `remoteGlobPaths(request, paths, root, args)` in `src/file-navigator/remote/port-reads.ts` takes the port's `RemoteRequest`, its `RemotePortPaths`, the tab root, and a `FileGlobArgs`, and resolves to `{ text: string; dir: string | undefined }`. It follows `remoteReadLines` in the same file (`export async function remoteReadLines(`).
- **Absolute `--path`.** When `args.dir` is defined and `path.posix.isAbsolute(args.dir)`, it resolves to `{ text: 'Outside the workspace: <dir>.', dir: args.dir }` (the dir as typed) and sends nothing, exactly like `remoteReadLines`'s first line. Reason: the path mapper would turn an absolute path inside the remote workspace into a relative one, while the local glob (`resolveStart` in `src/file-glob/glob.ts`, via `checkLexicalPath`) refuses every absolute path.
- **Relative `--path`.** It is mapped with `await paths.to(root, args.dir)` and the result is sent as `dir`, unchanged, even when it is `''`. `RemotePortPaths.to` (`src/file-navigator/remote/port-paths.ts`, `path.posix.relative(await this.workspace, path.posix.resolve(root, relPath))`) normalizes, and a remote tab's root is its remote workspace (`withRemoteTabPort` in `src/file-read/remote-tab-port.ts` hands `workspaceOf(label)` to the caller), so:
  - `.`, `./`, and `src/..` map to `''`. That matters: the far-side gate (`refusedPaths` in `src/remote/filesystem/refusal.ts`) refuses a literal `.` (and an absolute path naming the root) with the "outside this file navigator" error, while `''` is exempt for `rootDestination` operations and globs the root (subplan 5). Never send the typed spelling; always send the mapped one.
  - `./src/` maps to `src`; the returned `dir` is `src`, so subplan 7's `asTyped` can rewrite a far-side `Directory not found: src.` back to the typed spelling.
  - `..`, `../x`, and `src/../..` map to an escaping path and are sent as is. The far side refuses them with an error reply carrying `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`); `glob-paths` has no refusal shape, so `RemotePortRequests` rejects the promise with that message (`settle` in `src/file-navigator/remote/port-requests.ts`). `remoteGlobPaths` does not answer `..` locally and does not catch the rejection; subplan 7 maps it to `Outside the workspace: <dir>.`, the same split `remoteReadLines` and `readRemoteFile` in `src/file-read/tab-read.ts` use.
- **No `--path`.** `args.dir === undefined` sends no `dir` key at all and returns `dir: undefined`.
- **Other arguments.** `pattern` and `limit` are always sent (`parseFileGlob` always fills `limit`, defaulting to `FILE_GLOB_DEFAULT_LIMIT`). `hidden` and `dirs` are sent only when true, as `hidden: true` / `dirs: true`, using the spread-only-when-present style of `remoteReadLines` (`...(offset !== undefined && { offset })`). Subplan 5's decoder keeps the decoded keys equal to the sent keys, so a false flag must not be sent as `false`.
- **Rejections propagate.** Connection failures (`CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`, `Remote connection unavailable.`) and the outside-root error reach the caller as rejections, unchanged. Nothing in this subplan turns them into text.
- **Port method.** `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts` gains `globPaths(root: string, args: FileGlobArgs): Promise<{ text: string; dir: string | undefined }>` right after `readLines`, whose body is the one statement `return remoteGlobPaths(this.requester(), this.paths, root, args);`. It is not added to the `FileSystemPort` interface (`readLines` isn't on it either; only `src/file-read/tab-read.ts` calls it on the concrete class).
- **Size budget.** `port.ts` is at 196 lint-counted lines today (checked with ESLint's `max-lines` counting, `skipBlankLines`/`skipComments`). The change adds `remoteGlobPaths` to the existing `./port-reads.js` import on its one line, one `import type { FileGlobArgs } from '../../file-glob/command.js';` line, and a three-line method: 200, exactly the limit. Keep the method signature on one line. If `lint-files` reports more than 200, extract rather than compact: move the private `pasteRemote` body into a `remotePaste(request, paths, root, sources, destination, mode, policy)` in `src/file-navigator/remote/port-moves.ts` (36 lint-counted lines) beside `remoteMove`, and make `paste` delegate in one statement. `port-reads.ts` is at 48 lint-counted lines and has room.
- **Deadline.** The request uses the standard 60-second `REQUEST_DEADLINE_MS`; `glob-paths` is not added to `LONG_RUNNING` in `port-requests.ts`, because the far side stops at 30 seconds (`GLOB_TIMEOUT_MS`). Nothing changes in `port-requests.ts`.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `remoteReadLines` | `src/file-navigator/remote/port-reads.ts` | The model for the absolute-path short circuit, the `paths.to` mapping, the spread-only-when-present args, and the returned sent spelling. |
| `RemoteFileSystemPort.readLines` | `src/file-navigator/remote/port.ts` | The model for the one-statement delegate using `this.requester()` and `this.paths`. |
| `RemoteRequest` | `src/file-navigator/remote/port-git.ts` | The bound request sender type; already imported by `port-reads.ts`. |
| `RemotePortPaths.to` | `src/file-navigator/remote/port-paths.ts` | Maps and normalizes `--path`; produces `''` for the root. |
| `FileGlobArgs` | `src/file-glob/command.ts` | The argument type (`pattern`, `dir: string \| undefined`, `hidden`, `dirs`, `limit`). Import it type-only with the `.js` extension. |
| `'glob-paths'` args and result | `src/remote/protocol-frames.ts`, `src/remote/filesystem/result-decoders.ts` | `{ pattern: string; dir?: string; hidden?: boolean; dirs?: boolean; limit?: number }` in, `{ text: string }` out; `request('glob-paths', …)` is already typed by them. |
| `harness()` and the `RemoteFileSystemPort.readLines` describe block | `src/file-navigator/remote/port.test.ts` | The fake channel, `reply`, and assertions to copy for the new tests. |

## Proposed changes

Land both files together; nothing else calls the new method until subplan 7.

- `src/file-navigator/remote/port-reads.ts`: add `remoteGlobPaths` after `remoteReadLines`, with a short comment saying it follows the read's absolute-path and sent-spelling rules and that `paths.to` turns a root-naming `--path` into `''`. Add `import type { FileGlobArgs } from '../../file-glob/command.js';`. Update the header comment ("line read, write and text edit") to mention the glob.
- `src/file-navigator/remote/port.ts`: import `remoteGlobPaths` in the existing `./port-reads.js` import and `FileGlobArgs` type-only; add `globPaths` after `readLines` as described.

## Tests

`src/file-navigator/remote/port.test.ts`, a new `describe('RemoteFileSystemPort.globPaths', …)` after the `readLines` block, using `harness()` (workspace `/remote/ws`, root `/remote/ws`) and building a full `FileGlobArgs` literal per case:

- No `--path`, `hidden` and `dirs` false: sends `glob-paths` whose args keys are exactly `pattern` and `limit`, and resolves to `{ text: <reply text>, dir: undefined }`.
- `dir: './src/'`: sends `dir: 'src'` and resolves with `dir: 'src'`.
- `dir: '.'` and `dir: 'src/..'`: each sends `dir: ''` (the key present, value empty) and resolves with `dir: ''`.
- `dir: '/remote/ws/src'`: resolves to `{ text: 'Outside the workspace: /remote/ws/src.', dir: '/remote/ws/src' }` and sends no `filesystem-request`, like the readLines absolute-path case.
- `hidden: true, dirs: true`: both are sent as `true`.
- `dir: '../x'`: sends `dir: '../x'`; a reply with error `OUTSIDE_ROOT_REASON` rejects with that message.

`src/file-navigator/remote/port-requests.test.ts`: add `expect(requestDeadline('glob-paths')).toBe(REQUEST_DEADLINE_MS);` beside the `read-lines` line, pinning the deadline decision.

## Verification

- `$janissary/scripts/run.mjs check-diff`, and confirm `lint-files` shows no `max-lines` error on `port.ts`.
- No manual end-to-end check yet: nothing calls `globPaths` until subplan 7. Subplan 9 carries the remote end-to-end check.

## Out of scope

Choosing a remote tab's root, the port lifecycle (`withRemoteTabPort`), rewriting sent spellings and mapping rejections or connection failures to user lines, and routing the typed command are subplan 7. The ACP loops are subplan 8. No change to the far-side operation, the containment gate, `globWorkspace`, `RemotePortPaths`, or `port-requests.ts`.
