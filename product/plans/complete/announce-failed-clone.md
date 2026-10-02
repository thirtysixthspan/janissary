# Announce a multi-agent member whose clone fails

**Complexity: 2/10** — one emit in one catch block, and one test. The member is already written correctly; what is missing is that anyone is told.

## Goal

A member whose `git clone` fails is marked `failed` with the reason on the tab's payload, and no client is ever told, so its row keeps reading `cloning its workspace`.

`provisionMembers` in `src/multiagent/workspaces.ts` catches a rejection from `created.ready` in the `settle` helper, writes `member.state` and `member.error`, and stops there. The module does not import `messageBus` at all. Every other terminal transition in the feature announces itself: the two synchronous refusals in the same function are covered by the emit at the end of `MultiAgentManager.run`, and `MultiAgentSessions.connect` emits on its own refusal, on `onEnd`, on `onError` and in `died`.

The payload is read live at projection time, so the row does eventually become correct — when something unrelated in the application happens to emit. For a user watching a quiet comparison tab, that may be minutes, or may be never.

`created.ready` is `run()` in `provisionWorkspace` (`src/workspace/index.ts`): it awaits `clone.ready` and then `finishProvisioning`, whose `execFileAsync` git calls and whose `trustWorkspace` write are all realistic rejection sources. A clone that aborts, an origin that stops answering, a read-only or malformed `~/.claude.json` — each leaves the row lying about what is happening.

## Approach

Emit a state change in that catch, exactly where `MultiAgentSessions.connect` emits for its own terminal transitions.

The two synchronous refusals above it are deliberately left alone: they run inside `MultiAgentManager.run`, which emits once after provisioning returns, so an emit there would double every broadcast for no gain.

## Implementation steps

1. Import `messageBus` from `../bus.js` in `src/multiagent/workspaces.ts`.
2. Call `messageBus.emit('state', { type: 'dirty' })` in the `catch` of `settle`, immediately after `member.state` and `member.error` are written.

Nothing else changes. `src/multiagent/manager.ts` needs no edit — its `onReady` callback emits for the success path already, and `connect` emits for a member it refuses.

## Tests

In `src/multiagent/workspaces.test.ts`, which currently subscribes to nothing:

- Add `messageBus.clear()` to the `beforeEach` and a small `watchState()` helper, following the pattern `src/multiagent/sessions.test.ts` already uses.
- A member whose `ready` rejects emits exactly one state change, and `onReady` is still not called for it. The second half already exists; extend that case rather than duplicating it.
- A member whose `ready` resolves emits nothing from this module — the caller announces that one — so the emit is not simply unconditional.

The existing provisioning cases must keep passing untouched.

## Out of scope

- **A timeout on a clone that never settles.** A hung `git clone` leaves the row reading `cloning its workspace`, which is then accurate; bounding it is a separate decision about what a comparison should do with a slow workspace.
- **The synchronous refusals** above the catch, which the caller's emit already covers.
- **Any change to how a clone failure is reported** — the reason is already read from the rejection and shown.

## Verification

```
./scripts/run.mjs check-diff
```

Then, with the app running: start a comparison whose origin cannot be reached — a project directory with no `origin` remote makes `WorkspaceManager.create` fail, and a member whose clone aborts mid-flight exercises the `ready` rejection itself — and confirm the row reads `failed` with the reason as soon as it happens, without waiting for another tab to do something.
