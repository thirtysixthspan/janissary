# technical-debt

## ready

## development

## deferred

* Remove workspace clones asynchronously through one reference-counted release path, so closing a workspaced tab stops freezing every other tab for the length of a recursive delete. — deferred: complexity 8/10, changes async filesystem teardown, reference-count release semantics, and shutdown ordering while guarding workspace-path reuse races.

* Delete the web client's leftover app-level command-line refs, which nothing has attached since the core command bar was removed, and route focus and text insertion through the per-tab bar handles that replaced them. — deferred: complexity 8/10, changes command-bar registration and rewires focus, picker, paste, sidebar drag/drop, and app composition across many client modules.

* Back off and coalesce system-schedule retries while the system shell cannot start, so one failing schedule stops raising a desktop notification and a fresh shell launch every second. — deferred: complexity 8/10, requires coordinated retry state, scheduler overlap control, shell-failure notification suppression, and sustained-failure integration tests.

* Mint each tab's never-reused identity when the tab is created, and have delayed launch callbacks check it instead of the tab's label, so a relaunched tab with the same name is never closed or finished by its predecessor's timers. — deferred: complexity 8/10, spans tab identity types, multiple launch pathways, delayed callbacks, and broad fixture updates across subsystems.

* Lift the close-tab rules out of the App component into a hook and a pure decision function beside it, so the terminal-exit, last-tab, system-shell, and unsaved-work rules can be tested without rendering the whole app. — deferred: `ai/tasks/hygiene/improve-modularity.md` blocked this target because its required extraction verification found App's FTA score rose from 56.62 to 58.13 despite fewer counted lines.

Existing Debt: The App component decides how a tab closes in its own body, sending a terminal-exit close straight through, turning a close of the last counted tab into the quit prompt via `closeQuitsApp`, skipping the save guard for the system shell, and otherwise asking the save guard before it sends `closeTab`, which §5 (components render, they do not decide) puts in the wrong place, and the only tests of that cascade render all of App. Severity: 5/10

Existing Risk: 5/10 - With no seam to call, the sidebar already closes docked tabs with its own bare `closeTab` send that drops the terminal-exit reason a docked plugin body passes up, so a docked shell tab whose process exits is closed as an ordinary user close that skips the server's check that its terminal really stopped, and the next close path added will most likely fork the same way.

Proposal Risk: 2/10 - The decision becomes a function anyone can call, but the sidebar keeps its own close path until a follow-up wires it in, and App's terminal-exit branch has no test today, so a slip while moving that branch would go unnoticed until a shell tab failed to close on exit.

Proposal: `web/src/App.tsx` builds `closeTab` with `useCallback` from `tabs`, `client`, `guardedOpenQuitConfirm`, and `guardRef`. Extract the branch logic into a new `web/src/close-tab-rules.ts` as a pure `closeTabAction(tabs, index, reason)` that returns what should happen: nothing for a missing tab, a terminal-exit close carrying the pty id, the quit prompt when `closeQuitsApp(tabs, index)` holds, a direct close for a `systemShell` tab, or a guarded close for everything else. Add a new `web/src/useCloseTab.ts` hook that takes `client`, `tabs`, `guardedOpenQuitConfirm`, and `guardRef`, calls `closeTabAction`, performs the result (including the `guardRef.current?.(index)` check for a guarded close), and returns the same `(index, reason?) => void` callback. App then calls `useCloseTab(...)` and passes the result on exactly as it does now, to `web/src/AppMain.tsx` (which hands it to the center area, the reporting section, and `MountedViewLayers`) and to `useCmdW`. App's only export and its props don't change, so no import path moves. Keep the change to App: `web/src/Sidebar.tsx` sends `closeTab` directly from its tab strip and from `DockedPluginBody`'s `onClose`, and routing those through the hook is a follow-up that has to thread the callback through `web/src/AppShell.tsx`. `web/src/App.test.tsx` pins the system-shell close and the last-tab quit prompt from both the strip's × and Cmd+W, and `web/src/CloseSaveGuard.test.tsx` and `web/src/CloseSaveGuard.named-close.test.tsx` pin the guarded path; none needs an edit, and all must keep passing. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/App.tsx`.

## declined
