# technical-debt

## ready

## development

## deferred

* Remove workspace clones asynchronously through one reference-counted release path, so closing a workspaced tab stops freezing every other tab for the length of a recursive delete. — deferred: complexity 8/10, changes async filesystem teardown, reference-count release semantics, and shutdown ordering while guarding workspace-path reuse races.

* Delete the web client's leftover app-level command-line refs, which nothing has attached since the core command bar was removed, and route focus and text insertion through the per-tab bar handles that replaced them. — deferred: complexity 8/10, changes command-bar registration and rewires focus, picker, paste, sidebar drag/drop, and app composition across many client modules.

* Back off and coalesce system-schedule retries while the system shell cannot start, so one failing schedule stops raising a desktop notification and a fresh shell launch every second. — deferred: complexity 8/10, requires coordinated retry state, scheduler overlap control, shell-failure notification suppression, and sustained-failure integration tests.

* Mint each tab's never-reused identity when the tab is created, and have delayed launch callbacks check it instead of the tab's label, so a relaunched tab with the same name is never closed or finished by its predecessor's timers. — deferred: complexity 8/10, spans tab identity types, multiple launch pathways, delayed callbacks, and broad fixture updates across subsystems.

## declined
