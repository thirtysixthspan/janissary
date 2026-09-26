# One module for the detached peer's on-disk record

Backlog: technical debt — "Give the detached peer's on-disk record one module that owns its path, its writer and a single validated reader, instead of three readers that each rebuild and check it differently."

Complexity rating: 4/10

## Goal

The `.janissary/remote/<session>.json` record a `DetachedPeer` writes is an on-disk contract with no owning module. Its path was assembled three ways, its shape re-asserted with `as typeof record` casts, and each reader validated `pid` and `socket` differently. A record holding `null` threw inside `requestParkedCapture`'s Promise executor, and the launch-name check derived the record directory from `workspacePath(label)` by walking up two levels, so a change to the workspace layout could silently stop it seeing live peers.

## Approach

Create `src/remote/peer-record.ts` exporting `peerRecordDir(root)`, `peerRecordPath(root, session)`, `writePeerRecord(file, record)` and `readPeerRecord(file)`. The reader returns the validated record (strict positive integer `pid`, string `socket`, optional string `label`), `'missing'` when the file does not exist, or `'invalid'` otherwise — `relayPeer` needs to tell an ended session (missing) from a broken record, and the other readers treat both as no peer. Use it from `DetachedPeer` (constructor, `start`, `setLabel`), `relayPeer`, `requestParkedCapture` and `hasLivePeer`, removing the casts. `requestParkedCapture` keeps its documented choice not to check `isPidAlive`.

`src/workspace/index.ts` gains `workspaceProjectDir()`, the root `initWorkspaceDir` was given, so `hasLivePeer` builds the record directory from the root rather than deriving it from a workspace path.

## Implementation steps

1. Add `peer-record.ts`.
2. Switch the writer and `relayPeer` in `src/remote/serve-detach.ts`, and `requestParkedCapture` in `src/remote/serve-detach-query.ts`.
3. Add `workspaceProjectDir()`; switch `hasLivePeer` in `src/launch-name/leftover.ts` and delete its local `peerRecordDir` and `readPeerRecord`.

## Tests

- New `src/remote/peer-record.test.ts`: the path, a write/read round trip with owner-only mode, missing versus unreadable, and refusal of `null`, a non-object, a fractional or non-positive pid, a non-string socket and a non-string label.
- `src/remote/serve-detach-query.test.ts`: a `null` record resolves `undefined` without throwing; the fake-peer fixture writes a `pid`, as the real writer always does.
- `src/remote/serve.test.ts` and `src/launch-name/leftover.test.ts` keep passing.

## Out of scope

- Adding a liveness check to `requestParkedCapture`.

## Specs and docs

- No spec, `help.md` or user documentation describes the record's format or validation; the change is internal apart from a malformed record no longer crashing the capture query, which already answered "no capture" for other unreadable records. No edit.
