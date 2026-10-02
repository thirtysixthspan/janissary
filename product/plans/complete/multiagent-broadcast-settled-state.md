# Broadcast a multi-agent member's settled state

**Complexity: 2/10** — three emit calls in one file and four test cases. Nothing about the shape changes: the payload is already correct when a turn ends, and this only pushes it.

## Goal

A member's answer and failure are written onto the tab's payload but never pushed to a client, so the comparison this feature exists to show does not appear until some unrelated event elsewhere in the app emits a state change.

`MultiAgentSessions.connect` in `src/multiagent/sessions.ts` passes `onEnd`, `onError` and `onChunk` to `session.prompt`. `onEnd` sets `member.answer` and `member.state`, and `onError` sets `member.state` and `member.error` — and neither tells anyone. The private `died` handler does the same on a connection-level death. Meanwhile `messageBus.emit('state', { type: 'dirty' })` appears only twice in `src/multiagent/`, both inside `MultiAgentManager.run`: one when a member's clone lands, one after provisioning returns. Nothing fires when a turn ends.

The convention this breaks is established in the same codebase: `EditorAcpManager.died` emits after mutating the same kind of state, and `AcpManager.run` emits in `finished` and on `onConnect`. A multi-agent tab also never enters the busy set, so no busy-driven re-render covers for it either.

## Approach

Emit `messageBus.emit('state', { type: 'dirty' })` once per terminal transition, immediately after the member is written: in `onEnd`, in `onError`, and in `died`.

The chunk handler must keep accumulating into its local and touching neither the member nor the bus. That is the whole reason the answer is written once: `emitState` broadcasts the entire view on essentially every mutation, an ACP chunk is one mutation, and eight streaming members would each multiply that. A test pins it.

## Implementation steps

1. In `src/multiagent/sessions.ts`, import `messageBus` from `../bus.js`.
2. Emit after `member.answer`/`member.state` are set in the `onEnd` handler.
3. Emit after `member.state`/`member.error` are set in the `onError` handler.
4. Emit after the member is marked failed in `died`, before the hooks run — the guard's early return stays first, so a stale report still emits nothing.
5. Leave `connect`'s `member.state = 'running'` alone: the caller (`MultiAgentManager.run`'s `onReady`) already emits for that transition, and a second emit would double every state broadcast.

## Tests

In `src/multiagent/sessions.test.ts`, subscribing to the bus the way `src/editor/acp-manager.test.ts` does (`messageBus.clear()` in a `beforeEach`, then `messageBus.on('state', 'dirty', spy)`):

- `onEnd` emits exactly one state change and sets the answer and state.
- `onError` emits exactly one state change and sets `failed` with the reason.
- `died` emits exactly one state change and marks the member failed.
- `onChunk` emits nothing and changes nothing on the member — the single-shot write the design depends on.
- A death reported by a session that has already been replaced emits nothing, since the identity guard returns before the emit.

The existing cases in that file drive the handlers with a mocked `connectAcp` and assert member state only; they must keep passing untouched.

## Out of scope

- **Recomputing the payload's `cloning` count**, which is a separate finding and a separate change.
- **Any busy-state or unread-badge signal on the tab strip.** The rows already show each member's state, and no plan promised a strip indicator.
- **Coalescing.** One emit per terminal transition is eight emits for a run of eight, which is the same order as the clone-readiness emits already sent.

## Verification

```
./scripts/run.mjs check-diff
```

Then, with the app running on this repository: run a two-model `fanout`, watch both rows move to `working`, and confirm that when the first answer lands its row fills in without touching anything else — in particular with no other tab running a shell command, and with the comparison tab left in the background while another tab is focused.
