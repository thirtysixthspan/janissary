# One failure contract for `FileSystemPort` across local and remote trees

**Complexity: 5/10** — one new module on the remote server side, one restructured request path, a documented rule on the port interface, and tests on both sides of the channel. No wire-format change (the reply frame already carries either a `result` or an `error`), no new architecture, and no change to what the containment gate does or does not allow to execute.

`FileSystemPort` has two implementations that disagree about how a refusal is delivered.

`LocalFileSystemPort` reports a path outside the tree as a **value**: `failureResult(OUTSIDE_ROOT_REASON)` from `writeFile`, `createFile`, and `createDirectory`, and per-source `failureReasons` entries from `moveMany`, `deleteMany`, and `paste`.

The remote side **throws** for the same condition: `RemoteFileNavigators.validatePaths` (and `pasteSources`) in `src/remote/serve-file-navigator.ts` raise, the catch in `request` turns that into an `error` reply, and `RemoteFileSystemPort.onReply` turns the error reply into a promise rejection.

Callers in `src/file-navigator/manager-item-operations.ts` and `src/file-navigator/manager-files.ts` only ever branch on `.ok`. So on a remote tree the refusal escapes `mapMaybe` entirely and reaches the client as a bare RPC error, where the identical action on a local tree produces the per-path `failureReasons` report the navigator knows how to render.

## Goal

Each `FileSystemPort` method has exactly one way to report a refusal, and both implementations use it. A remote refusal the server can classify comes back as `{ ok: false, reason }` — or, for a batch, as the same `failedPaths` / `failureReasons` report a local tree produces — so a user moving a file into an out-of-tree path sees the same message whether the tree is local or remote.

## Design decisions

**The rule is "does the return type carry a failure channel", and it is written on the interface.** A method whose declared result can express failure — `FileOperationResult`, `MoveManyResult`, `DeleteManyResult`, `PasteManyResult`, `ReplayResult` — reports every refusal it can classify **as a value** and never rejects for one. A method that returns raw data with nowhere to put a reason — `readDirectory`, `statRows`, `watch`, `gitMetadata`, `search`, `readFile` — has only rejection available and keeps using it. That is a rule a reader can apply to a new method without consulting either implementation, which "result value or rejection, not both" alone is not.

**The containment gate keeps refusing exactly what it refuses today.** This is a security boundary: the far side validates every path a client names against `containedPath` before anything runs, and a refused request still executes nothing at all. Only the *shape of the answer* changes. In particular a batch with one escaping path is still refused whole, rather than being partly performed — narrowing the gate to per-path execution would be a real behavior change to the workspace-containment guarantee, and it is not this fix.

**The refusal is shaped like the operation's own result, not like a generic error.** `write-file`, `move`, `delete`, `rename`, `create-file`, and `create-directory` answer `{ ok: false, reason }`. `move-many`, `delete-many`, and `paste` answer the batch report a wholly-refused local batch produces: every path the client named in `failedPaths`, each mapped to the outside-root reason in `failureReasons`, with `moved`/`pairs` empty and `mutated: false`. `replay` answers a `ReplayResult` whose `result` carries that same report and whose stacks come back untouched. That is what makes the client's existing `.ok` and `failedPaths` branches work without a single caller change.

**The paths are echoed back exactly as the client sent them.** `RemoteFileSystemPort` maps `failedPaths` (and history stacks) back through `paths.from`, so a refusal must speak the same remote vocabulary the request arrived in. Echoing the client's own strings, rather than anything the server resolved, is what keeps that mapping correct.

**A new module, not more of `serve-file-navigator.ts`.** That file is at 180 counted lines against the repo's 200-line ceiling, and the refusal classifier is a table over all seventeen operations. `src/remote/filesystem-refusal.ts` takes the path-extraction and the classifier together, leaving the server class as session bookkeeping and dispatch.

**No new reason string.** `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` is the string the local port already returns and the string the current thrown error already carries, so local and remote produce a byte-identical message.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The containment check | `containedPath` in `src/file-navigator/batch-paths.ts` |
| The refusal reason both sides use | `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` |
| The failure-value constructors | `failureResult`, `failureReasons` in the same file |
| The per-operation path extractor to move | `requestPaths` / `validatePaths` in `src/remote/serve-file-navigator.ts` |
| The batch shape a wholly-refused local batch produces | `moveBatch`, `deleteBatch` in `src/file-navigator/batch.ts` |
| The reply frame that already carries `result` **or** `error` | `filesystem-reply` in `src/remote/protocol.ts` |
| The callers that already branch on `.ok` (unchanged by this plan) | `src/file-navigator/manager-item-operations.ts`, `src/file-navigator/manager-files.ts` |

