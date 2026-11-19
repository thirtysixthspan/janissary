# Model search 5: Tab completion and arrow keys in the search input

**Complexity: 5/10** — ~50 added lines, 2 files edited, 9 requirements, 14 test scenarios (p=5.57)

Run order: 5 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-1-matching-module.md` (`completeModel`) and `product/plans/ready/roles-model-search-input-4-search-input.md` (`useModelSearch`, `ModelSearchInput`, `ModelSearchInput.test.tsx`). It must land after both, and after subplans 2 and 3 that subplan 4 depends on: none of `web/src/shared/model-search/` exists until they do.

Feature text: "a model search input field with tab completion". This step makes Tab in the shared search input complete the typed text the way the command bar completes a token, and makes `↑`/`↓` move a clamped highlight through the dropdown. Return and Escape come in subplan 6. No host mounts the input yet.

## Goal

Add a key dispatch module for Tab and the arrows, wire it through `useModelSearch` into `ModelSearchInput`'s `onKeyDown`, and add the matching cases to `ModelSearchInput.test.tsx`.

## Design decisions

All of these come from the source plan, except the ones marked "decision for this subplan", which pin down mechanics the source plan left open.

- **Keys are handled only while the input has focus.** Each key is read in the input's `onKeyDown`. Other keys pass through untouched.
- **Only unmodified keys (decision for this subplan).** The dispatch handles Tab, `↑`, and `↓` only when none of Shift, Ctrl, Alt, or Meta is held and the event isn't part of an IME composition (`event.nativeEvent.isComposing` false, the check `web/src/editor/useEditorInteractions.ts:109` makes). Any other press passes through untouched: no `preventDefault`, no state change. This follows `SqlConsole.tsx:79` in `web/src/plugins/sql/` ("A held modifier is never this key's"), keeps Shift+`↑`/`↓` selecting text in the input, and covers the source plan's "Shift+Tab is never intercepted".
- **No `stopPropagation` (decision for this subplan).** Tab and the arrows call `preventDefault` only, unlike `rankedOverlayKeys`, which stops every key. Neither host acts on them: the roles picker's container handler in `web/src/plugins/roles/EntryPicker.tsx` (`handleKeyDown`) reads only Escape, and the dialog's capture-phase listener in `web/src/shared/use-launch-dialog.ts` reads only Escape and Enter. Stopping propagation is subplan 6's, for the Return and Escape it consumes.
- **Tab completes the longest common prefix (user decision).** Tab calls `completeModel(ids, text)` with the hook's full `ids` (the whole catalog, not the ten visible rows or the most-used list) and the raw, untrimmed `text`, as subplan 1's contract requires. When it returns text, Tab calls `preventDefault`, sets that text through `onChangeText`, and opens the dropdown. With exactly one candidate the text becomes its full id. With several it becomes their longest common prefix when that narrows (subplan 1 owns the rule). The dropdown stays open after Tab.
  - Tab ignores the highlight (decision for this subplan). With a row highlighted, Tab still fills only what `completeModel` returns, never the highlighted id. Accepting the highlighted row is Return's (subplan 6) or a click's.
  - The highlight after a completion follows subplan 4's content rule: new rows reset it to the list's default, and a completion that leaves the row ids unchanged keeps it, exactly as typing does.
- **Tab completion reopens like typing.** Subplan 4 makes only the input's change event reopen the dropdown, so the hook's own `onChangeText` call doesn't. The Tab branch therefore opens the dropdown explicitly, even when it was closed. Subplan 6's Escape is what closes it with focus kept, and its test covers the reopen after Escape. No closed-with-completable-text state is reachable in this step: a click pick fills a full id, and no common prefix of matches containing that id can be longer than it.
- **Tab moves focus when it has nothing to complete (user decision).** When `completeModel` returns null (no candidates, blank or whitespace-only text, the text already equals the single candidate, or the common prefix wouldn't narrow), Tab isn't intercepted: no `preventDefault`, so focus moves to the next control as usual. The dispatch also closes the dropdown itself through the hook's close path, rather than relying on the blur that follows. Shift+Tab is never intercepted and never touches the dropdown; its blur closes it (subplan 4).
- **Arrows clamp (user decision).** With the dropdown open, `↑` or `↓` moves the highlight one row and stops at the ends rather than wrapping, the rule `rankedOverlayKeys` gives editor find and quick open. With the dropdown open and nothing highlighted, as on the blank most-used list, either one highlights the first row (row 0, also for `↑`). With no rows (a muted row showing), the arrows highlight nothing. The dispatch applies the same clamp itself rather than calling `rankedOverlayKeys` (`web/src/shared/ranked-overlay-keys.ts`), which swallows every key. Every unmodified arrow calls `preventDefault`, whatever the state, so the caret doesn't jump to the start or end of the text.
- **An arrow on a closed dropdown only reopens it (decision for this subplan, the question subplan 4 left open).** With the dropdown closed and the input focused, `↑` or `↓` opens it and does nothing else. The list comes back at its default under subplan 4's "Every opening starts at the list's default": the first row highlighted for a typed list with rows, nothing for the blank list or a list with no rows. The same keypress doesn't also step or set the highlight, so `↓` on a closed typed list shows row 0, not row 1, and `↓` on a closed blank list shows nothing highlighted until a second press.
  - Grounding: the source plan states "With the dropdown closed and the input focused, `↑` or `↓` reopens it" and "With nothing highlighted, as on the blank most-used list, `↑` or `↓` highlights the first row" as separate cases, its hook bullet orders them as three exclusive branches (closed reopens, nothing highlighted takes the first row, otherwise clamp-step), and its clamp rule is stated "With the dropdown open". The hook's `highlighted` is null while closed (subplan 4), so the closed check must come first or every closed list would read as "nothing highlighted".
  - Reopening by arrow then matches reopening by focus, and the blank list keeps its "Return on a blank field never picks a model by accident" guarantee after a reopen.
- **Command-bar Tab semantics (from precedent).** In the command bar, Tab replaces the token with the single match, or with the longest common prefix of several matches and opens a candidate picker, and `↑`/`↓` move through it (`product/specs/tab-completion.md`).
- **The key logic is its own module (decision for this subplan).** Put the dispatch in `web/src/shared/model-search/model-search-keys.ts` as one named export, `handleModelSearchKey(event, state, actions)`, a plain function in the spirit of `rankedOverlayKeys`.
  - `event` is the input's `React.KeyboardEvent<HTMLInputElement>` (a type-only `react` import, as `ranked-overlay-keys.ts` does). `state` carries the hook's `open`, its effective `highlighted` (null while closed), the row count (`rows.length`), `text`, and `ids`. `actions` carries `open()`, `close()`, `highlight(index)`, and `changeText(text)`. It returns nothing in this step.
  - The exported function routes by key to module-private per-key helpers (one for Tab, one for the arrows), so subplan 6's Return and Escape branches join without pushing one function past the `sonarjs/cognitive-complexity` limit.
  - It imports `completeModel` from `./model-search`, extensionless like the rest of `web/src`.
- **How the hook wires it (decision for this subplan).** `useModelSearch` adds one handler to its return, `onKeyDown(event)`, named for the prop it is wired to like subplan 4's handlers, which calls `handleModelSearchKey` with the current state and these actions:
  - `open()` sets the stored open flag, the same state `onFocus` sets.
  - `close()` is the hook's one close path, the one `onBlur` and `onPick` use, so it also clears the highlight override as subplan 4 requires of every close.
  - `highlight(index)` is the function behind `onHover`: it writes the override with the current rows' signature. The dispatch never computes a signature itself.
  - `changeText(text)` is the host's `onChangeText`.
  `ModelSearchInput` passes the hook's `onKeyDown` as the input's `onKeyDown`. The component still decides nothing itself.
- **No new key bindings (fact).** `help/keys.md` binds none of Tab, `↑`, or `↓` globally for a focused text field (`web/src/useWindowKeys.ts` reads only Ctrl+`←`/`→` and Shift+`←`/`→`, for moving and switching tabs), and the global Shift+Tab section move is untouched because Shift+Tab isn't intercepted. `help/keys.md` doesn't change.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Tab completion | `completeModel` in `web/src/shared/model-search/model-search.ts` | Subplan 1; takes the full `ids` and the raw text; null means "don't intercept" |
| The input and hook | `useModelSearch`, `ModelSearchInput` in `web/src/shared/model-search/` | Subplan 4; reuse its close path and its `onHover` override writer |
| Clamp rule | `rankedOverlayKeys` in `web/src/shared/ranked-overlay-keys.ts` | Same clamp, not called; also the precedent for a plain key module |
| Modifier guard | `onKeyDown` in `web/src/plugins/sql/SqlConsole.tsx` | Tab handled only with no Shift, Ctrl, Meta, or Alt |
| Composition guard | `web/src/editor/useEditorInteractions.ts` | Returns early on `event.nativeEvent.isComposing` |
| Default-prevented assertion | `web/src/plugins/shell/ShellTab.test.tsx` | `expect(fireEvent.keyDown(…, { key: 'Tab', shiftKey: true })).toBe(false)`: `fireEvent` returns false when the default was prevented |

## Proposed changes

- New `web/src/shared/model-search/model-search-keys.ts`: `handleModelSearchKey` and its per-key helpers, about 40 lines.
- `web/src/shared/model-search/useModelSearch.ts`: add `onKeyDown` to the return, wiring the actions above, about 10 lines.
- `web/src/shared/model-search/ModelSearchInput.tsx`: pass the hook's `onKeyDown` as the input's `onKeyDown`, one line.

All three stay well under the 200-line limit, with room for subplan 6.

## Tests

Extend `web/src/shared/model-search/ModelSearchInput.test.tsx` (from subplan 4), using its controlled wrapper, focus and blur helpers, and selectors. Send keys with `fireEvent.keyDown(input, { key })` and assert default-prevention through its return value, as `ShellTab.test.tsx` does. In jsdom a dispatched Tab doesn't move focus, so the input stays focused after a Tab that wasn't intercepted, which is how the closed-blank case below is reached.

- `↑`/`↓` on an open list: with a `roleEntries` fixture giving at least two most-used rows, focus the blank input and press `↓`, and the first row highlights. Blur, refocus, and press `↑`, and the first row highlights too. On a typed list of three rows, `↓` four times stays on the last row and `↑` four times stays on the first. Every arrow press is default-prevented.
- With no rows (typed text showing `No matching models`), `↓` is default-prevented and no row highlights.
- `↓` on a closed typed list reopens it at its default: pick a row by click whose id is contained in another id (for example `opus` beside `opus-max`), so the reopened list has two rows. `↓` reopens it with the first row highlighted, and a second `↓` moves to the second row. `↑` after another pick also reopens with the first row highlighted.
- `↓` on a closed blank list reopens it with nothing highlighted: focus the blank input, press Tab (nothing to complete, so the list closes), then `↓` shows the most-used list with no row highlighted, and a second `↓` highlights the first row.
- Tab completes a single match to the full id and several matches to their narrowing common prefix. Each Tab is default-prevented and the list stays open. With the second row hovered, Tab still fills the common prefix, not that row's id.
- Tab with nothing to complete (blank text, and text already equal to its single match) is not default-prevented and closes the list.
- Modified keys pass through: Shift+Tab with a completion available is not default-prevented and leaves the text unchanged, and Shift+`↓` and a `↓` with `isComposing: true` are not default-prevented and leave the highlight where it was.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: no host mounts the input yet. The manual walkthroughs are in subplans 7, 8, and 11.

## Out of scope

- Return, Escape, `onSubmit`, `onListChange`, and the `web/src/plugins/api.ts` re-export (subplan 6), including the Tab-reopens-after-Escape test.
- Any change to the focus, blur, typing, pick, or highlight-reset rules of subplan 4.
- Any change to `rankedOverlayKeys`, `completeModel`, or `help/keys.md`.
- ARIA combobox, listbox, or option roles.
