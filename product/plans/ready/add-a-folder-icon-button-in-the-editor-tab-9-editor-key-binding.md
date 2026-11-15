# Editor reveal key binding

**Complexity: 4/10** — ~14 added lines across 3 files, 7 requirements, 11 test scenarios (p=5.16). One table entry and one interception branch, but the branch must claim the chord without touching the buffer or the undo stack, and the callback it calls must already be bound above the hook call site.

## Goal

Bind Cmd+Shift+E in an editor buffer to exactly what the reveal button does, while Ctrl+Shift+E keeps its existing meaning of extending the selection to the end of the line. The chord is claimed by the editor, never reaches the buffer's action applier, and sends nothing while the button is blocked.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-8-editor-reveal-button` for the sender and the callback bound in `EditorTab`; `08` in turn depends on `add-a-folder-icon-button-in-the-editor-tab-1-reveal-target-and-blocked-state` for the `EditorView.revealBlocked` payload and `add-a-folder-icon-button-in-the-editor-tab-5-reveal-rpc` for the request it sends. All three must have landed first: without them there is no `sendRevealInFileNavigator` to call and no `revealBlocked` for it to read, so `reveal()` would not typecheck. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; this is its "Key binding", "Key dispatch", and single-entry-point decisions.

- `KeyAction` (`web/src/editor/keys.ts:10`, the union ending with `{ kind: 'cut' }` at `:30`) gains `{ kind: 'revealInNavigator' }` beside `find` and `save`. It is a symbolic action like those two, not a text insert. No other module switches exhaustively on `KeyAction`: `applyKeyAction` (`web/src/editor/applyKeyAction.ts:123`) falls through both of its switches to a no-op for an unknown kind, so the new member needs no case there.
- `metaAction` (`web/src/editor/keys.ts:36`) gains a case for `'e'` that returns `{ kind: 'revealInNavigator' }` when `e.shiftKey` is held, and `null` otherwise. Cmd+E stays exactly as unbound as it is today: `actionForKey` returns null, nothing calls `preventDefault`, and the browser keeps whatever Cmd+E it already has. `actionForKey` (`:114`) returns null for any `altKey` before reaching `metaAction` (`:115`), so Alt+Shift+E is unbound and needs no case of its own.
- The chord sits on the Cmd (meta) modifier with no platform check, exactly like every other `metaAction` entry, because the table targets macOS conventions throughout (`keys.ts:6`). Nothing else claims it: `APP_CHORDS` in `web/src/shared/app-chords.ts:37` has no `meta+shift+e` entry, and the window handler only acts on that table (`useWindowKeys.ts:126`). The documented binding is macOS, and outside macOS the button is the guaranteed route; no separate platform gate is added here.
- `ctrlAction` (`web/src/editor/keys.ts:56`) is not touched. Its `'e'` case (`:60`) still returns `{ kind: 'lineEdge', edge: 'end', extend: e.shiftKey }`, so Ctrl+Shift+E still extends the selection to the line end. That is the source plan's explicit reason for choosing the meta chord.
- `useEditorInteractions` takes one more input, `reveal: () => void`: add it to `InteractionApis` (`web/src/editor/useEditorInteractions.ts:18`, beside `pluginKey`), add it to the destructured parameters (`:58`), and pass it at the hook's only call site (`web/src/editor/EditorTab.tsx:88`). It is a callback, not a ref or an API object, so it does not belong in `InteractionRefs`.
- The bound callback already sits above that call site: `08` places the single reveal `useCallback` above the `useEditorInteractions` call at `EditorTab.tsx:88`, so this subplan passes that same value as `reveal` and to `EditorMetaRow`'s `onReveal`. Do not move it below `:88` and do not add a second binding. Do not reach for the `saveRef` indirection (`:60`): that exists because the save callback closes over a hook that itself takes the callback, which is not the case here.
- The new branch goes inside `claimKey` immediately after the `find` branch (`useEditorInteractions.ts:91`, `if (action.kind === 'find')`) and before `api.apply` (`:99`): call `reveal()` and return `true`. Copy nothing else from the find branch — no `api.sealUndo()` (`:93`), no `collapseSelection` (`:94`), no state change. A click on the button leaves the carets, the selection, and the undo stack exactly as they were, so the chord must too.
- It never reaches `api.apply` or `applyKeyAction`, so it records no undo step, moves no cursor, and leaves the buffer untouched. It sends even while the buffer is still loading (`state === null`); a click has no such guard either, and `revealBlocked` is the button's only disabled condition.
- `claimKey`'s caller `onKeyDown` stops propagation for every claimed key (`useEditorInteractions.ts:110`), so the window-level key handler never sees the chord. `handleSuggestKeyDown` runs first in `claimKey` (`:74`), so three existing suppressions cover it with no new handling: a pending suggestion swallows every key (`handleSuggestKeyDown.ts:112`); the persona query line routes every bound key to its own surface (`handleSuggestKeyDown.ts:62`, `const action = actionForKey(e)`), where `revealInNavigator` is a no-op; and an open overlay returns early after preventing the default for a bound key (`useEditorInteractions.ts:105`). The chord is therefore inert in all three states, with no new handling in any of them.
- `yieldsToPlugins` (`web/src/editor/keys.ts:105`) returns false whenever a meta or ctrl modifier is held (`:106`), so the chord is never offered to an editor plugin.
- The sender's own guard makes the chord inert while the button is disabled: `reveal()` returns before sending, and the key is still claimed and prevented, so it does not type an `e`, extend a selection, or fall through to the window.
- Key repeat re-fires the sender, as Cmd+F (`find`) and Cmd+S (`save`) already do. No debounce or repeat guard is added: a held chord re-reveals the same file under a fresh hint revision, which the server path already produces.
- File size: `EditorTab.tsx` is 217 raw lines, 174 counted by `max-lines` today. `08` adds about six counted lines and states it extracts nothing; this subplan adds one prop pass at `:88`, leaving roughly 181 counted, so it extracts nothing either. If the two land together and the count crosses 200, use `08`'s named extraction — the metadata-row callback bindings into a small colocated hook or module in `web/src/editor/`, per `ai/guidelines/code-guidelines.md` — and never compact the file or strip comments.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Editor key table | `web/src/editor/keys.ts` (`KeyAction` line 10, `metaAction` line 36, `ctrlAction` line 56) | One action and one meta case. |
| Find interception | `web/src/editor/useEditorInteractions.ts:91` (`if (action.kind === 'find')`) | The model for the new branch — and the one thing not to copy (`api.sealUndo`). |
| Claim and propagation | `useEditorInteractions.ts:73` (`claimKey`), `:110` (`stopPropagation`) | Reused unchanged. |
| Suggest and overlay suppression | `useEditorInteractions.ts:74` (`handleSuggestKeyDown`), `:105` (overlay early return); `handleSuggestKeyDown.ts:62` (`handleQueryEdit`) | Inherited, no new code. |
| Sender and bound callback | `web/src/editor/editor-file-commands.ts` (`sendRevealInFileNavigator`), `web/src/editor/EditorTab.tsx` (`onReveal` binding), both from `08` | Passed in as `reveal`. |
| Editor action applier | `web/src/editor/applyKeyAction.ts:123` (`applyKeyAction`, whose `default` branches are no-ops) | Why the new `KeyAction` member needs no case there. |
| Key tests | `web/src/editor/keys.test.ts` (`maps the Cmd app chords`, `:38`) | New cases beside the existing table tests. |
| Editor integration tests | `web/src/editor/EditorTab.test.tsx`, `web/src/editor/EditorTab.window-keys.test.tsx` | New chord cases and a propagation check. |

