# technical-debt

## ready

* Reduce the cognitive complexity of the keydown handler returned by `useFileNavigatorKeyDown()` in `web/src/useFileNavigatorKeyDown.ts` (line 46), reported at 17 against the allowed 15 in a file scoring 48.59 FTA across 86 lines. The returned closure is one flat run of early-return branches covering every key the file navigator tree handles — the rename-field bypass, the opener, ctrl/meta chords, Escape clearing selection and clipboard, Backspace/Delete, arrow/paging navigation, and printable-character type-ahead — with each branch repeating its own `preventDefault`/`stopPropagation` before doing its work. The Escape branch and the navigation branch are both cohesive enough to lift into local helpers without changing what the hook exports. The file is quiet, at two commits in the last 90 days. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against the keydown handler returned by `useFileNavigatorKeyDown()` in `web/src/useFileNavigatorKeyDown.ts`. Severity: **low**.

## development

## deferred

## declined
