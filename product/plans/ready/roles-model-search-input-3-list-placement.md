# Model search 3: Dropdown placement and width

**Complexity: 5/10** — ~60 added lines, 2 files edited, 8 requirements, 8 test scenarios (p=5.34)

Run order: 3 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-2-candidate-list.md` (`ModelSearchList` and its styles), and must land after it: `web/src/shared/model-search/ModelSearchList.tsx`, its test file, and the `model-search` block in `web/src/theme.css` don't exist until subplan 2 does. It uses nothing from subplan 1.

The dropdown from subplan 2 always opens below the input and grows to fit its widest id. This step makes it open above the input when there's no room below inside its scrolling container, keeps it at least as wide as the input and never wider than that container, and wraps an id too long to fit. In the roles tab the container is the roles list. In the New harness dialog it's the viewport.

## Goal

Add a placement module to `web/src/shared/model-search/`, measure placement in `ModelSearchList`, and add the above-placement and wrapping rules to `web/src/theme.css`.

## Design decisions

All of these come from the source plan, except the ones marked "decision for this subplan", which pin down names and mechanics the source plan left open.

- **It opens above when there's no room below (user decision).** When there isn't room below the input inside the scrolling container, the list opens above the input instead.
- **The scrolling container.** It is the nearest ancestor of the list whose computed `overflow-y` isn't `visible`. The walk starts at the list's parent element and follows `parentElement` upward. It stops on reaching `document.body` without testing it (`html, body, #root` in `web/src/theme.css` set no overflow), and the box is then the viewport.
  - In the roles tab it finds `.roles-list` (`web/src/plugins/roles/roles.css`, `.roles-list { ... overflow-y: auto; ... }`). Nothing between the picker and `.roles-list` sets overflow: in `roles.css` only `.roles-list` does.
  - In the New harness dialog it finds nothing. `HarnessLaunchDialog` renders `.modal-backdrop` > `.modal`, mounted from `web/src/AppMain.tsx` inside `AppShell`'s `.app-center` and `.app`, and none of those set overflow. So the box is the viewport.
  - Read `getComputedStyle(element).overflowY`, not `overflow`: a browser expands an `overflow: hidden` shorthand into `overflowY`, so one check covers both spellings.
