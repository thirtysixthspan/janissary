# Give the remote channel one pending-request primitive

**Complexity: 5/10** — one small generic module with its own tests, two trackers moved onto it without changing their public methods, and a deadline for capture requests as its own visible step.

## Goal

The remote channel's request families share one tested piece of bookkeeping for the request id, the deadline, and settlement, instead of each keeping its own map and timer. `harness capture <name>` on a remote tab whose far side never answers reports a timeout instead of waiting, with nothing on screen, until the channel closes.

## Approach

Add `PendingRequests<T>` in a new `src/remote/channel/pending-requests.ts`:

- `open(id, { deadlineMs?, onTimeout? })` registers a request and returns the promise its settlement resolves. A deadline starts an unref'd timer, so a pending request never holds the process open, and calls `onTimeout(id)` when it fires.
- `settle(id, value)` resolves one request and `fail(id, reason)` rejects it. Both clear its timer, forget it, and answer whether it was still pending, so a late reply is a no-op.
- `settleAll(outcome)` settles every pending request with `outcome(id)`, either `{ value }` or `{ reason }`, and leaves none behind.

`CaptureRequestTracker` (`src/remote/channel/capture.ts`) and `RemoteAgentRequests` (`src/remote/channel/agent-requests.ts`) keep their public methods (`request`, `resolve`, `fail`, `settleAll`, `failAll`) and keep their pending state in a `PendingRequests`. That removes the hand-rolled deferred, and its `prefer-promise-with-resolvers` suppression, from `RemoteAgentRequests`. The capture module's header still says requests are correlated by spawn id alone, though the code keys them by request id, so the header is corrected.

As a separate step, capture requests gain a 15-second deadline that settles them with `{ error: 'Remote capture query timed out.' }`. The parked path in `src/harness/capture/remote.ts` already bounds its own wait the same way. This changes what `harness capture` reports for a silent far side, so `product/specs/remote-server.md` gets a sentence for it.

## Implementation steps

1. Create `src/remote/channel/pending-requests.ts`.
2. Move `RemoteAgentRequests` onto it, keeping its 15-second deadline and messages.
3. Move `CaptureRequestTracker` onto it and correct the header.
4. Give capture requests their deadline, and describe it in `product/specs/remote-server.md`.

## Tests

- New `src/remote/channel/pending-requests.test.ts`: settle and fail resolve and reject the right request, a second settlement and an unknown id are no-ops, a deadline calls `onTimeout` and a settled request's timer never fires (fake timers), the timer is unref'd, and `settleAll` settles every request with its own outcome and leaves none behind.
- `src/remote/channel/capture.test.ts`: a fake-timer case where a request with no reply settles with the timeout error after 15 seconds, and a reply before the deadline is unaffected by it.
- Existing `src/remote/channel/agent-requests.test.ts` and `src/remote/channel/index.test.ts` stay green unchanged.

## Out of scope

- Moving the file-navigator port requests, the session-state query, and ACP release onto the primitive; later increments.
- `RemoteChannel.send`'s refusal switch for frames sent while detached.
