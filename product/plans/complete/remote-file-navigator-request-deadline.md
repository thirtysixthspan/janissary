# Give every remote file-navigator request a deadline

**Complexity: 4/10** — contained to `RemotePortRequests` in `src/file-navigator/remote/port-requests.ts`, plus a new colocated test and a spec paragraph. No new architecture.

`RemotePortRequests` settled a pending request only on a reply (`answer`) or on `failAll`, which runs only from `RemoteFileSystemPort.dispose()` and `onClose()` (a final channel close). A reply can be lost without either happening: the transport dies with the request in it and the channel goes `reconnecting` (which notifies no navigator listener), or the detached peer (`src/remote/serve-detach.ts`) evicts the reply from its bounded pending buffer before reattach. Such a request never settled — `runPull` left `state.pull` at `pulling`, blocking every later pull and commit, and `listingFor` left the path in `listingLoads`, so the directory never loaded.

## Goal

Every request ends — in its reply, its operation's refusal value, or a rejection — within a known time. Ordinary requests wait a minute; work that really runs on the far side (git pull/commit, search, bulk move/delete/paste, history replay, whole-file read/write) waits ten. A reply after the deadline is ignored.

## Approach

1. `RemotePortRequests.add` starts a timer per request (deadline from `requestDeadline(operation)`, injectable through the constructor), unref'd so it never holds the process open. `answer` and `failAll` clear it; on expiry the request is settled through the existing `settle()` with `TIMED_OUT_REASON`, so result-returning operations get their per-path failure value from `refusalValueFor` and the rest reject — the shapes `runPull` (`src/file-navigator/manager/pull.ts`) and `listingFor` (`src/file-navigator/filesystem-cache.ts`) already handle.

## Decision: no early failure on reconnect

The backlog entry also proposed failing every outstanding request when the channel enters `reconnecting`. Reading `DetachedPeer` showed it queues frames — `filesystem-reply` included — and replays them on reattach, so failing at reconnect would discard real replies that are still coming and report work as failed that the remote finished. The deadline alone covers the lost-reply cases without that cost, so the reconnect hook was not added.

## Implementation steps

1. Rework `RemotePortRequests` to hold each pending request beside its timer.
2. Add `src/file-navigator/remote/port-requests.test.ts`.
3. Run `./scripts/run.mjs check-diff`.
4. Update `product/specs/remote-server.md`.

## Tests

`src/file-navigator/remote/port-requests.test.ts`, with fake timers:

- an unanswered read-only request rejects with the timeout reason exactly at its deadline;
- an unanswered mutating request resolves with its failure value carrying the timeout reason;
- a pull gets the long deadline;
- a request answered in time resolves once and never times out;
- a reply after the deadline is dropped;
- a request a close already failed is not settled again by its timer.

`src/file-navigator/remote/port.test.ts` (reply, refusal, close, and dispose cases) keeps passing unchanged.

## Out of scope

- Telling the user a reconnect is under way, or retrying anything.
- Validating the shape of a reply's result (a separate concern).