- **The viewport box.** Its top and left are 0, its right is `window.innerWidth`, and its bottom is `window.innerHeight`, the same viewport size `ContextMenu` passes to `contextMenuPosition` in `web/src/shared/ContextMenu.tsx`.
- **An element box is its client area (decision for this subplan).** For a scrolling ancestor the box's top is its rectangle's top plus `clientTop`, its left is the rectangle's left plus `clientLeft`, its bottom is that top plus `clientHeight`, and its right is that left plus `clientWidth`. That leaves out the border and a non-overlay scrollbar. Using the border box would let a list sized to the right edge reach under `.roles-list`'s vertical scrollbar, and since `overflow-y: auto` makes `overflow-x` compute to `auto` too, that would add a horizontal scrollbar to the roles list. `measureColumns` in `web/src/plugins/sql/column-fit.ts` sizes against `frame.clientWidth` to avoid adding a scrollbar the same way.
- **The rule.** The list opens below when its height fits between the input's bottom and the box's bottom (the input's bottom plus the list's height is at most the box's bottom; an exact fit opens below), and above otherwise. There is no third case: it opens above even when there's less room above than below, and nothing scrolls or clamps it.
- **Width (user decision).** The list's `min-width` is the input's width (its `getBoundingClientRect().width`), so it is at least as wide as the input. Its `max-width` is the box's right edge minus the input's left edge, so it is never wider than its scrolling container. Both are written in px. If they conflict (an input wider than the room to its right), CSS lets `min-width` win and the list is as wide as the input; the code doesn't clamp. Otherwise its width fits its content (subplan 2's `width: max-content`).
- **Long ids wrap (user decision).** An id too long for that width wraps onto further lines inside its row, breaking anywhere if it must, so the whole id is always visible. The `.model-search-row` rule gains `overflow-wrap: anywhere`, as `.roles-command-text` in `roles.css` has, and `white-space: normal`. `.roles-command-text` sets no `white-space` and simply inherits normal. The row sets it explicitly so a host that inherits `nowrap` can't stop the wrap. `width: max-content` still sizes the list to its unwrapped ids, so a list that fits its `max-width` shows one line per id.
- **The above modifier (decision for this subplan).** The class is `model-search-above`. It goes on the list container (`model-search-list`), which `ModelSearchList` renders. It never goes on the `model-search` wrapper, which subplan 4 renders. Its rule, `.model-search-list.model-search-above`, sets `top: auto` and `bottom: 100%`, so the list's bottom edge sits on the input's top edge and `left: 0` still applies. It sits in subplan 2's `model-search` block in `web/src/theme.css`, directly after the `.model-search-list` rule. No `z-index` or other subplan 2 value changes.
- **A layout effect measures.** `ModelSearchList` takes a new required prop, `anchorRef`, typed `React.RefObject<HTMLInputElement | null>` (the shape `useColumnFit` in `web/src/plugins/sql/useColumnFit.ts` uses for `frameRef`). It's the input's ref. The component also keeps a `useRef` on its own container. A `useLayoutEffect` with dependencies `[rows, anchorRef]` runs when the list mounts and whenever the `rows` array changes. Subplan 4 mounts the list only while it's open, so every opening measures. Measuring in a layout effect avoids a visible flash below before the list jumps above. The effect does four things in this order:
  1. Reads the input's rectangle and the box (via `scrollBox` on the list element).
  2. Writes `style.minWidth` and `style.maxWidth` on the list element.
  3. Reads the list's height from its `getBoundingClientRect().height`. That's now the final width, so wrapped rows count.
  4. Toggles `model-search-above` with `classList.toggle(name, above)`, which removes the class again when a later run fits below.
- **Direct DOM writes, not state (decision for this subplan).** The effect writes the styles and the class straight onto the node, as `fitColumns` writes `frame.style` from `useColumnFit`'s layout effect in `web/src/plugins/sql/`. Holding them in React state would measure the height before the `max-width` applied, and a list that wraps could open below with no room. React never overwrites these writes because the container's `className` is the constant `model-search-list` and the container takes no `style` prop. Keep both that way. When `anchorRef.current` or the container ref is null, the effect does nothing. It needs no cleanup.
- **Pure function plus one DOM read.** `web/src/shared/model-search/list-placement.ts` exports three things:
  - `PlacementRect`, a type with `top`, `right`, `bottom`, and `left` numbers. A `DOMRect` satisfies it, so the effect passes the input's `getBoundingClientRect()` straight in.
  - `listPlacement(input, box, listHeight)`, pure. It takes two `PlacementRect`s and a number, and returns `{ above, maxWidth }` by the rule and width decisions above.
  - `scrollBox(list)`, the DOM helper. It takes the list element and returns the `PlacementRect` of the client area or viewport described above.
  The pure half is unit-tested without layout, because jsdom reports zero-sized rectangles. In jsdom without stubs, every rectangle and client size is 0 and the viewport is 1024 × 768, so the list opens below with `min-width: 0px` and `max-width: 1024px`. Subplan 2's existing tests see no change beyond passing the new prop.
