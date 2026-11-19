# Model search 2: The candidate dropdown list

**Complexity: 5/10** — ~60 added lines, 2 files edited, 10 requirements, 10 test scenarios (p=5.55)

Run order: 2 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-1-matching-module.md` only by run order; it uses none of that module's functions.

This step lands the presentational dropdown that floats under the model search input: its rows with matched characters marked, the two muted rows, row clicks that don't steal focus, and hover highlighting. It also exports `highlightRanges` from the editor find so the rows mark matches the same way, and adds the dropdown's styles. Placement above the input and the width limits come in subplan 3. Nothing mounts the list until subplan 4.

## Goal

Add `ModelSearchList` in `web/src/shared/model-search/`, export `highlightRanges` from `web/src/shared/line-find/LineFind.tsx`, and add the dropdown rules to `web/src/theme.css`.

## Design decisions

All of these come from the source plan, except the ones marked "decision for this subplan", which pin down names and values the source plan left open.

- **Presentational only.** `ModelSearchList` takes its rows and callbacks and decides nothing about matching, ranking, or keys (`ai/guidelines/react-code-organization.md` §5). It is a named export (no default export), and its props are:
  - `rows`: an array of the exported row type, `ModelSearchRow`, in display order. A row is `id` (a string) plus `ranges`, the matched `[start, end)` ranges to mark, typed as `[number, number][]`, the exact type of `FuzzyMatchResult.ranges` in `web/src/shared/fuzzy-match.ts` and of `highlightRanges`'s second parameter. Don't make it a readonly array: it would not type-check against `highlightRanges`. `ranges` is required. Typed-text rows carry the ranges `contiguousMatch` returned. Blank-input most-used rows carry an empty array and so render as the plain id.
  - `highlighted`: the highlighted row's index (`number | null`), null for none. An index with no matching row highlights nothing.
  - `blank`: whether the input text is blank (empty or only whitespace). It only picks the empty-list wording.
  - `onHover(index: number)` and `onPick(id: string)`.
  - Subplan 3 adds an anchor ref for placement.
- **Rows win over the muted rows (decision for this subplan).** Whenever `rows` is non-empty, the list renders exactly those rows, whatever `blank` says (a blank input with used models shows the most-used rows). The muted rows appear only when `rows` is empty. This differs from `editorFindBody` in `LineFind.tsx`, which shows `type to search` for a blank query before looking at its results; don't copy that order.
- **Rows show the id with the match marked (user decision).** Each row is the model id with matched characters wrapped in `<mark>` by `highlightRanges(row.id, row.ranges)`, the way editor find rows mark them. No row shows a usage count. The dropdown has no title row (unlike `ShellCompletionPicker`'s `picker-title`). Rows are keyed by their id: ids are unique in both lists (subplan 1's `mostUsedModels` returns each id at most once, and `contiguousMatch` returns each catalog entry at most once).
- **Muted rows (user decision).** With no rows and `blank` true, the list shows one muted row reading `type to search`, the hint editor find and quick open use. With no rows and `blank` false, it shows one muted row reading `No matching models`, following `No matching lines` and `No matching files`. Muted rows can't be highlighted or chosen: they take no mouse-enter, mouse-down, or click handlers, and never carry the highlighted class.
- **A click fills and keeps focus (user decision).** A row's mouse-down calls `preventDefault`, as `ShellCompletionPicker` and `LineFindRow` in `LineFind.tsx` do, so pressing a row never blurs the input. Its click calls `onPick(id)`. What a pick does (fill the text and close) belongs to subplan 4's hook. The list never adds an entry or launches anything.
- **Hover highlights (user decision).** A row's `onMouseEnter` calls `onHover(index)`, the hover precedent in `web/src/toasts/ToastStack.tsx` and `web/src/shared/status-windows/StatusPanels.tsx`. There is no mouse-leave handler, so the highlight stays on the last row hovered. Hover has no CSS of its own, because hovering moves the highlight.
- **No ARIA roles (user decision).** Rows are plain `div`s in a `div` container, like `ShellCompletionPicker`'s, with no combobox, listbox, or option roles.
- **Class names (decision for this subplan).** One `model-search` prefix, and none of the global `picker`, `picker-row`, `picker-empty`, or `selected` classes, because their rules in `web/src/theme.css` (`.picker-row:hover`'s `--border` fill, `.picker-row.selected`'s accent fill, `.picker-row`'s `white-space: nowrap`) would contradict the look below:
  - `model-search`: the wrapper around the input and the list. Subplan 4 renders it; its rule lands here.
  - `model-search-list`: the list container `ModelSearchList` renders.
  - `model-search-row`: every row, muted ones included.
  - `highlighted`: added to the highlighted row, styled as `.model-search-row.highlighted`.
  - `model-search-muted`: added to the muted row, beside `model-search-row`.
- **The dropdown floats below the input (user decision).** The list is absolutely positioned against the wrapper, anchored to the input's bottom-left edge (`top: 100%`, `left: 0`). It overlays what's beneath it without moving it: later role cards, or the dialog's Effort field and buttons. Its width fits its content (`width: max-content`) until subplan 3 adds the limits. It has no `max-height` and no scrolling of its own, because it holds at most ten rows (subplans 1 and 4).
- **The wrapper hugs the input (decision for this subplan).** The `model-search` rule is `position: relative` plus `display: flex` with `flex-direction: column`. A plain block wrapper around an inline input would add the line box's descender gap under the input, so `top: 100%` would leave a gap. The column flex makes the input a flex item, so the wrapper is exactly the input's height. It also keeps each host's current input width: in the dialog's column-flex `<label>` the wrapper stretches and the input stretches with it, as the select does today, and in the roles picker's flex row the wrapper shrinks to the input's own width.
- **The stacking order (decision for this subplan).** The container has `z-index: 5`. That lifts it over the unpositioned role cards and dialog fields beside it, and keeps it under every overlay layer in `web/src/theme.css`, the lowest of which is `.status-panels` at 20. Inside the dialog the list sits within `.modal-backdrop`'s own stacking context (`z-index: 60`), so it can't escape the modal.
- **Roles-native look, in both hosts (user decision).** The dropdown is styled like the roles tab's own controls, not the global `.picker` rows:
  - The container has the opaque `--bg` background (it overlays content), a 1px solid `--border` edge, a 3px radius, 12px text, and `color: var(--fg)`. Set the color on the container explicitly: in the dialog the list renders inside `.harness-launch-form label`, which is `--muted`, and rows would otherwise inherit that. Don't set a font family; the list inherits its host's.
  - Rows have `padding: 2px 6px` (the roles tab's own row padding, `.roles-entry`'s 2px vertical) and `cursor: pointer`. The row rule sets no `white-space`; subplan 3 adds wrapping to it.
  - The highlighted row is `font-weight: bold` in the same `--fg`, not an accent fill.
  - Muted rows are `--muted` with `cursor: default`, and never highlight.
  - `.model-search-row mark` copies `.editor-find-row mark` (accent background, `--bg` text, 2px radius). There is no highlighted-row variant of `mark` (unlike `.editor-find-row.selected mark`), because the highlighted row has no fill to invert against.
  - The same rules serve the New harness dialog.
- **Styles live in `web/src/theme.css` (fact).** Both a lazy plugin chunk (roles) and the entry-bundle dialog render the list, so the rules go beside the other picker rules, not in `roles.css`. Put them in one new block with its own comment heading directly after the editor find block (after `.editor-find-row.selected .editor-find-line`) and before the clipboard history block. The input's own look is each host's: the roles picker's input rule lands with subplan 7, and the dialog keeps its `.harness-launch-form input[type="text"]` rule.
- **`highlightRanges` is exported, not copied.** `web/src/shared/line-find/LineFind.tsx` gains `export` on its existing `function highlightRanges(text: string, ranges: [number, number][])`, keeping its comment, with no behavior change. It is not re-exported from `web/src/plugins/api.ts`: only the shared `ModelSearchList` uses it.
- **Imports.** `ModelSearchList.tsx` imports `highlightRanges` from `../line-find/LineFind`, extensionless like the rest of `web/src` (the `.js` rule applies to `src/` only). A shared module importing another shared module is allowed by `eslint.client-feature-zones.mjs`. No `index.ts` barrel (`ai/guidelines/imports-and-barrel-files.md`).

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Match emphasis | `highlightRanges` in `web/src/shared/line-find/LineFind.tsx` (module-private today) | Returns the plain text for empty ranges |
| Range type | `FuzzyMatchResult` in `web/src/shared/fuzzy-match.ts` | `ranges: [number, number][]`, the type the row's `ranges` matches |
| `mark` look | `.editor-find-row mark` in `web/src/theme.css` | Accent background, `--bg` text, 2px radius |
| Click without stealing focus | `ShellCompletionPicker` in `web/src/plugins/shell/ShellCompletionPicker.tsx`, `LineFindRow` in `web/src/shared/line-find/LineFind.tsx` | Row `onMouseDown` prevents default |
| Muted row wording precedent | `editorFindBody` in `web/src/shared/line-find/LineFind.tsx`, `quickOpenBody` in `web/src/pickers/QuickOpen.tsx` | `type to search`, `No matching lines`, `No matching files` |
| Test precedents | `web/src/shared/line-find/LineFind.test.tsx` | "emphasizes exactly the matched characters" (collects `mark` text), "keeps focus in the input when a row is pressed" (`fireEvent.mouseDown` returns false when default is prevented) |

## Proposed changes

- `web/src/shared/line-find/LineFind.tsx`: export `highlightRanges`.
- New `web/src/shared/model-search/ModelSearchList.tsx`: renders the container, the rows, and the muted rows as above. It exports `ModelSearchList` and the `ModelSearchRow` type for the hook in subplan 4. Expect about 45 lines, well under the 200-line limit.
- `web/src/theme.css`: the `model-search` rules above.

Until subplan 4 lands, nothing imports `ModelSearchList`, and `npm run knip` (part of `check:full`, not `check`) may report it as unused in between. No host renders it until subplan 7.

## Tests

New `web/src/shared/model-search/ModelSearchList.test.tsx` (render, `@testing-library/react` with `fireEvent`, like `LineFind.test.tsx`):

- Typed rows (`blank` false, rows with non-empty ranges) wrap exactly their matched characters in `<mark>`: the collected `mark` text equals the matched substrings.
- Most-used rows (`blank` true, rows with empty ranges) render each plain id with no `mark` and no muted row.
- No rows and `blank` true shows `type to search`.
- No rows and `blank` false shows `No matching models`.
- Firing mouse-enter and click on either muted row calls neither `onHover` nor `onPick`.
- A row's mouse-down is default-prevented (`fireEvent.mouseDown` returns false).
- A row's click calls `onPick` with its id.
- Mouse-enter on a row calls `onHover` with the row's index (`fireEvent.mouseEnter`, as `ToastStack.test.tsx` does).
- The highlighted row carries the `highlighted` class and no other row does.
- With `highlighted` null, no row carries it.

`web/src/shared/line-find/LineFind.test.tsx` stays green unchanged, since the export changes no behavior. The CSS has no automated test; its look is checked by hand in subplans 7 and 11.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing mounts the list yet. The visual checks run in subplans 7 and 11.

## Out of scope

- Placement above the input, `min-width`, `max-width`, and wrapping long ids (subplan 3).
- Keyboard handling, open state, and the input itself (subplans 4 to 6).
- Rendering the `model-search` wrapper around the input (subplan 4); only its rule lands here.
- The roles picker's input style (subplan 7) and any dialog style change (subplan 11).
- Any change to the global `.picker` rules, to `ShellCompletionPicker`, or to `LineFind`'s behavior.
