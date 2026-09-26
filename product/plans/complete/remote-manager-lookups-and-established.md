# Remote manager lookups and one "established" predicate

Backlog: technical debt — "Give the remote manager label and session lookups and one shared "established" predicate, so the sessions feature stops re-deriving them from raw entries."

Complexity rating: 4/10

## Goal

`RemoteManager.liveEntries()` handed out raw entries and offered no lookup or state predicate, so the sessions code re-implemented the manager's own label lookup four times and the session lookup twice, and the "has a session id and a workspace" test existed in five differently written forms. A change to when an entry counts as established had to be found and repeated in five places across two features, and a missed one would make the sessions tab offer an action the detach or resume path then refuses.

## Approach

- `RemoteManager` gains `entryOf(label)` (its own table, which labels join and leave together with `entry.labels`) and `entryForSession(session)`.
- `src/remote/attach.ts` exports `isEstablished(entry)`, a type guard narrowing to an entry with a string session id and workspace directory.
- The label lookups in `src/sessions/manager.ts`, `src/sessions/attach.ts` and `src/sessions/actions.ts` (twice) use `entryOf`; the session lookups in `src/sessions/manager.ts` and `src/sessions/actions.ts` use `entryForSession`.
- `remoteChannelClosed`, `resumeRemote`, `detachRemoteEntry` and `recordOf` test `isEstablished`; `detachRefusal` keeps its two distinct "not yet" messages, built on the predicate.

## Tests

- `src/remote/manager.test.ts`: `entryOf` finds an entry by every label riding it and stops after a release; `entryForSession` finds it by session id; `isEstablished` needs both a session id and a workspace.
- The sessions test fakes gain the two lookups; `src/sessions/manager.test.ts`, `src/sessions/actions.test.ts`, `src/sessions/attach.test.ts`, the round-trip suites, `src/remote/manager.test.ts` (detach refusals) and `src/remote/resume.test.ts` keep passing.

## Out of scope

- Narrowing `liveEntries()`'s return type so callers cannot reach past the manager.

## Specs and docs

- No behavior changes; no spec, `help.md` or user documentation edit.
