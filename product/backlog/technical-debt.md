# technical-debt

## ready

* Reduce the cognitive complexity of `moveToOtherPane()` in `src/tab/split.ts` (line 41), reported at 19 against the allowed 15 in a file scoring 46.30 FTA across 75 lines. The function moves one tab to the opposite center pane and then decides which tab is restored into the pane it left. Almost all the complexity sits in the four-way fallback at lines 77-85, a nested ternary that tries the previous active tab, then the previous secondary, then focus history, then the nearest eligible tab — with the same three-part eligibility guard spelled out inline for the first two. Lifting that choice into a local `restoredLabel()` helper, or flattening it to early returns, leaves the exported signature untouched. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `moveToOtherPane()` in `src/tab/split.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `openProfileEntries()` in `src/profile/agent-opener.ts` (line 31), reported at 16 against the allowed 15 in a file scoring 48.64 FTA across 85 lines. The function runs the whole profile-launch sequence in one body: closing matching tabs, looping over entries to open each as a harness or agent tab with its own skip-on-error path, opening files/editors/view tabs, reordering each touched group by authored number, setting focus, then starting notifications, schedules, layout, and monitors, and finally assembling the summary message from three optional parts. It is only one point over the limit, but 17 commits touched it in the last 90 days, so it keeps accreting steps and will not stay at 16. The entry loop body, the group-reorder block, and the message assembly are each self-contained enough to extract in place. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `openProfileEntries()` in `src/profile/agent-opener.ts`. Severity: **medium**.

* Reduce the cognitive complexity of the keydown handler returned by `useFileNavigatorKeyDown()` in `web/src/useFileNavigatorKeyDown.ts` (line 46), reported at 17 against the allowed 15 in a file scoring 48.59 FTA across 86 lines. The returned closure is one flat run of early-return branches covering every key the file navigator tree handles — the rename-field bypass, the opener, ctrl/meta chords, Escape clearing selection and clipboard, Backspace/Delete, arrow/paging navigation, and printable-character type-ahead — with each branch repeating its own `preventDefault`/`stopPropagation` before doing its work. The Escape branch and the navigation branch are both cohesive enough to lift into local helpers without changing what the hook exports. The file is quiet, at two commits in the last 90 days. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against the keydown handler returned by `useFileNavigatorKeyDown()` in `web/src/useFileNavigatorKeyDown.ts`. Severity: **low**.

## development

## deferred

## declined
