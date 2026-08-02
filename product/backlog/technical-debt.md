# technical-debt

## ready


## development

## deferred

* Split `src/tab/manager.ts` and retire its parallel per-label maps: the file is 451 lines and opens with `/* eslint-disable max-lines */`, suppressing the project's own 200-line guideline rather than following the guideline's stated remedy of extracting a cohesive module. It also still holds `cwd`, `busy`, `context`, and `queue` as separate `Map`/`Set` keyed by label — the exact "parallel maps keyed by label" pattern architecture principle 2 says to replace with state owned by the agent's own session object, now simply relocated from `Controller` to `TabManager`. Extract the split-pane/focus-selection logic (`repairSelections`, `focusedPane`, `recentLabel`, `moveTabToOtherPane`, `placeProfileTabs`) into its own module and move the per-label maps onto the tab object, then delete the suppression. Severity: **high**. — deferred: complexity 9/10, requires a cross-cutting runtime-state migration in addition to the module extraction.

## declined
