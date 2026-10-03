# Publish the host-state fingerprint before delivering, and send a payload that survives the wire

**Complexity: 3/10** — two independent one-line fixes, each with a regression test, both found by driving the built app rather than by reading it.

**Goal.** Make `zsh` open a shell tab at all. Two defects stack behind the single symptom the app reported, `Tab plugin "shell" disabled: Maximum call stack size exceeded.`, plus a quieter second one the console showed as `[pageerror] Plugin intent "terminal-status" failed` on every mount.

## The two causes

**The host-state push re-enters itself.** `dispatch` in `src/plugins/host-state.ts` fetched `lastPushed.get(record) ?? new Map()`, recorded a tab's fingerprint into it, started `void deliver(...)`, and reached `lastPushed.set(record, pushed)` only after the loop. The shell plugin's `hostState` handler calls `capabilities.updateTab` synchronously; `updatePluginTab` emits `state: dirty` inline; `messageBus.emit` is synchronous. So the first delivery re-entered `dispatch` while the fresh map was still unpublished, the re-entrant pass built its own empty map, saw the tab as never pushed, and delivered again — for as long as the handler kept emitting. Publishing the map before the loop ends it.

**The payload-less intent never arrives.** `web/src/plugins/api.ts` sends `params: { tab, intent, payload }`, `web/src/rpc-exchange.ts` serializes with `JSON.stringify`, which drops a key whose value is `undefined`, and `isPluginIntentParams` in `src/client-params/plugin.ts` requires `Object.hasOwn(value, 'payload')`. So `terminal-status` — the one intent carrying no data — was refused before the plugin was asked, every mount. `isEmptyShellIntent` already accepts `null` as readily as `undefined`, so `null` is the same "nothing" and survives the wire.

**The manifest did not declare `terminalRunning`.** A capability an activation calls and its declaration omits is not refused at activation — `restrictToDeclared` replaces it with a stub that throws — so the status question failed, the failure crossed the failure boundary, and the plugin was disabled and its tab closed on the very first `zsh`. Nothing in the declaration was wrong, so no validation could see it. The manifest now declares it, and `src/plugins/declaration-validation.test.ts` reads the capabilities out of `activate.ts` and `open-tab.ts` and compares them against the declaration, so the two cannot drift again.

## Implementation

1. In `src/plugins/host-state.ts`, `lastPushed.set(record, pushed)` immediately after the map is obtained, before the delivery loop.
2. In `web/src/plugins/shell/ShellTab.tsx`, send `null` for `terminal-status`, and attach a rejection handler to that call and to `complete`. Both were unhandled, so a routine refusal became a console page error instead of anything actionable; both now report through `capabilities.reportFailure`, matching what the `dispatch` call already did.
3. In `src/plugins/shell/manifest.ts`, declare `terminalRunning`, and pin the whole relationship with a test.

## Tests

- `src/plugins/host-state.test.ts`: one `state: dirty` delivers exactly once when the plugin's own handler emits that signal inline. Reverting the fix makes this test fail with the same `RangeError: Maximum call stack size exceeded` the app reported.
- `web/src/plugins/shell/ShellTab.test.tsx`: the status question is asked with `null`; a request built from that call still has a `payload` key after a JSON round trip; a refused status question reports a failure rather than rejecting unhandled.
- `src/plugins/declaration-validation.test.ts`: every capability `activate.ts` and `open-tab.ts` reach for is declared, and `terminalRunning` specifically is.

## Out of scope

- Relaxing `isPluginIntentParams`. An absent key and a dropped one are the same thing on that wire, and the plugin side already accepts both shapes — so the client sends the shape that survives rather than the transport growing a sentinel.
- Bounding `hostState` delivery's own concurrency. The re-entrancy was unbounded because the fingerprint was invisible, not because delivery is concurrent.
- The `dispatch` rejection handler, added earlier in this series. It is already covered and unchanged.