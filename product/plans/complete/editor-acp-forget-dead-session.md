# Forget an editor persona's ACP session when its agent dies

**Complexity: 3/10**: one manager gains a per-key hook map and a death handler, and the suggestion handler's connection-level hook learns to report a death that arrives after its request settled. No wire change and no new architecture.

`EditorAcpManager.session` in `src/editor/acp-manager.ts` calls `spawnMonitorSession(persona, cwd, { onError: hooks.onError })` once per `${label}:${persona}` key and ignores the `hooks` every later call passes. That connection-level `onError` is what `connectAcp` (`src/acp/index.ts`) fires on a spawn failure and on `ACP agent exited.`, so it only ever reaches the first request's `finish` in `editorSuggest` (`src/editor-suggest/handler.ts`), which has long since settled. The dead session is never removed from the manager's maps, so every later `>persona` request in that tab reuses it, its prompt never returns, the query pill stays on `running...`, and the connections window keeps listing a connection that is gone.

`AcpManager.run` in `src/acp/manager.ts` already handles the same signal correctly: its `onError` reports the message and calls `this.close(label)`, so the next prompt spawns a fresh session.

## Goal

A persona session whose agent dies (or fails to start) is forgotten at once: its session, persona, recorded exchange, and hook entries are dropped, its connection row disappears, and the next request to that persona in that tab spawns and re-primes a fresh session. The death is reported to whichever request is pending, or as one notification when no request is pending.

## Approach

1. **`src/editor/acp-manager.ts`**
   - Add `private hooks = new Map<string, SessionHooks>()`. Every `session()` call stores the caller's hooks under the key, whether or not it spawns, so the newest request is always the one a death reaches.
   - The manager owns the connection-level handler it passes to `spawnMonitorSession`. The handler captures the spawned session and acts only while that same session is still the one stored under the key, so a late error from a session that was already replaced or closed can never drop its successor.
   - On a death, the handler deletes the key's session, persona, context, and hook entries without calling `kill` (the process is already gone), emits `messageBus.emit('state', { type: 'dirty' })` so the connection row disappears, and then calls the latest hook with the message.
   - `close`, `closeTab`, and `dispose` also drop the hook entries, so a closed key keeps no stale request callback. A deliberate `kill` already suppresses `connectAcp`'s exit report.
2. **`src/editor-suggest/handler.ts`**
   - `finish` records whether the request settled with a failure.
   - The connection-level hook passed to `session()` settles the request with the message when it is still pending. When the request already settled successfully, it posts the same `editor-suggest` notification (`<persona>: <message>`) instead, so a death between requests is reported once. When the request already settled with a failure, it posts nothing, because a death during a request can fire both the prompt-level and the connection-level error in either order and the user should see one report, not two.
   - The prompt-level `onError` is unchanged.

### Rejected alternatives

- Routing every request's own hook into `connectAcp` by respawning or rewiring the session per request. `AcpSession` has no way to swap its connection hook, and the manager is the natural owner of a connection-level event anyway, as `AcpManager` shows.
- Killing the session on any prompt-level error. A session that merely failed one prompt (a rate limit, say) should keep its accumulated conversation, which is the existing documented behavior.

## Implementation steps

1. Add the hook map and the death handler to `EditorAcpManager`, and clear hook entries on close, closeTab, and dispose.
2. Teach `editorSuggest`'s connection-level hook to notify after a successful settle and stay quiet after a failed one.
3. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/editor/acp-manager.test.ts`:
  - firing the spawn hook's `onError` drops the session: `hasSession` is false, `connectionsFor` is empty, the transcript is empty, `kill` is not called, a `state` `dirty` event is emitted, and a second `session()` spawns again;
  - the error reaches the hook from the latest `session()` call, not the first;
  - a late error from a session that was already closed and replaced leaves the replacement in place and calls no hook.
- `src/editor-suggest/handler.test.ts`:
  - a connection error after a successful request posts one `editor-suggest` notification naming the persona and message, and does not call the callback again;
  - a connection error after the request already failed with a prompt error posts no second notification;
  - a death between two requests through the real `EditorAcpManager` makes the next request spawn a fresh session and prime it with the persona body again.
- The existing prompt and notification shape cases in `src/editor-suggest/handler.test.ts` stay unchanged and passing.

## Spec updates

- `product/specs/editor-tab.md`: "In-editor persona suggestions" says that a persona connection whose agent exits or fails to start is dropped from the connections window and reported, and that the next request to that persona starts a fresh connection primed from the top.
- `product/specs/connection.md`: the editor-tab persona connection paragraph notes that a connection whose agent dies disappears from the window on its own.

## Documentation

- `documentation/user-documentation/tab-types/editor-persona-query.md` currently says the connection "stays open for the rest of the tab's life"; qualify that the connection is dropped and reported if the persona's agent exits, and the next request starts over.

## Out of scope

- A death that happens while the tab's latest request had already failed with a prompt-level error is not reported a second time; the next request still spawns a fresh session.
- `MonitorManager`'s own monitor sessions, which already handle their connection errors separately.
