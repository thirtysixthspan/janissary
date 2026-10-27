# Preserve hidden-tab move ordering while docked

**Complexity: 2/10** — one mate-selection condition in the existing reorder operation, with a focused regression test and spec corrections. No new state or command behavior is needed.

## Goal

Keep a hidden managed system tab's `tab move` position relative to the center tabs in its group and pane, even while it is docked. Moving it must not reorder unrelated sidebar entries, and it must remain hidden.

## Approach

Select the hidden target's center-strip mates before applying the ordinary visible-docked-tab rule. Continue to include the target itself, and leave visible docked tabs ordered among every tab on their sidebar. This follows the hidden-tab placement rule already recorded in the arranging-tabs plan.

## Implementation

1. **`src/tab/arrange.ts`** — when the target is hidden, select itself and center action tabs in the same group and pane before checking whether it is docked.
2. **`src/tab/arrange.test.ts`** — add a hidden docked system-tab regression case that moves it among center mates, preserves its hidden and docked state, and leaves unrelated sidebar ordering unchanged; retain coverage of visible docked ordering.
3. **`product/specs/application-commands.md` and `product/specs/tabs.md`** — specify the hidden-tab exception to the ordinary docked-tab sidebar ordering rule.

## Tests

- A hidden system tab docked beside unrelated sidebar entries moves within the center tabs of its group and pane; its hidden state and dock placement remain, and sidebar entries keep their order.
- A visible docked tab continues to reorder among all tabs on its sidebar regardless of group.

## Out of scope

- Changing visible docked-tab ordering, tab focus, docking, pane placement, or hidden-tab lifecycle.
- Changing user documentation or help pages, which do not describe this hidden-tab ordering case.
