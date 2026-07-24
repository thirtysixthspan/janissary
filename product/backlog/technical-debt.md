# technical-debt

## ready

## development

## deferred

* update the web and server code, css, and all documentation to switch from using file tree (or similar) and begin using file navigator. — deferred: complexity 9/10, sweeping rename across the dedicated `src/file-tree/` backend module, wire-protocol type names in `protocol.ts` and the message handler, ~20 web components/hooks, CSS classes, ~15 spec files, help.md, CHANGELOG.md, and public documentation, plus all colocated tests.

* refactor react components to switch from using file tree (or similar) and begin using file navigator (or similar). — deferred: complexity 8/10, 24 component/hook/test files under `web/src/` carry "FileTree" naming (346 total occurrences), with 5 external consumer files (Sidebar.tsx, SchedulesTab.tsx, NotificationsTab.tsx, ViewTabBody.tsx/test) and a shared `FileTreeRow` type imported from `@shared/protocol` that a components-only rename can't cleanly resolve without also touching backend protocol code.