## Proposed changes

- Add the `revealInNavigator` member to `KeyAction` and the `'e'` case to `metaAction`; leave `ctrlAction` alone.
- Add the `reveal` input to `useEditorInteractions` (the `InteractionApis` type and the destructured parameters) and the interception branch in `claimKey` beside the `find` branch.
- Move `08`'s bound reveal callback above the `useEditorInteractions` call and pass it in there as well as to `EditorMetaRow`. Do not call the sender from the key table; it stays pure.
- Add no new module, no new hook, and no `APP_CHORDS` entry.

## Tests

In `web/src/editor/keys.test.ts`:

- In `maps the Cmd app chords` (`:38`): meta+shift `e` maps to `{ kind: 'revealInNavigator' }`, and meta `e` with no shift maps to null.
- In `maps the Emacs-style Ctrl subset` (`:22`): Ctrl+Shift+E still maps to `{ kind: 'lineEdge', edge: 'end', extend: true }`. The existing Ctrl+E line (`:24`) stays and covers the non-extending case.
- In the Alt guard case (`:59`, the assertion that alt+`x` is null): add that alt+shift `e` is null too.
- In `yields nothing else, whatever the selection is` (`:90`): add the meta+shift+E chord to the loop, so a future yield rule cannot silently cover it.

In `web/src/editor/EditorTab.test.tsx`:

