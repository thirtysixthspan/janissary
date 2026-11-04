# Keep connection row controls from opening the row on Enter

**Complexity: 2/10** — one target guard in the connections list keydown handler plus focused component cases; the row, button, dialog, intent, and selection paths stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Functionality: keep keyboard activation of a list row's Close, Delete, and confirmation controls from opening the row." The connections list handles Enter for every descendant, so Enter on a focused **Close** or **Delete** button also runs the selected row's open intent and prevents the button's own activation. A confirmation dialog button reaches the same container when its event is not already trapped.

## Approach and evidence

`ConnectionList` puts one `onKeyDown` handler on the list container (`web/src/plugins/connections/ConnectionList.tsx:40`–`:52`). It answers navigation keys and Enter without looking at `event.target`, so any keydown that bubbles from a row action button is treated as a row activation: it calls `preventDefault()` and `controller.open(...)`. The **Close** and **Delete** buttons (`:83`–`:96`) therefore cannot activate from the keyboard, and the list may open a record instead. The confirmation dialog renders inside the same container (`:101`–`:108`), so its buttons would be exposed to the same handler if its global capture listener did not swallow the key first.

The guard belongs in the container handler. `event.currentTarget` is the list container; rows are the only other intended keyboard targets, and they carry `role="button"` (`:75`). Ignoring any event whose target is neither the container nor a row keeps navigation and Enter working on the focused list and on a focused row, while a focused **Close**, **Delete**, or dialog button no longer reaches the navigation or open branches. Buttons keep their native Enter and Space activation because the container no longer calls `preventDefault()` for their keydown. The dialog's own global capture keyboard contract is untouched.

## Implementation steps

1. In `web/src/plugins/connections/ConnectionList.tsx`, make `onKeyDown` return before navigation or Enter handling when `event.target` is neither `event.currentTarget` nor an element carrying `role="button"`. Leave navigation, selection, confirmation clearing, click handling, button handlers, and dialog rendering unchanged.
2. In `web/src/plugins/connections/ConnectionList.test.tsx`, add the focused-control cases described under Tests.
3. In `product/specs/connections-tab.md`, state that Enter on a row's Close or Delete control, or on a confirmation dialog button, performs only that control's action and never opens the row.
4. Run `$janissary/scripts/run.mjs check-diff`, then the focused client suite for `ConnectionList.test.tsx`.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry byte-for-byte.

## Tests

- `ConnectionList.test.tsx`: Enter on a focused **Close** button emits only the row's `close` intent and never `open`; the same button still closes on its activation click.
- `ConnectionList.test.tsx`: Enter on a focused **Delete** button opens the delete confirmation and never emits any row intent.
- `ConnectionList.test.tsx`: Enter on the confirmation dialog's focused **Cancel** button cancels without emitting an intent, and Enter on its focused **Delete** button after selecting the confirm option deletes without emitting `open`.
- `ConnectionList.test.tsx`: Enter on a focused row still emits that row's `open` intent, so the guard does not disable row activation.

## Out of scope

- The dialog's own focus, selection, Escape, and global keyboard contract.
- Close, delete, and open intent payloads, row identity, selection, two-click behavior, and row ordering.
- Other list surfaces, the connections popup, help pages, and user documentation.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Added a keydown target guard to the connections list container so only the list itself or a focused row handles navigation and Enter; focused action and dialog buttons no longer open the selected row.
- Added four focused cases covering Enter on Close, Delete, the confirmation dialog's Cancel and Delete buttons, and a focused row.
- Focused client suite passed for `ConnectionList.test.tsx`; `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and web tests.
- Updated `product/specs/connections-tab.md` for control-only Enter activation.
- No help or user-documentation change: the guides describe Enter opening rows and the controls themselves, not the interaction this fixes.
- Removed only the resolved backlog entry.
