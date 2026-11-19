# Model search 6: Return and Escape in the search input, and the plugin re-export

**Complexity: 5/10** — ~40 added lines, 4 files edited, 7 requirements, 15 test scenarios (p=5.61)

Run order: 6 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-4-search-input.md` (`useModelSearch`, `ModelSearchInput`, `ModelSearchInput.test.tsx`) and `product/plans/ready/roles-model-search-input-5-tab-and-arrows.md` (`handleModelSearchKey` in `model-search-keys.ts`, the hook's `onKeyDown`). It must land after both, and after subplans 1 to 3 that they depend on: none of `web/src/shared/model-search/` exists until they do.

This step finishes the shared search input's keys. Return accepts the highlighted candidate, and Escape closes the dropdown before the host's own key handler hears it. Keys the input doesn't consume reach its host, through a new `onSubmit` for Return and by bubbling for Escape. A new `onListChange` reports the dropdown's state for the New harness dialog, whose capture-phase keyboard listener runs before the input's. It also publishes the component to client plugins through `web/src/plugins/api.ts`, the way the `sql` and `models` plugins already reach `InlineEditInput` and `ConfirmDialog` (`web/src/plugins/sql/CellEditor.tsx`, `web/src/plugins/models/ModelsTab.tsx`, both `from '../api'`). No host mounts the input yet.

## Goal

Add Return and Escape to `model-search-keys.ts`, add the `onSubmit` and `onListChange` props to `ModelSearchInput` (plumbed through `useModelSearch`), re-export `ModelSearchInput` from `web/src/plugins/api.ts`, and add the remaining keyboard cases to `ModelSearchInput.test.tsx`.

## Design decisions

All of these come from the source plan, except the ones marked "decision for this subplan", which pin down mechanics the source plan left open.

- **Return accepts (user decision).** With the dropdown open and a row highlighted, Return fills that row's id through `onChangeText`, closes the dropdown, and stops the event (`preventDefault` and `stopPropagation`). `onSubmit` isn't called. In every other state, whether the dropdown is closed or open with nothing highlighted, the dispatch neither prevents nor stops the event, and `onSubmit` is called when the host passed one.
  - A highlighted row always consumes Return, even when the text already equals that row's id (decision for this subplan, matching subplan 8's "Return with a highlighted row fills the id and sends nothing. A second Return sends `add-entry`"). Don't short-circuit to `onSubmit` in that case.
  - Since subplan 4 keeps `highlighted` null while the dropdown is closed, "a row is highlighted" alone decides the branch.
  - The fill goes through the same path as a click: the hook's `onPick` with the highlighted row's id, so the text, the close, and the override reset behave exactly as a click does (subplan 4).
- **`onSubmit` is the roles picker's.** Only the roles picker passes it (subplan 8), so Return-to-add fires from the model input alone and never from the harness select, the effort select, or the Add and Cancel buttons, whose own Return already clicks them. `onSubmit` takes no arguments and is called synchronously from the input's keydown, before the event bubbles on. The New harness dialog passes none: its Return is read by `useLaunchDialog`'s capture-phase listener (subplans 10 and 11).
- **Escape closes the dropdown first (user decision).** With the dropdown open, Escape closes it through the hook's one close path (subplan 5's `close()` action), keeping the text and focus in the input, and stops the event (`preventDefault` and `stopPropagation`). With the dropdown closed the dispatch neither prevents nor stops it, so it bubbles on to the host's handler: the roles picker's container `onKeyDown` (`handleKeyDown` in `web/src/plugins/roles/EntryPicker.tsx`, which cancels on any Escape it sees; subplan 7), or nothing more in the New harness dialog, whose capture listener already decided before the input saw the key (subplan 11). This matches the command bar, where Escape closes the completion picker without changing the line (`product/specs/tab-completion.md`).
  - React's `stopPropagation` stops only the bubble path: the React ancestors' `onKeyDown` and window bubble listeners. It can't stop a window capture listener such as `useDialogKeyboard`'s (`web/src/shared/useDialogKeyboard.ts`), which is why the dialog needs `onListChange` and subplan 10's `yieldsKey`.
  - After Escape the input stays focused with the dropdown closed. Typing (subplan 4), a Tab completion, or an arrow (subplan 5) reopens it.
- **Guards for Return and Escape (decision for this subplan).** Return and Escape during an IME composition (`event.nativeEvent.isComposing` true) pass through untouched: no state change, no `preventDefault`, no `stopPropagation`, and no `onSubmit`, so the Return that confirms a composition never accepts a row or adds an entry. Held modifiers are not checked for these two keys: Shift+Return and Shift+Escape act like the plain keys. This keeps the input in step with subplan 11's `yieldsKey` ("the model dropdown is open, and the key is Escape, or the key is Enter with a row highlighted"), which reads no modifiers. If subplan 5 placed its modifier check at the top of `handleModelSearchKey`, move it into the Tab and arrow helpers so it stays theirs, and keep the composition check common to all four keys.
- **Where the code goes (decision for this subplan).** `handleModelSearchKey` gains two module-private helpers, one for Return and one for Escape, routed by key beside subplan 5's Tab and arrow helpers, so no single function nears the `sonarjs/cognitive-complexity` limit. It still returns nothing. Its `state` object is unchanged (Return reads `highlighted`, Escape reads `open`). Its `actions` object gains two members:
  - `accept()`, which the hook implements as `onPick` with the id of `rows[highlighted]`. The dispatch calls it only when `highlighted` isn't null, so it never computes a row id or a signature itself.
  - `submit()`, which the hook implements as calling its `onSubmit` option when one was passed and doing nothing otherwise.
- **The hook carries both callbacks (decision for this subplan).** `useModelSearch`'s options object gains an optional `onSubmit` and an optional `onListChange`, with the same names and types as the component's props. `ModelSearchInput` forwards both props to the hook unchanged and decides nothing itself (subplan 4's layering, `ai/guidelines/react-code-organization.md` §5). The hook's return object doesn't change in this step.
- **`onListChange({ open, highlighted })` (optional).** Both fields are booleans: `open` is the hook's `open`, and `highlighted` is whether the hook's `highlighted` index is non-null. Name the parameter type `ModelSearchListState` and export it from `useModelSearch.ts` (decision for this subplan), so subplan 11 can type its ref with it by importing the shared file directly.
  - The hook reports from a `useEffect` whose only dependencies are those two booleans. It runs once after mount, reporting the initial `{ open: false, highlighted: false }`, and again whenever either value changes, including `open` turning false because `disabled` became true (subplan 4). It doesn't report on unmount.
  - It reads the callback through `useLatestRef` (`web/src/shared/useLatestRef.ts`), so a host passing a new inline function on every render triggers no extra report.
  - A plain `useEffect` is enough for subplan 11's ref: React flushes the passive effects of a render caused by a discrete event (keydown, focus) before the next discrete event is dispatched, so the dialog's capture listener always reads the state the previous key left.
- **Reaching plugins.** A client plugin can import only `../api`, an import-free shared contract, `@shared/error-text`, and `../shared.css` (`eslint.plugin-boundaries.mjs`, the "Client tab plugins must use their client API" rule). Re-export `ModelSearchInput` alone from `web/src/plugins/api.ts`, a named re-export from `'../shared/model-search/ModelSearchInput'`, placed right after the `ConfirmDialog` re-export (`export { ConfirmDialog } from '../shared/ConfirmDialog';`) with a short comment above it in the file's style: what it is, why a plugin uses it rather than its own copy, and "Additive, so `TAB_PLUGIN_API_VERSION` does not move." (the wording the `LineFind` and `relativeActivity` re-exports use).
  - Don't re-export `useModelSearch`, `handleModelSearchKey`, `HarnessModelPair`, or `ModelSearchListState`. The roles picker needs only the component, passes no `onListChange`, and its `RoleEntry` lists satisfy `HarnessModelPair` structurally (subplan 1), so it names none of those types.
  - The harness dialog imports the shared file directly (subplan 11).
  - `api.ts` already re-exports `LineFind` and `useLineFind`, so the entry bundle gains only the new `model-search` modules. None of them imports a plugin shared contract, which the client plugin host may not do at runtime (`ai/guidelines/plugins-tabs.md`, "Import boundaries and versioning", and the `'^@shared/plugins/'` rule for `web/src/plugins/*.ts`). Today the static graph from `web/src/plugins/api.ts` reaches neither `src/plugins/api.ts` nor a `node:` module, and the new modules import only `react` and `web/src/shared/` files, so subplan 7's `chunk-imports.test.ts` keeps passing once the roles chunk imports `ModelSearchInput` at runtime.
- **No new key bindings (fact).** `help/keys.md` binds neither Return nor Escape globally for a focused text field. Its Return and Escape rows are all scoped to a tab type or a picker. `help/keys.md` doesn't change.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Key dispatch | `handleModelSearchKey` in `web/src/shared/model-search/model-search-keys.ts` | Subplan 5; Tab and arrow helpers, the `state` and `actions` objects, the guards |
| The input and hook | `useModelSearch`, `ModelSearchInput` in `web/src/shared/model-search/` | Subplan 4; `onPick` (fill and close) and the one close path are reused for Return and Escape |
| Latest callback without re-running the effect | `useLatestRef` in `web/src/shared/useLatestRef.ts` | Used the same way in `web/src/useAppWindowKeys.ts` |
| Composition guard | `web/src/editor/useEditorInteractions.ts` | Returns early on `event.nativeEvent.isComposing`; subplan 5 already applies it |
| Command-bar Escape precedent | `product/specs/tab-completion.md` | Escape closes the picker without changing the line |
| Plugin re-export precedent | `InlineEditInput`, `ConfirmDialog`, `LineFind` in `web/src/plugins/api.ts` | 130 lines as `max-lines` counts them (346 physical; comments and blanks are skipped), so the new lines fit |
| Re-export identity test | "publishes the shared list-selection rule itself" in `web/src/plugins/api.test.ts` | `expect(nextListSelection).toBe(sharedNextListSelection)` |
| Default-prevented assertion | `web/src/plugins/shell/ShellTab.test.tsx` | `fireEvent.keyDown` returns false when the default was prevented |

## Proposed changes

- `web/src/shared/model-search/model-search-keys.ts`: the Return and Escape helpers, the `accept()` and `submit()` members of the `actions` type, and the guard placement above, about 15 lines.
- `web/src/shared/model-search/useModelSearch.ts`: the `onSubmit` and `onListChange` options, the exported `ModelSearchListState` type, the `accept()` and `submit()` actions passed to `handleModelSearchKey`, and the reporting effect, about 15 lines.
- `web/src/shared/model-search/ModelSearchInput.tsx`: the optional `onSubmit` (`() => void`) and `onListChange` (`(state: ModelSearchListState) => void`) props, forwarded to the hook, a few lines.
- `web/src/plugins/api.ts`: the commented re-export above, about 4 lines.

All four stay well under the 200-line limit. Until subplan 7 lands, no plugin renders the re-export. `npm run knip` (part of `check:full`, not `check`) may report it as unused in between.

## Tests

Extend `web/src/shared/model-search/ModelSearchInput.test.tsx` (from subplans 4 and 5), using its controlled wrapper, focus and blur helpers, and selectors. Give the wrapper optional `onSubmit` and `onListChange` props it passes through. For the propagation cases, render the wrapper inside a `div` whose `onKeyDown` is a `vi.fn()` spy, and assert default-prevention through `fireEvent.keyDown`'s return value, as subplan 5 does.

- Return on a typed list with the first row highlighted fills that row's id, closes the list, is default-prevented, and neither the outer `onKeyDown` nor `onSubmit` sees it. On the blank most-used list, `↓` then Return fills the top most-used id the same way.
- Typing an exact id that is its only match (`opus-max` beside `opus`) leaves it highlighted as the only row. Return closes the list without calling `onSubmit`, and a second Return calls `onSubmit` once.
- Return with nothing highlighted is let through: on a focused blank list (open, nothing highlighted), and on a typed list that Escape closed, it calls `onSubmit` once, isn't default-prevented, and reaches the outer `onKeyDown`. Without an `onSubmit` prop the same Return changes nothing and throws nothing.
- Escape on an open list closes it only: the text stays, `document.activeElement` is still the input, the event is default-prevented, and the outer `onKeyDown` doesn't see it. A second Escape isn't default-prevented and reaches the outer handler.
- After Escape closes the list, a Tab completion reopens it: with ids `opus` and `opus-max`, type `op`, press Escape, then Tab, and the text is `opus` with the list open.
- Guards: a Return with `isComposing: true` on a highlighted row isn't default-prevented, leaves the text and the open list unchanged, and doesn't call `onSubmit`. An Escape with `isComposing: true` leaves the list open. Shift+Escape on an open list closes it like Escape.
- `onListChange` reports `{ open: false, highlighted: false }` after mount, then `{ open: true, highlighted: false }` on focusing the blank input, `{ open: true, highlighted: true }` after `↓`, and `{ open: false, highlighted: false }` after Escape. Rerendering with `disabled` true while open reports `{ open: false, highlighted: false }`.
- Rerendering with a new `onListChange` function and an unchanged list state adds no report.

`web/src/plugins/api.test.ts` (existing): add a case beside "publishes the shared list-selection rule itself" that `ModelSearchInput` from `./api` is the component from `../shared/model-search/ModelSearchInput` (`toBe`).

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: no host mounts the input yet. The manual walkthroughs are in subplans 7, 8, and 11.

## Out of scope

- Mounting the input in the roles picker (subplans 7 and 8) or the New harness dialog (subplan 11), including the dialog's `yieldsKey` predicate and its ref.
- Any change to `useDialogKeyboard`, `useLaunchDialog` (subplan 10), or `help/keys.md`.
- Any change to the Tab, arrow, focus, blur, typing, pick, or highlight-reset rules of subplans 4 and 5, beyond moving the modifier check as described above.
- Reopening the dropdown on a click into the already-focused input after Escape. Typing, Tab, and the arrows reopen it.
- Re-exporting anything from `web/src/shared/model-search/` other than `ModelSearchInput`, and any developer-documentation change: `documentation/developer-documentation/tab-plugins.md` doesn't list the re-exported components.
- ARIA combobox, listbox, or option roles.