- Cmd+Shift+E sends `revealInFileNavigator` with the editor tab's label. Dispatch the chord on the textarea and assert `client.send` was called with `{ method: 'revealInFileNavigator', params: { label: 'notes' } }` — `makeTab`'s label, with `client.send` the fake at `:53` and `:1024` the fire-and-forget assertion pattern.
- The chord adds no undo step and seals nothing: type `x`, press the chord, type `y`, then one Cmd+Z, and the buffer is back to the loaded `line one\nline two` fixture (the `screen.queryByText` pattern at `:704`). If the chord had sealed the typing group or recorded a step, that single undo would leave `x` behind. Also assert the visible row text is unchanged immediately after the chord.
- While the button is blocked (`makeView({ revealBlocked: 'unsaved' })`), Cmd+Shift+E sends nothing and still types no `e`; the row text is unchanged.
- Ctrl+Shift+E extends the selection to the line end and sends no RPC. The mapping cases above cover the table; this one proves the buffer behavior and that the chord did not become reveal.
- While the persona query line holds focus (the `openAndType` helper, `:1034`), Cmd+Shift+E sends nothing and leaves the query text unchanged — the inherited suppression above, pinned once.

In `web/src/editor/EditorTab.window-keys.test.tsx`, add a Cmd+Shift+E row (meta and shift held) to the existing `keeps %s, which the buffer binds, from the window key handler` table (`:76`), beside `Ctrl+E`. That is the whole case; the file's harness already registers the window listener.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project client web/src/editor/keys.test.ts web/src/editor/EditorTab.test.tsx web/src/editor/EditorTab.window-keys.test.tsx`. Then, manually in a buffer: Cmd+Shift+E reveals the file exactly as the button does; Ctrl+Shift+E still selects to the line end; Cmd+E does nothing and reveals nothing; with a navigator already open on the file, the chord selects it without changing the buffer's text, caret, selection, or undo. Read the diff to confirm `ctrlAction` and `handleSuggestKeyDown.ts` are untouched, `api.sealUndo` does not appear in the new branch, and `EditorTab` has one reveal `useCallback`, above the `useEditorInteractions` call.

## Out of scope

- No command, no context-menu entry, and no binding outside the editor buffer.
- No key binding outside macOS in the documentation; the table's existing meta convention is reused without a platform check.
- No change to Ctrl+Shift+E, the find chord, the plugin yield rules, or the suggest and overlay suppression — including `handleSuggestKeyDown.ts`, which stays as it is even though it makes the chord inert while the query line has focus.
- No `APP_CHORDS` entry: `meta+shift+e` is not an application chord, and no window handler or overlay-plugin chord uses it today.
- No repeat guard or debounce on the chord.
- No help or documentation text; `12` adds it.
- No server change.
