# Model search 4: The search input with its dropdown

**Complexity: 5/10** — ~100 added lines in two new modules, 14 requirements, 14 test scenarios (p=5.53)

Run order: 4 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-1-matching-module.md` (`mostUsedModels`, `HarnessModelPair`), `product/plans/ready/roles-model-search-input-2-candidate-list.md` (`ModelSearchList`, `ModelSearchRow`, the `model-search` class names and styles), and `product/plans/ready/roles-model-search-input-3-list-placement.md` (the list's required `anchorRef` prop). It must land after all three: `model-search.ts`, `ModelSearchList.tsx`, and the `model-search` block in `web/src/theme.css` don't exist until they do.

This step builds the shared `ModelSearchInput` both hosts will mount: a text input whose dropdown opens on focus, lists the most-used models while the text is blank and the matches once it isn't, and fills the input when a row is clicked. Open state and the highlighted row live in one hook, `useModelSearch`. Keyboard handling lands in subplans 5 and 6 on top of this hook. No host mounts the input yet.

## Goal

Add `useModelSearch` and `ModelSearchInput` in `web/src/shared/model-search/`, covering the source plan's pointer, focus, filtering, and republish behavior, with the first part of `ModelSearchInput.test.tsx`.

## Design decisions

All of these come from the source plan, except the ones marked "decision for this subplan", which pin down names and mechanics the source plan left open. Behavior specific to one host (Add, Create, the remembered dialog copy) is decided in subplans 7, 8, and 11.

- **The host owns the text.** The hook takes the controlled text and an `onChangeText` callback from its host. It owns only whether the dropdown is open and which row is highlighted, which may be none.
- **The hook's contract (decision for this subplan).** `useModelSearch` is a named export taking one options object: `ids` (`string[]`), `roleEntries` (subplan 1's readonly list of readonly `HarnessModelPair` lists), `harness`, `text`, `onChangeText(text: string)`, and `disabled`. It returns:
  - `rows`: a `ModelSearchRow[]` (subplan 2's row type) in display order.
  - `blank`: whether `text` is blank (empty or only whitespace, so `text.trim()` is empty).
  - `open`: whether the dropdown shows. It is false whenever `disabled` is true (see "Disabled while open" below).
  - `highlighted`: the highlighted row's index, or null for none. It is null whenever `open` is false.
  - The handlers `onFocus()`, `onBlur()`, `onChange(text: string)`, `onHover(index: number)`, and `onPick(id: string)`, named for the props they are wired to.
  Subplans 5 and 6 add a keydown handler and the `onListChange`/`onSubmit` plumbing to this return; this step adds neither.
- **Rows.** While the text is blank, the rows are `mostUsedModels(roleEntries, harness, ids)`, each mapped to a row with that id and an empty `ranges` array. Otherwise they are `contiguousMatch(ids, text, 10)` from `web/src/shared/fuzzy-match.ts`, the call `useLineFind` makes, each result mapped to a row whose `id` is the result's `path` and whose `ranges` carry over. Pass the raw text: `contiguousMatch` trims and lowercases it itself. The dropdown re-filters on every keystroke. The rows are memoized with `useMemo` on `ids`, `roleEntries`, `harness`, and `text`.
  - The cap of ten is a module-private constant in `useModelSearch.ts` (decision for this subplan). `RESULT_CAP` in `web/src/shared/line-find/useLineFind.ts` and subplan 1's cap in `model-search.ts` are both module-private, so neither is imported or exported.
- **Highlight reset follows the rows' contents.** Whenever the rows' contents change, whether from typing or from a republish, the highlight resets: to the first row for a typed-text match list, and to none for the blank most-used list. Compare a content signature (the row ids in order, plus whether the text is blank), not array identity. The New harness view is rebuilt on every state snapshot (`src/state/event.ts:18`, `harnessLaunch: controller.harnessLaunchView()`), every roles payload carries new arrays, and `EntryPicker` passes `models[harness] ?? []`, a new empty array on every render for a harness with no models. An identity check would reset the highlight on each of those.
  - Typing that leaves the row ids and their order unchanged (for example `opu` to `opus` with the same matches) keeps the highlight where it is. Only the marked ranges change.
- **How the reset is held (decision for this subplan).** The hook stores the highlight as an override, either null or an index paired with the signature it was set for. The effective highlight is the override's index when its signature equals the current rows' signature, and otherwise the list's default: none for a blank list, none for a typed list with no rows, and 0 for a typed list with rows. `onHover` writes the override with the current signature. Deriving the highlight this way needs no effect and never renders one frame with a highlight from the old rows. Build the signature with `JSON.stringify` of the blank flag and the row ids, so no id can collide with a separator.
- **The blank list starts unhighlighted (user decision).** Focusing a blank input opens the most-used list with no row highlighted, so Return on a blank field never picks a model by accident. A typed-text match list highlights its first row automatically.
  - Every opening starts at the list's default (decision for this subplan). Each path that closes the dropdown also clears the override. Without that, hovering a blank-list row, blurring, and focusing again would reopen with that row highlighted, breaking the rule above.
- **Opening and closing (user decision).** The input's focus opens the dropdown. Its blur closes it, which covers a click elsewhere, Shift+Tab, Tab moving on, and the host closing. Typing (the input's change event, the hook's `onChange`) calls `onChangeText` and reopens it. Choosing a candidate closes it. A disabled input never focuses, so it never opens.
  - Only the input's change event reopens. The hook's own `onChangeText` calls (the pick here, Tab and Return in subplans 5 and 6) don't open the dropdown by themselves, and a host changing `value` (a harness change clearing the text) doesn't either. Subplan 5's Tab opens it explicitly.
- **Disabled while open (decision for this subplan).** A republish can disable the input while it has focus (the dialog's chosen harness losing all its enabled models), and browsers don't reliably fire blur when a focused input becomes disabled. So `open` reports false whenever `disabled` is true, and the list unmounts with it.
- **Pointer (user decision).** `ModelSearchList`'s `onHover` sets the highlight to that row. Pointer-leave changes nothing, so the highlight stays on the last row hovered. `onPick` fills the row's full id through `onChangeText` and closes the dropdown. Focus stays in the input, because the row prevents its own mouse-down default (subplan 2). A click never adds an entry or launches a harness; that stays the host's Add, Create, or Return.
- **A republish keeps the text (user decision).** New `ids` or `roleEntries` while the input is focused never change the text. The rows are recomputed, and the highlight resets per the content rule above.
- **A harness with no enabled models isn't special-cased (user decision).** With empty `ids`, the blank list shows `type to search` because nothing is used and typed text shows `No matching models`, the same path as any query that matches nothing. Whether the input is disabled is the host's choice.
- **`ModelSearchInput` props in this step.** A named export (no default export). Subplan 6 adds `onListChange` and `onSubmit`.
  - Required: `ids` (`string[]`, mutable because `contiguousMatch` takes `string[]`, per subplan 1), `roleEntries` (the same type the hook takes), `harness` (`string`), `value` (`string`), `onChange` (`(text: string) => void`, receiving the new text rather than the event, as `InlineEditInput`'s `onChange` in `web/src/shared/InlineEditInput.tsx` does), `placeholder` (`string`), and `aria-label` (`string`, a quoted property name in the props type, forwarded to the input as its `aria-label`). Both hosts pass every one of these (subplans 7 and 11).
  - Optional: `disabled` (default false, forwarded to the input and to the hook), and `inputRef`.
  - The component passes `value` as the hook's `text` and `onChange` as its `onChangeText`.
  - The input renders `type="text"`, so the dialog's existing `.harness-launch-form input[type="text"]` rule (`web/src/theme.css:691`) styles it, and `autoComplete="off"`, so the browser's own suggestions don't cover the dropdown. Its `onFocus`, `onBlur`, and `onChange` call the hook's handlers, the last with `event.currentTarget.value`.
  - The input and `ModelSearchList` sit in one wrapper `div` with subplan 2's wrapper class, `model-search` (`position: relative`, column flex), so the absolutely positioned list anchors to the input. The list renders only while the hook's `open` is true, which subplan 3's placement effect relies on to measure each opening. It receives `rows`, `highlighted`, `blank`, `onHover`, `onPick`, and `anchorRef`.
- **The input's ref (decision for this subplan).** `inputRef` is typed `React.RefObject<HTMLInputElement | null>`, the type of subplan 3's `anchorRef`. The component always creates its own `useRef` (so the hook order never changes) and uses the host's `inputRef` when one is passed, falling back to its own otherwise. That one ref object goes on the input's `ref` and is passed as `ModelSearchList`'s `anchorRef`, so no ref merging is needed. Neither host passes `inputRef` in this series; the source plan lists it as part of the component's contract.
- **Layers (fact, per `ai/guidelines/react-code-organization.md` §5, §6, and §8).** `useModelSearch.ts` holds the state and calls the pure module and `contiguousMatch`. `ModelSearchInput.tsx` is a thin render of the input plus the list and decides nothing itself: the open, disabled, and highlight rules all live in the hook. Neither imports anything from the roles plugin or the harness feature.
- **Imports.** Extensionless relative imports, like the rest of `web/src` (the `.js` rule applies to `src/` only): `useModelSearch.ts` imports `mostUsedModels` and the `HarnessModelPair` type from `./model-search`, `contiguousMatch` from `../fuzzy-match`, and the `ModelSearchRow` type from `./ModelSearchList`. `ModelSearchInput.tsx` imports `useModelSearch` and `ModelSearchList`. No `index.ts` barrel (`ai/guidelines/imports-and-barrel-files.md`).

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Most-used ranking | `mostUsedModels` and `HarnessModelPair` in `web/src/shared/model-search/model-search.ts` | Subplan 1 |
| The dropdown | `ModelSearchList` and `ModelSearchRow` in `web/src/shared/model-search/ModelSearchList.tsx` | Subplans 2 and 3; props `rows`, `highlighted`, `blank`, `onHover`, `onPick`, `anchorRef` |
| Wrapper and list styles | The `model-search` block in `web/src/theme.css` | Subplans 2 and 3; this step adds no CSS |
| Matching | `contiguousMatch` in `web/src/shared/fuzzy-match.ts`, capped at ten as in `useLineFind` | Unchanged; returns `[]` for blank text |
| A controlled-query hook precedent | `useLineFind` in `web/src/shared/line-find/useLineFind.ts` | Memoized results and a selected row; this hook differs by allowing no selection and by keying the reset on content |
| A string-valued `onChange` | `InlineEditInput` in `web/src/shared/InlineEditInput.tsx` | `onChange: (value: string) => void`, called with `e.currentTarget.value` |
| Test precedents | `web/src/shared/line-find/LineFind.test.tsx`, `web/src/plugins/shell/ShellTab.test.tsx` | "keeps focus in the input when a row is pressed" checks `document.activeElement`; `fireEvent.focus`/`fireEvent.blur` on an input |

## Proposed changes

- New `web/src/shared/model-search/useModelSearch.ts`: the hook described above, about 60 lines.
- New `web/src/shared/model-search/ModelSearchInput.tsx`: the component described above, about 40 lines.

Both stay well under the 200-line limit, with room for subplans 5 and 6. Until subplan 7 lands, no host renders `ModelSearchInput`. `npm run knip` (part of `check:full`, not `check`) may report it as unused in between.

## Tests

New `web/src/shared/model-search/ModelSearchInput.test.tsx` (`@testing-library/react` with `fireEvent`, like `LineFind.test.tsx`), rendering the component under a small controlled wrapper component that owns the text in `useState` and takes `ids`, `roleEntries`, and `harness` as its own props, so `rerender` can change them while the text survives. Focus the input inside `act` with `input.focus()`, so `document.activeElement` is real, and blur it with `fireEvent.blur`. Find rows by `.model-search-row` without `.model-search-muted`, the highlighted row by `.highlighted`, and the open list by `.model-search-list`. No rectangle stubs are needed: in jsdom the list always opens below (subplan 3).

- Focus opens the most-used list with no row highlighted, and a blank list with nothing used shows `type to search`.
- Typing filters, with `<mark>` on matches and the first row highlighted, and unmatched text shows `No matching models`.
- Hovering a row highlights it, and the highlight stays after the pointer leaves. Typing more text that keeps the same rows keeps that highlight.
- A click fills the row's id, closes the list, and keeps focus in the input (the row's mouse-down returns false and `document.activeElement` is still the input). Typing then reopens the list.
- Blur closes the list. Hovering a blank-list row, blurring, and focusing again reopens it with no row highlighted.
- A new `ids` prop keeps the text and resets the highlight: with typed text and a hovered second row, new `ids` that change the matches leave the text alone and highlight the first row. With a blank input and a hovered row, new `roleEntries` that change the most-used order leave no row highlighted.
- A rerender with equal-content but new `ids` and `roleEntries` arrays keeps the current highlight.
- Rerendering a focused, open input with `disabled` true removes the list.

The keyboard cases of the source plan's list land in subplans 5 and 6, in the same file. The placement case is in subplan 3.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: no host mounts the input yet. The manual walkthroughs are in subplans 7, 8, and 11.

## Out of scope

- Keyboard handling (subplans 5 and 6), `onListChange`, `onSubmit`, and the `web/src/plugins/api.ts` re-export (subplan 6).
- Mounting the input in the roles picker (subplan 7) or the New harness dialog (subplan 11), and Add's or Create's exact-id rule.
- Any CSS change: the wrapper and list rules come from subplans 2 and 3, and the roles picker's input rule from subplan 7.
- Any change to `useLineFind`, `LineFind`, `ModelSearchList`, or `model-search.ts`.
- ARIA combobox, listbox, or option roles.