- **Imports.** `ModelSearchList.tsx` imports from `./list-placement`, extensionless like the rest of `web/src` (the `.js` rule applies to `src/` only). No `index.ts` barrel.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The list | `ModelSearchList` in `web/src/shared/model-search/ModelSearchList.tsx` | Subplan 2. Container class `model-search-list`, row class `model-search-row` |
| Wrapping long text | `.roles-command-text` in `web/src/plugins/roles/roles.css` | `overflow-wrap: anywhere` |
| The roles scroll container | `.roles-list` in `web/src/plugins/roles/roles.css` | `overflow-y: auto` |
| The dialog's frame | `.modal-backdrop` and `.modal` in `web/src/theme.css` | Neither sets `overflow`, nor do `.app-center`, `.app`, or `html, body, #root` |
| Viewport size | `ContextMenu` in `web/src/shared/ContextMenu.tsx` | `{ width: window.innerWidth, height: window.innerHeight }` |
| Layout effect writing to a DOM node | `useColumnFit` in `web/src/plugins/sql/useColumnFit.ts` calling `fitColumns` in `column-fit.ts` | Measures before paint and sets `frame.style` directly |
| Client width against a scroller | `measureColumns` in `web/src/plugins/sql/column-fit.ts` | Sizes against `frame.clientWidth` so no scrollbar is added |
| Stubbed rectangles in tests | `web/src/plugins/search/SearchRow.test.tsx`, `web/src/toasts/useToastPosition.test.ts` | `vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(...))`, or an assigned `getBoundingClientRect` |

## Proposed changes

- New `web/src/shared/model-search/list-placement.ts`: `PlacementRect`, `listPlacement`, and `scrollBox`, about 40 lines.
- `web/src/shared/model-search/ModelSearchList.tsx`: the `anchorRef` prop, the container ref, and the layout effect, about 15 more lines, well under the 200-line limit.
- `web/src/theme.css`: the `.model-search-list.model-search-above` rule, plus `overflow-wrap: anywhere` and `white-space: normal` on the `.model-search-row` rule.
- `web/src/shared/model-search/ModelSearchList.test.tsx`: because `anchorRef` is required, subplan 2's renders pass a ref (`{ current: null }` is enough there) in the same change, so typecheck stays green.

## Tests

- New `web/src/shared/model-search/list-placement.test.ts`:
  - `listPlacement`: room below opens below, including an exact fit (input bottom plus list height equal to the box's bottom).
  - `listPlacement`: one pixel more than the room below opens above.
  - `listPlacement`: `maxWidth` is the box's right edge minus the input's left edge.
  - `scrollBox`: with the list inside a plain `div` inside an element styled `overflow-y: auto` inline, it returns that element's client area (its stubbed rectangle offset by stubbed `clientTop`/`clientLeft`, sized by stubbed `clientWidth`/`clientHeight`), skipping the plain `div`. Use the `overflow-y` longhand in the test: jsdom reads an inline `overflow-y: auto` back as `auto` and an unstyled element as `visible`, but doesn't expand the `overflow` shorthand.
  - `scrollBox`: with no such ancestor, it returns the viewport (`0`, `0`, `window.innerWidth`, `window.innerHeight`).
- `web/src/shared/model-search/ModelSearchList.test.tsx` (extend). Render the list beside an `<input>` whose ref is passed as `anchorRef`. Stub `getBoundingClientRect` before rendering, because the effect runs at mount. For example, `vi.spyOn(Element.prototype, 'getBoundingClientRect')` (jsdom defines it on `Element.prototype`) keyed on the element, restored after each test. With no scroll ancestor the box is jsdom's 1024 × 768 viewport.
  - With the input near the viewport's bottom and a list height that doesn't fit below, the container carries `model-search-above`. The source plan lists "the list opens above the input when there's no room below" under `ModelSearchInput.test.tsx`. It lands here, where the placement rule lives.
  - A rerender with a new `rows` array whose list now fits below drops `model-search-above`.
  - The container's inline `min-width` equals the stubbed input width, and its inline `max-width` is the viewport width minus the input's left edge.

The CSS has no automated test.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing mounts the list yet. The series' manual steps in subplans 7 and 11 (copied from the source plan) don't exercise above-placement or wrapping, so the tests above are the only coverage this behavior gets.

## Out of scope

- Keyboard handling, open state, and the input itself (subplans 4 to 6).
- Rendering the `model-search` wrapper and passing the input's ref as `anchorRef` (subplan 4).
- Re-measuring on scroll, window resize, or a highlight change while the list stays open with the same rows.
- Scrolling the container to reveal the list, flipping sideways, or a `max-height` with scrolling inside the list.
- Any change to `.roles-list` or the dialog's frame.
