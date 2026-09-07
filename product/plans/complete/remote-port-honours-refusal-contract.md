# Answer a remote navigator's mutating operations with the failure value their port contract defines

**Complexity: 5/10** — the refusal shapes the far side already uses gain a reason parameter, one lookup is generalised so both sides can call it, and the remote port routes its three failure paths through it. Four source files plus the contract test; no wire change, no new frame type, no client change.

## Goal

Make a rename, delete, paste, or replay that loses its channel report the same per-path failure a local tree reports, instead of a bare transport error the navigator has nowhere to render.

## Approach

`FileSystemPort`'s doc comment splits the methods in two. A method whose result can express failure — `writeFile`, `move`, `moveMany`, `delete`, `deleteMany`, `rename`, `paste`, `createFile`, `createDirectory`, `replay` — reports a refusal **as a value** and never rejects; a method returning raw data with nowhere to put a reason — `readDirectory`, `statRows`, `watch`, `gitMetadata`, `pull`, `search`, `readFile` — has only rejection and uses it. The comment says plainly that a rejection from the first group is an implementation bug.

`RemoteFileSystemPort` honours that split for containment refusals the far side classifies, and breaks it everywhere else, because all fourteen methods funnel through one private `request` that only knows how to reject. It throws when `this.closed`, `rejectPending` — reached from both `onClose` and `dispose` — rejects every outstanding entry regardless of which group its method belongs to, and `onReply` rejects for any `frame.error`. Nothing downstream catches it: `moveOne`/`renameOne`/`deleteOne` and every wrapper in `manager-mutations.ts` map over the value only, so the rejection reaches `handle` in `message-handler.ts` and becomes an RPC error carrying no result — a destructive operation that looks as though nothing happened at all.

The far side already has exactly the table needed. `FILESYSTEM_OPERATIONS` names a refusal shape per operation and leaves it off the read-only group, and `refusalFor` is the lookup. The only thing standing in the way of reusing it is that the shapes hardcode the out-of-tree reason. Give them a reason parameter, generalise the lookup to take an operation and arguments rather than a request frame, and the remote port can ask the same question its server half already asks — with a connection reason instead of a containment one.

The paths a synthesised refusal echoes are the ones the request carried, in remote form, which is what each method's own result mapping then translates back — the same route a server-side refusal already travels, so no method needs new mapping code.

An error reply gets the same treatment for the same reason: a far-side failure on a value-returning method is a failure that method's result can express, and rejecting for it is the same bug in a different guise. The reason carried is the far side's own message.

What this cannot fix stands: a request lost after the far side had begun the work is still reported as failed when it may have succeeded. That is inherent to a lost reply, not to the shape it is reported in.

## Implementation steps

1. In `src/remote/filesystem-refusal-shapes.ts`, thread a `reason` parameter through `refusedBatch` and the five exported shapes in place of the hardcoded `OUTSIDE_ROOT_REASON`, and drop the now-unused import.
2. In `src/remote/filesystem-operations.ts`, widen `OperationDescriptor.refusal` to take the reason as a third argument, and note in its comment that the reason is the caller's — containment on the server, connection failure on the client.
3. In `src/remote/filesystem-refusal.ts`, add `refusalValueFor(operation, args, reason)` holding the descriptor lookup, and reduce `refusalFor(frame)` to a call to it with `OUTSIDE_ROOT_REASON`. `serve-file-navigator.ts` is unchanged.
4. Add `src/file-navigator/remote-port-requests.ts` — a `RemotePortRequests` holding the pending map with the operation and arguments beside each entry's callbacks, plus the settlement rule: resolve with `refusalValueFor(...)`'s value when the operation has a refusal shape, reject otherwise. It sits beside the existing `remote-port-paths`, `remote-port-watchers`, and `remote-port-history` siblings, and keeps `remote-port.ts` under the file-size limit, which this change would otherwise push it past.
5. In `src/file-navigator/remote-port.ts`, replace the pending map with that class and route the two `onClose`/`dispose` drains, the `onReply` error branch, and the closed-before-send path through it — including the case where `this.opened` itself rejected.

## Tests

`src/remote/file-navigator-refusal-contract.test.ts` runs both ports over an in-memory loopback and asserts their answers match, but only for containment refusals over a healthy channel. Those cases must keep passing. Added:

- The channel closed with a rename, a batch delete, and a replay in flight: each resolves with the same `failedPaths`/`failureReasons` shape a local tree produces for a wholly-failed operation, rather than rejecting.
- A genuine far-side error reply on a mutating operation reports as a value carrying that error's message.
- A read-only method — `search` — still rejects when the channel closes under it, because that is what its half of the contract says.
- An in-tree operation over a healthy channel still succeeds, so the settlement path has not swallowed the success case.

`src/file-navigator/remote-port.test.ts` covers the port directly. Its "still rejects when the reply carries a transport error" case asserts exactly the behavior this changes and is rewritten: an error reply on a value-returning method now resolves with the failure value, and a new case pins that a read-only method still rejects for the same reply. Added alongside: a batch delete outstanding when the channel closes, and a request made after disposal, which is reported without ever reaching the channel.

## Spec updates

`product/specs/remote-server.md` — state that a file-navigator operation that can report per-path failure does so when its connection ends or the far side errors, rather than failing as a bare transport error, and that a lost reply is reported as failed even though the far side may have completed it.

## Docs

None. `help.md` lists the `files` command and the navigator's key bindings but nothing about failure reporting. `documentation/user-documentation/advanced-agents/remote-agents.md` mentions a dropped connection only in terms of the remote cleaning up its workspace clone, and the file-navigator page describes no remote failure behavior at all, so nothing there is now wrong.

## Out of scope

- The client half of the same chain — `JanusClient.request`'s declared return type and its call sites — which is a separate backlog entry.
- Retrying or replaying a lost mutating request, which a lost reply cannot justify.
- The read-only group, which keeps rejecting.
