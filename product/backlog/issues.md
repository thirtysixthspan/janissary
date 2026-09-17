# issues

## ready

* when commiting files to origin in the file navigator or in the editor, if there are files that are not being committed, they must be stashed before any git pull --rebase is executed, and then applied back afterwards.

* the commit to origin buttons tooltip in the editor should also mention the target branch the same way that the commit to master button in the file navigator does.

* `product/specs/harness.md` and `product/specs/keyboard-navigation.md` (introduced by PR #1129, commit `5e43cb5b`) both say that while a terminal's Shift+drag selection is held, Escape "still reaches the harness as its cancel key" alongside clearing the selection. That contradicts the actual implementation (`web/src/shared/terminal/useSelectionLayer.ts`): the container-level Escape handler calls `preventDefault()` and only clears the selection, so Escape is fully consumed and never reaches the harness while a selection is held — matching the original plan's design decision ("Escape is claimed only while a selection is held"). Fix the wording in both specs to say Escape is consumed, not forwarded, while a selection is held.

## development

## deferred

## declined
