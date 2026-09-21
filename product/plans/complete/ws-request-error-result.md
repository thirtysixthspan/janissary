# Let the websocket client's request method carry the server's error back to its caller

**Complexity: 7/10** — the change to `JanusClient.request` itself is small and mechanical, but its
return shape is a public contract read by a wide, verified fan-out: thirteen production files (the
backlog entry names eight of them; reading every call site found five more it missed —
`useFileNavigatorPaste.ts`, `plugins/api.ts`, `remote-session-control.ts`, and the two agent-tab
bodies) and roughly ten test files, several of which (`DefaultContextMenu.test.tsx` alone) construct
a client mock inline in a dozen-plus places. No new architecture and no behavior change — the risk is
entirely in coverage: missing a call site would not fail typechecking (every mock is cast `as
JanusClient`/`as never`), it would fail silently at the assertion inside whichever test exercises it,
or worse, at runtime in production.

`JanusClient.request<T>` in `web/src/ws.ts` resolves `T | undefined`, collapsing three different
outcomes — the socket was never open, the connection ended before a reply arrived, and the server
replied with an error — into the one value every caller already treats as "no answer". `saveFile`,
directly below `request`, exists purely to read the error `request` throws away, duplicating the
`readyState` check, the `pending.set`, and the `dispatch` call to do it.

## Goal

`request<T>` resolves a discriminated result, `{ ok: true; value: T } | { ok: false; error?: string }`
— `error` absent only for a socket that was never open, present (the shared `CONNECTION_ENDED`
constant) for one that closed mid-flight, and present with the server's own text for a request the
server refused. `saveFile` is re-expressed as a call to `request`, deleting its duplicated body. Every
call site converts from checking result truthiness to checking `result.ok`, preserving its **current**
no-result behavior exactly — this change does not add error reporting to any surface that has nowhere
to put it, per the backlog entry's own instruction that deciding that per site is separate work. No
wire shape changes and no user-observable behavior changes anywhere.

## Approach

1. **`web/src/ws.ts`**: define `type RequestResult<T> = { ok: true; value: T } | { ok: false; error?: string }`. Change `request<T>` to resolve `{ ok: false }` immediately when the socket is not open, and otherwise register a pending callback that resolves `{ ok: true, value: r as T }` when `error` is undefined and `{ ok: false, error }` otherwise. Re-express `saveFile` as `const result = await this.request<unknown>(...); return result.ok ? undefined : (result.error ?? 'not connected')` — `'not connected'` is what a socket that was never open must still report, since `saveFile`'s contract (unlike `request`'s) always needs a string for that case.

2. **Convert every real call site**, keeping each one's current no-result behavior:
   - `web/src/file-navigator/useFileNavigatorMoveOperations.ts` (`sendBatchMove`, `history`)
   - `web/src/file-navigator/useFileNavigatorPaste.ts` (`sendPaste`) — reads the same
     `'conflictPaths' in result` shape as `sendBatchMove`; the backlog entry's site list missed this
     file, but it has the identical bug it describes.
   - `web/src/file-navigator/useSelectionAction.ts` (`query`)
   - `web/src/file-navigator/useFileNavigatorOpener.ts` (`open`, `openWith`)
   - `web/src/file-navigator/useFileNavigatorSearch.ts` (`openSearch`)
   - `web/src/pickers/useQuickOpen.ts` (`openQuickOpen`)
   - `web/src/editor/useEditorSuggest.ts` (the persona-list effect, `fireOnLine`)
   - `web/src/context-menu/useDefaultContextMenu.ts` (`onContextMenu`, `onKeyDown`)
   - `web/src/shared/remote-session-control.ts` (`raise`) — resolves a plain boolean; `result.ok &&
     result.value === true` reproduces today's `=== true` exactly for every outcome.
   - `web/src/plugins/api.ts` (`intent`) — keeps its current generic thrown message
     (`Plugin intent "${name}" failed`) rather than surfacing `result.error`; adding new diagnostic
     text is exactly the "adding it blindly" the entry warns against; a separate item can decide that.
   - `web/src/agent-tabs/AgentTabBody.tsx` and `InactiveAgentTabBody.tsx` — both pass
     `client.request(...)` directly as `CommandInput`'s `complete` prop, typed
     `(text: string, cursor: number) => Promise<CompletionResult | undefined>`. Adapt at the call site
     — `.then((r) => (r.ok ? r.value : undefined))` — rather than touching `CommandInput`'s contract,
     which nothing else in this change affects.

3. **Update every test file whose mock resolves a raw value or `undefined` in place of the new
   shape**, wrapping success as `{ ok: true, value: ... }` and today's "no answer" as `{ ok: false }`:
   `ws.test.ts`, `useFileNavigatorMoveOperations.test.ts`, `useFileNavigatorPaste.test.ts`,
   `useSelectionAction.test.ts`, `useFileNavigatorSearch.test.ts`, `useQuickOpen.test.ts`,
   `useEditorSuggest.test.ts`, `DefaultContextMenu.test.tsx`, `plugins/api.test.ts`,
   `InactiveAgentTabBody.test.tsx`. None of these files' assertions about **behavior** change — only
   the literal shape their mocks resolve.

4. **Run the full `web/src` test suite** (`npx vitest run web/src`), not only the diff-scoped one —
   several of the affected test files do not touch the same source files `check-diff` scopes against,
   so a full run is the only way to be sure no mock was missed.

## Implementation steps

1. `web/src/ws.ts`: add `RequestResult<T>`, change `request<T>`'s signature and body, re-express `saveFile`.
2. Convert the thirteen call sites listed above, one file at a time, running `check-diff` after each.
3. Update the ten test files' mocks to the new shape.
4. Run `npx vitest run web/src` and fix anything `check-diff`'s narrower scope did not already catch.

## Tests

No new test cases — this changes no observable behavior. The existing suite, updated to the new mock
shape, is the verification that every call site's current behavior survived the conversion:
`ws.test.ts`'s `request`/`saveFile`/reconnection cases, and every hook/component test file listed above.

## Out of scope

- Adding error-surfacing UI to any call site that has none today (file navigator conflict dialogs,
  quick-open, editor suggest, the default context menu, `plugins/api.ts`'s `intent`). Each is a
  separate, deliberate per-site decision the backlog entry itself declines to make in bulk.
- `CommandInput.tsx`'s `complete` prop contract, or anything else downstream of the two agent-tab
  bodies' adapters.
- The wire protocol or anything server-side (`src/message-handler.ts`'s `errorText` reply shape is
  already correct and unchanged).