## Implementation steps

1. **New module `src/remote/filesystem-refusal.ts`.** Move `requestPaths` and `historyPaths` here from `serve-file-navigator.ts` and add:
   - `refusedPaths(frame, root): string[]` — every path the frame names that fails `containedPath`, keeping the existing "an empty path is the root itself" exemption for the operations that accept a root destination. It also covers `paste`'s `sources`, which `requestPaths` does not currently list and which `pasteSources` refuses separately today.
   - `refusalFor(frame, refused): { classified: true; value: unknown } | { classified: false }` — the operation-shaped refusal value, or an explicit "cannot classify" for the six data-returning operations, so the caller's branch is exhaustive rather than a truthiness test on a value that could legitimately be an empty object.

2. **`serve-file-navigator.ts`: refuse before dispatching, and answer in shape.** `request` computes `refusedPaths` first. When it is non-empty, a classified refusal replies as a normal `result`; an unclassifiable one replies with the `error` it does today. `validatePaths`, `rootDestination`, `ROOT_DESTINATION_OPERATIONS`, `requestPaths`, and `historyPaths` leave this file. `pasteSources` keeps its own `containedPath` check as defense in depth but is no longer the thing that reports a refusal.

3. **`filesystem-port.ts`: state the contract.** A comment block on the `FileSystemPort` interface giving the rule in step "Design decisions" above, so the next implementation and the next method both have it in front of them.

## Tests

- `src/remote/serve-file-navigator.test.ts` — the existing `refuses escaping paths for %s` table splits in two. The classified operations (`write-file`, `move`, `move-many`, `delete`, `delete-many`, `rename`, `paste`, `create-file`, `create-directory`, `replay`) now assert a `result` reply carrying the refusal in the operation's own shape, with no `error` field: `{ ok: false, reason }` for the single-item ones, `failedPaths` plus `failureReasons` for the batches, an untouched pair of stacks for `replay`. The unclassifiable ones (`read-file`, `watch`) keep asserting the `error` reply. New cases: a refused batch names **every** path the client sent, not just the offending one; a refused request mutates nothing on disk; `paste` with an escaping source is refused as a value even though the destination is fine; a request with no escaping path is unaffected.
- `src/file-navigator/remote-port.test.ts` — a refusal reply resolves rather than rejects, and `writeFile`/`createDirectory`/`deleteMany` hand their caller `{ ok: false, reason }` / a `failedPaths` report; a genuine transport error still rejects, so the two paths stay distinguishable.
- `src/remote/file-navigator-refusal-contract.test.ts` (new) — the end-to-end statement of the fix, and the only place both implementations are compared directly. A `RemoteFileSystemPort` is wired to a `RemoteFileNavigators` over an in-memory channel serving the same directory a `LocalFileSystemPort` reads, then `renameOne`, `moveOne`, and `deleteOne` run an out-of-tree path through both: the two answers must be `toEqual`, and must both carry the outside-root reason keyed to the offending path. Plus a batch case through `deleteMany`, and an in-tree rename over the same channel so the loopback is shown to work rather than merely refusing everything.

  Comparing the two ports against each other, rather than each against a literal, is what makes this a contract test: a future change to either implementation's refusal wording or shape fails it.

## Out of scope

- **Narrowing the gate to per-path execution for batches.** A refused batch still runs nothing; see the design note.
- **The six hand-synchronized operation lists** in `protocol.ts`, `frame-decode-filesystem.ts`, `serve-file-navigator.ts`, and `remote-port.ts`. That is its own backlog item; this change moves two of those lists into one module but does not attempt the descriptor table.
- **`readFile`'s throw on the local side.** It has no failure channel in its return type, so under the stated contract throwing is correct and stays.
- **The client-side RPC failure contract in `web/src/ws.ts`.** A separate, already-deferred backlog item.
- **Changing any caller in `manager-item-operations.ts` or `manager-files.ts`.** They already branch on `.ok`; the point of the fix is that they now get a value to branch on.
