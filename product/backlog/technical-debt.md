# technical-debt

## ready

* Pull the docked-tab selection rules out of `web/src/Sidebar.tsx` into a hook beside it: the component derives its docked entries inline at line 72, then runs two effects that decide which one is showing — lines 76-80 select whichever tab was not in the previous label set, lines 84-87 let a profile's declared `focusView` override that — and lines 90-92 resolve the current entry, its strip index, and the docked plugin list, all before any markup is reached. That is §5 (components render, they do not decide): "which docked tab is visible" is the sidebar's actual behavior, and it can only be exercised by rendering the whole sidebar, including `FileNavigatorTab` and `DockedPluginBody`. What the shape hides is visible in the same lines — `entries` is rebuilt as a fresh array on every render and then listed as a dependency of both effects, so both re-run on every render rather than when the docked set changes. `Sidebar.tsx` is among the most churned files in `web/src/`, so every future dock behavior lands in this same body. Extract the entry derivation and both effects into `useSidebarSelection(tabs, side, focusView)` in a new module, memoize the entry list there, and leave `Sidebar.tsx` with the resize handlers and the markup. Its props and its two exports are unchanged, so none of the files that render it are affected. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/Sidebar.tsx`. Severity: **medium**.

## development

## deferred

## declined
