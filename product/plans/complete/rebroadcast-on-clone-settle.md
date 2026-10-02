# Rebroadcast tab state whenever a local workspace clone settles

**Complexity: 2/10** — one state emit moved to the place every clone settlement already passes through. No new type, no protocol change.

## Goal

The metadata row's provisioning indicator for a local workspace is derived from `WorkspaceManager`'s in-flight set, but the only state broadcast when a clone settles comes from the creating tab's `wireProvisioning` callbacks, which are skipped once that tab has closed. A tab that joined the clone through the metadata row's ➕ button (`ProfileManager.newAgentAt`) therefore keeps spinning after its creator closes and the clone lands or fails, until some unrelated broadcast happens. Rebroadcast state on every settlement so the indicator always stops.

## Approach

`WorkspaceManager.trackReady` wraps every clone's `ready` promise and deletes the pending entry in its `finally`. Emitting `messageBus.emit('state', { type: 'dirty' })` there, after the delete, fires on success and failure, whether or not the creator survives, and before `wireProvisioning`'s callbacks run, so `provisioning(dir)` is already false by the time views rebuild. The emit added to the local agent's failure callback in `src/profile/new-agent.ts` becomes redundant and is removed, leaving one source for the broadcast.

## Implementation steps

1. `src/workspace/manager.ts` — import `messageBus` from `../bus.js`; in `trackReady`'s `finally`, emit a `dirty` state event after `this.pending.delete(name)`.
2. `src/profile/new-agent.ts` — remove the `messageBus.emit('state', { type: 'dirty' })` line from the local workspace failure callback.

## Tests

`src/workspace/manager.test.ts`, in the `provisioning` block, spying on `messageBus.emit` the way `src/schedule/manager.test.ts` does:

- a resolved clone emits a `dirty` state event, and `provisioning(dir)` is already false when it fires
- a rejected clone emits a `dirty` state event too

## Out of scope

- The remote ➕ path (`waitForRemoteWorkspace`), which has its own wait and broadcast.
- Any change to `wireProvisioning` or to which callbacks a closed creator skips.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: run `agent foo`, click ➕ in its metadata row while the clone runs, close `foo`, and confirm the joined tab's spinner disappears when the clone lands.
