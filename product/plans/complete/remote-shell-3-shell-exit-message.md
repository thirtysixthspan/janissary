# Correct remote shell exit classification

**Complexity: 1/10** — preserve the existing remote termination callback while keeping its harness discriminator specific to actual harness processes.

## Goal

When a remote shell process exits, its transcript and notification identify it as a remote shell rather than a remote harness.

## Approach

`SessionRouter.exit` already routes selected process exits through the `onSessionExit` callback. Keep shell spawns in that selection, but pass the callback's `harness` boolean only when the spawn frame carries `harness`. The entry factory will then use the launch tab as the owner for this standalone shell and `terminateRemoteProcess` will choose its existing `Remote shell` wording.

## Implementation steps

1. In `src/remote/channel/sessions.ts`, separate the shell-exit routing condition from the harness boolean passed to `onSessionExit`.
2. Update `src/remote/channel/sessions.test.ts` to assert that a shell exit invokes `onSessionExit` with no explicit process owner and `harness` false. Keep coverage that an actual harness exit passes `harness` true.

## Tests

- Run `./scripts/run.mjs check-diff` after the code and test changes.
- The routing test has no `Managers` instance and cannot assert the rendered termination string directly; the callback's `false` discriminator exercises the existing `Remote shell` branch in `terminateRemoteProcess`.

## Out of scope

- Changing process-exit behavior, notification formatting, or remote session lifetime.
- Adding a process owner label to the remote protocol.
