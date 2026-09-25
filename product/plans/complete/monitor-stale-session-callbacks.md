# Ignore prompt callbacks from a monitor session that was stopped or replaced

## Complexity

3/10. The change is confined to `MonitorManager` in `src/monitor/manager.ts`, plus a size-limit extraction into `src/monitor/framing.ts`, a comment in `src/acp/index.ts`, and new test cases. No wire, protocol, or spec-visible command changes.

## Goal

The local ACP session from `connectAcp` in `src/acp/index.ts` still delivers a pending prompt's `onEnd`/`onError` after `kill()`, which suppresses only the connection-level exit report. The remote session in `src/remote/acp-session.ts` detaches its handlers on `kill()` instead. The monitor's flush and ask callbacks act on whatever answers without checking that the monitor is still registered or still on that session.

So stopping a monitor while a prompt is in flight kills the process, the prompt rejects, and the flush's error handler respawns a fresh ACP subprocess that is no longer in the monitor registry. Neither `closeAll` nor `dispose` ever kills it. A late `onEnd` instead delivers a suggestion that re-opens the reporting tab the stop just closed. A context reset in the middle of a flush respawns twice, because the old session's rejected prompt respawns again after the reset already did.

After this change a callback from a session the monitor has stopped or replaced does nothing, and a respawn only happens for a monitor that is still registered and still on the session whose prompt failed.

## Approach

- Add a private `isCurrent(reg, session)` check on `MonitorManager`: the registration is still the one stored under `${owner}:${name}` in `this.monitors`, and `reg.session` is still `session`.
- `respawn(reg, session = reg.session)` returns without doing anything unless `isCurrent(reg, session)`. `resetContext` keeps calling it with the current session, so it behaves exactly as today.
- `flush` captures `const session = reg.session` before prompting. Both `onEnd` and `onError` return immediately when `!isCurrent(reg, session)`: no `recordReply`, no `deliver`, no "restarting monitor session" line, no rate-limit notification, no respawn.
- A stale `onEnd` does not clear `inFlight` either. When the monitor was stopped the flag is moot; when the session was replaced, the replacement's priming prompt owns the slot and clearing it would let a flush interleave with priming. This departs slightly from the backlog proposal, which cleared the flag before returning.
- `ask` captures `reg.session` before calling `askMonitor` and passes `() => this.respawn(reg, session)` as `onRespawn`. `askMonitor` in `src/monitor/ask.ts` is unchanged: its `finishRunning` calls stay unconditional, because they close the owner tab's running entry and rely on the local session still reporting after a kill.
- Add a comment beside `connectAcp`'s `kill` stating that pending prompt handlers still fire after it, unlike `src/remote/acp-session.ts`.

Rejected: making the local `kill()` detach its handlers like the remote one. That would stop `askMonitor`'s running entry from ever finishing after a stop and would change the contract for every other local ACP consumer; aligning the two `kill()` contracts is a separate change.

## Implementation steps

1. `src/monitor/manager.ts`: add `isCurrent`, guard `respawn`, capture the session in `flush` and guard both callbacks, and bind the captured session into `ask`'s `onRespawn`.
2. `src/acp/index.ts`: add the comment beside `kill`.
3. The guards push `src/monitor/manager.ts` one line past the 200-line `max-lines` limit. Extract the flush's prompt construction (framing every buffered entry and joining them under the `[Monitor update]` header) into `frameUpdatePrompt(batch, delimiter)` in `src/monitor/framing.ts`, which already owns `frameEntry`. The prompt text does not change.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/monitor/manager.test.ts`: a flush is in flight, the monitor is stopped, then the old session's prompt fails; no second session is spawned and no "restarting monitor session" line is appended.
- `src/monitor/manager.test.ts`: an external monitor's flush is in flight, the monitor is stopped (closing its reporting tab), then the old session replies with a suggestion; the reporting tab is not recreated.
- `src/monitor/manager.test.ts`: a flush is in flight, `resetContext` respawns, then the old session's prompt fails; exactly two sessions exist and the replacement is not killed.
- `src/monitor/manager.test.ts`: an ask is in flight, the monitor is stopped, then the ask's error arrives; no second session is spawned, and the owner tab's running entry is still finished with the error line.
- `src/monitor/ask.test.ts`: an ask whose error arrives later still finishes the running entry and defers the respawn decision to `onRespawn`.
- `src/monitor/framing.test.ts`: `frameUpdatePrompt` frames each entry in order under the update header, separated by a blank line.

## Out of scope

- Aligning the local and remote `kill()` contracts.
- A stale priming callback in `primeMonitorSession` (`src/monitor/session.ts`) clearing `inFlight` during the replacement's priming.
- The missing cancellation in `runAcpToolLoop` (`src/acp/loop.ts`), which keeps issuing turns after a close; that is a separate item.
- `stopMonitor` in `src/monitor/stop.ts` and `respawnMonitorSession` in `src/monitor/session.ts` stay unchanged.

## Documentation and specification impact

`product/specs/monitoring.md` gains a sentence in the stopping section: a reply or error that arrives from a session after its monitor was stopped or its session replaced is ignored, so it neither restarts the session nor delivers a suggestion. `help.md` and `documentation/user-documentation/` do not describe this and are left alone.
