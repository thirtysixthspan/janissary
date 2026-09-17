# Stop misreporting a local kill as a remote session termination

**Complexity: 4/10** — a one-line fix to a map lifecycle bug in `RemoteChannel`, plus one test.

PR 1131 backlog item: *"Stop reporting a locally requested kill of a remote shell or harness as a far-side session termination."*

`RemoteChannel.send` records every `spawn` frame in its `spawned` map (used to recognize a harness's or a pipe-mode shell's own exit and distinguish it from an ordinary process exit) but never removes an id when the local side sends the matching `kill`. The far side's echoed `exit` frame then still finds an entry in `spawned`, so `dispatch`'s exit handling calls `handlers.onSessionExit`, which `RemoteManager` routes to `endRemoteProcess` in `src/remote/reattach.ts` — stamping the tab's `sessionEnded`, raising a `remote-session-ended` notification, and, when no other tab shares the channel, tearing the whole session down via `terminateRemoteEntry`. `ShellManager.getShell` respawns a dead shell on the next command by retiring the old one first (`ShellManager.close`, which calls `kill()`), and `connection close shell` in a remote agent tab does the same — both routine, expected actions that should not end the remote session.

## Design decision

**Fix the `spawned` map's lifecycle, not the `onSessionExit` routing.** The bug is that `spawned` tracks "a process this side started" but is only cleared on `exit`, never on the local side's own `kill`. Deleting the entry when a `kill` frame is sent means the subsequent `exit` frame finds nothing in `spawned` and takes the plain `listener?.onExit(...)` path — the same path an ordinary (non-harness, non-shell) process exit already takes. This fixes the reported bug at its source rather than adding a "was this locally killed" flag elsewhere.

**The reviewer's second suggestion — resolving the ended tab by `frame.id` through `managers.tab.harnessTabByPtyId` instead of `spawned.agentName` — does not hold up and is not applied.** `harnessTabByPtyId` (`src/tab/lookup.ts:55`) finds a tab by matching `tab.harness?.ptyId`, which is only ever populated for a harness process registered through `PseudoterminalManager.registerRemotePty` (`src/harness/manager.ts:230`, which sets `harness.ptyId` to the same id the spawn frame carries). A remote tab's persistent shell, spawned by `createRemoteShell` (`src/remote/shell-session.ts`) from `ShellManager.spawnFor` (`src/shell/manager.ts:79`), is never registered with `PseudoterminalManager` at all — `ShellManager` keeps its own `shells` map keyed by tab label, with no id-to-label registry a lookup by ptyId could consult. Switching `onSessionExit`'s tab resolution to `harnessTabByPtyId` would therefore find the harness case correctly but return `undefined` for every remote shell, silently breaking the very `endRemoteProcess(..., 'Remote shell')` case `src/remote/reattach.test.ts`'s `reports a terminated process with harness=false` case already pins. `spawned.agentName` is deliberately set to the tab label by both call sites (`registerRemotePty`'s `agentName: label` and `createRemoteShell`'s `agentName` parameter, passed as `label` from `ShellManager.spawnFor`) for exactly this reason, and stays the resolution mechanism for both cases.

## Proposed changes

- **`src/remote/channel.ts`** — in `send`, delete the id from `spawned` when the frame is a `kill`, as an `else if` beside the existing `if (frame.type === 'spawn') this.spawned.set(frame.id, frame);` line. `finish`'s `for (const id of this.spawned.keys()) this.send({ type: 'kill', id })` loop needs no snapshot: a `Map` iterator is specified to tolerate the currently-yielded key being deleted mid-iteration, which is exactly what `send`'s new deletion does, so the lint rule against an unnecessary array copy (`unicorn/no-useless-spread`) confirms this is already safe.

## Tests

- `src/remote/reattach.test.ts` — add a case beside the existing `it.each([true, false])('reports a terminated process with harness=%s and never recreates it', ...)` pair: spawn a process, send a `kill` for the same id, then deliver the matching `exit` frame, and assert `notify` is not called, `tab.sessionEnded` stays `undefined`, and the ssh transport is not killed (the channel stays open). Cover both the harness and the pipe-mode shell shapes the existing pair already parameterizes over, since the fix is in the shared `send`/`finish` path both go through.
- `src/shell/manager.test.ts` is unaffected — no changes there — and must keep passing, since it covers the respawn-after-kill contract from the local side, independent of what the remote side reports back.

## Out of scope

- The reviewer's `harnessTabByPtyId` resolution suggestion, for the reason stated above.
- Any change to how a genuine far-side termination (a refused reattach, a dead pid, an unrequested exit frame) is detected or reported — those paths are untouched.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
