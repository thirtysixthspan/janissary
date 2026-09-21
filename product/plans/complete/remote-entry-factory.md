# Extract remote entry construction from the lifecycle manager

**Complexity: 6/10** — the change relocates the channel, transport, readiness, and frame-dispatch closure as one unit while preserving the manager's ownership of the entry map and public lifecycle API.

## Goal

`RemoteManager.create` becomes a small registration path. A focused factory owns creation of one remote entry's channel, deferred PTY transport, reconnect generation guard, readiness promise, and remote-frame routing without changing remote launch, attach, recovery, or shutdown behavior.

## Approach

Move the construction pipeline into `src/remote/entry-factory.ts`. The factory receives narrow callbacks for channel closure and session-list changes, so it does not own the manager's entry table. It returns the fully wired entry and channel; `RemoteManager` registers the entry before announcing the new live session.

`remoteServeCommand` moves with the transport construction and is re-exported from `manager.ts`, retaining its public import path. The existing manager tests exercise the factory through the public manager API, including creator-label reuse, frame isolation, shared ownership, attach, detach, and browser handling.

## Implementation

1. Add `src/remote/entry-factory.ts` with remote command construction and the complete per-entry creation pipeline, retaining all current frame, transport, readiness, and reconnect semantics.
2. Reduce `RemoteManager.create` to factory delegation, map registration, and the initial session-change announcement; re-export `remoteServeCommand` from its existing module path.
3. Retain the focused manager lifecycle assertion for a new entry's initial session announcement alongside the broader existing lifecycle coverage.

## Tests

- `src/remote/manager.test.ts`: retains the assertion that a new entry announces its session lifecycle after registration.
- Existing `src/remote/manager.test.ts` and `src/remote/attach.test.ts`: preserve shared-channel, creator-label-reuse, attach, detach, browser-exit, and reconnect behavior through the public API.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Specs and documentation

No functional-spec, `help.md`, or public-documentation update is needed. This is an internal refactor with no observable behavior change.

## Out of scope

- Changes to the remote protocol, reconnection policy, session records, or lifecycle APIs.
- Further restructuring of attachment, termination, or frame-decoding modules.
