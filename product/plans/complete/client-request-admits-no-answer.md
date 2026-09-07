# Make the web client's request result express the answer it can actually return

**Complexity: 5/10** — one return type widens, the compiler names every call site that was reading through it, and five of them gain an explicit branch. One transport file, five callers, and their tests; no server change, no wire change, no change to when the promise settles.

## Goal

Stop five call sites reading fields off a value the type promised was there, so a batch move answered by a dead socket opens its dialog or gives up cleanly instead of throwing, and the two loading overlays stop spinning forever.

## Approach

`JanusClient.request<T>` is declared `Promise<T>` and resolves `undefined` in two situations: the socket is not `OPEN`, and the reply carried an error, since its pending callback is `(r) => resolve(r as T)` and discards `error` while resolving the absent `result`. The declaration is simply wrong about what the method returns.

Widen it to `Promise<T | undefined>` and let the compiler find the callers. Four already defend against it and need no change — `plugins/api.ts`, `useFileNavigatorOpener.ts`, `useSelectionAction.ts`, and both requests in `useEditorSuggest.ts`. Five do not, and each gets the branch its own surface needs rather than a shared fallback, because what to show for "no answer" is a question about that surface:

- The batch move, the paste, and the undo/redo history request clear any pending conflict and leave the tree untouched. Nothing moved, and there is no conflict report to act on, so the dialog goes away and the tree stands as it was — where today `'conflictPaths' in result` throws mid-`.then` and the overwrite dialog silently never opens.
- The file-search pop-up and the quick-open palette clear their own loading flag and show an empty result. A spinner that never resolves leaves the overlay stuck with no way back except reopening it; an empty list says plainly that there is nothing to pick.
- Tab completion, which the compiler found and the item did not list, leaves the line exactly as the user typed it. `handleTabCompletion` read `res.newInput` off the result, so the widened type reaches it through `CommandInput`'s `complete` prop and the two agent-tab bodies that supply it.

This is about the type and the call sites, not about when the promise settles. The pending-request drain that already landed keeps `request()`'s unavailable value exactly as it is, so the two compose rather than conflict: that one made a lost connection settle, this one makes what it settles with something callers must handle.

## Implementation steps

1. In `web/src/ws.ts`, change `request<T>`'s return type to `Promise<T | undefined>` and resolve a plain `undefined` for the not-open case in place of the `undefined as T` cast.
2. In `web/src/file-navigator/useFileNavigatorMoveOperations.ts`, give `sendBatchMove` and `history` an unavailable branch that clears the pending conflict and returns. The `retry` history request reads no fields off its result and needs no change.
3. In `web/src/file-navigator/useFileNavigatorPaste.ts`, give `sendPaste` the same branch, returning before the clipboard is cleared — nothing was pasted, so a cut's clipboard must survive.
4. In `web/src/file-navigator/useFileNavigatorSearch.ts`, fall back to an empty path list and clear the loading flag either way.
5. In `web/src/pickers/useQuickOpen.ts`, fall back to an empty root and path list and clear the loading flag either way.
6. Widen the `complete` prop on `web/src/agent-tabs/command-input/CommandInput.tsx` and the matching parameter of `handleTabCompletion` in `command-completion.ts`, and have the latter clear its dropdown and return without touching the input when there is no result. The two agent-tab bodies pass `client.request` straight through and need no change once the prop widens.

## Tests

- `web/src/ws.test.ts` already covers a request started on an already-closed socket; no change needed beyond it continuing to pass against the widened type.
- `web/src/file-navigator/useFileNavigatorMoveOperations.test.ts` and `web/src/file-navigator/useFileNavigatorPaste.test.ts` exercise the success and conflict paths and must keep passing. Add an undefined-reply case to each: no throw, no pending conflict, and for the paste, a cut clipboard left intact.
- `web/src/pickers/useQuickOpen.test.ts` covers the success path; add an undefined-reply case asserting the loading flag clears and the result list is empty.
- `web/src/file-navigator/useFileNavigatorSearch.ts` has no colocated test at all. Add one covering the success path and the undefined-reply branch together, so the new branch is not the only thing the file's first test pins, alongside close, reveal, and the deferred selection its reveal depends on.
- `web/src/agent-tabs/command-input/command-completion.test.ts` — an undefined result clears the dropdown, leaves the input untouched, and schedules no cursor move.

## Spec updates

`product/specs/websocket-rpc.md` — the section on requests outstanding when the connection ends already says a caller shows whatever it shows for an unavailable answer. Extend it to say what these callers do: a file-navigator mutation leaves the tree untouched and raises no dialog, and a loading overlay finishes empty rather than spinning.

## Docs

None. `documentation/user-documentation/command-bar/quick-open.md` describes the `Searching…` state shown while the file list loads, which is unchanged — what it does not describe is what happens when no reply arrives, and the file-navigator and tab-completion pages describe neither. `help.md` covers the commands, not their failure behavior.

## Out of scope

- `saveFile`, which has its own error-carrying signature and is unchanged.
- When the promise settles, which the pending-request drain already owns.
- Reporting the discarded reply error to the caller, which would be a wider change to the callback shape.
