# issues

## ready

* `product/specs/harness.md` and `product/specs/keyboard-navigation.md` (introduced by PR #1129, commit `5e43cb5b`) both say that while a terminal's Shift+drag selection is held, Escape "still reaches the harness as its cancel key" alongside clearing the selection. That contradicts the actual implementation (`web/src/shared/terminal/useSelectionLayer.ts`): the container-level Escape handler calls `preventDefault()` and only clears the selection, so Escape is fully consumed and never reaches the harness while a selection is held — matching the original plan's design decision ("Escape is claimed only while a selection is held"). Fix the wording in both specs to say Escape is consumed, not forwarded, while a selection is held.

## development

## deferred

## declined
