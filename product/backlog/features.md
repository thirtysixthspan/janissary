# features

## ready

* a new search tab implemented as a new plugin that allows the entire project repository to be searched efficently for expressions matching plain text or regex. it should provide a table of results that can be keyboard or mouse navigated, eaach entry showing the match and surrounding context lines with a header that includes file path and line number. clicking on the entry or hitting return on the entry will cause that file to be openned in a new editor tab with the matching line in the center of the window. 

* A new type of AI task that runs in a workspaced agent tab, can spawn and terminate new agent tabs and harness tabs as part of doing its work. the first task would be to call plan-a-new-feature, then build-a-feature, then pull-request-review, then work-an-issue on the pull-request backlog until the backlog is clear. 

* sql database plugin that offers table, visualization, crud and query on sql databases including local sqllite databases. The database feature (`product/specs/database.md`, `product/specs/connection.md`) is a SQLite command surface that renders row queries as aligned text tables, a schema/object navigator plus a data grid with filtering, ordering, editing, refresh, export, and SQL generation. a dockable SQLite schema browser and table data view with safe cell editing, filters, refresh, and generated SQL actions. 

* Given that provising a workspace can be slow due to cloning, add a provising indicator in the metadata bar of agents and harnesses, both local and remote. The indicator should be animated and stop and disappear when the provisioning is complete.

## development



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* integrate https://github.com/nolabs-ai/nono to replace ai and browser sandboxes.

* long term durable transcripts - send trascripts off to seperate github repo? other durable storage options? 

* centralized model selection and usage statistics

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

* A saved directory of SSH hosts with tags/groups and one-click connect, the way Termius and Royal TSX maintain a host list with saved keys and connection options instead of retyping a destination each time. Janissary's `ssh <destination> [options]` (`product/specs/ssh-tab.md`) is a thin passthrough to the real `ssh` binary with no saved-host concept — every connection is typed from scratch, with tab-completion only covering already-open ssh tabs' labels/destinations, not a saved list of hosts never yet connected to in this session. Determination: Out of scope at the moment

* An in-app diff/merge review UI for a workspaced agent's changes, comparable to Conductor's per-worktree result view and amux's "smart merging" (auto-commit and merge cleanup across parallel branches). Janissary can run any number of `agent -w`/`harness -w` tabs, each with its own git clone (`product/specs/workspaced-agent.md`), but has no way to view a diff of what a given workspace changed, or to merge/cherry-pick it back into the root repo, without leaving the app and inspecting the clone directories by hand. A `workspace diff <label>` command opening a read-only diff view (reusing the editor tab's syntax highlighting) would close this gap. Determination: nope users should not need to know git so intimately

* Multi-user, read-only shared session viewing, the way tmux's multi-attach lets a second person view (and optionally drive) the same session, and Warp's Team Workflows share execution across a team. Janissary already ships a web client serving every tab over HTTP, but the spec surface (`product/specs/tabs.md`, `product/specs/connection.md`) describes a single-user session with no notion of a second, remote viewer watching a running harness or agent tab live — a natural extension given the app is already a served web app rather than a purely local terminal UI. Determination: Cool but low priority.

* A floating, transient terminal overlay for a quick one-off shell command, the way Zellij's floating panes let a user pop open a temporary pane without disturbing the current layout, then dismiss it. Janissary's closest equivalent is PTY takeover (`product/specs/shell.md`), which replaces the whole tab body for an interactive program, or opening a whole new tab — there is no lightweight way to run one quick command in a small overlay without leaving the current tab's context or committing to a new tab. Determinination: nope

* Reusable, parametrized command "workflows" invocable from a command palette, the way Warp's Team Workflows turn a common command into a shared, versioned, named primitive any user can run and tune. This is distinct from janissary's existing `profiles/` (which launch a whole tab topology — agents, harnesses, layout) and `ai/tasks/*.md` (agent prompts run via the task picker, `product/specs/task-picker.md`): a workflow would be a lightweight, parametrized single-command template (e.g. a shell one-liner with placeholders) saved and invoked inline in any tab's command bar, without spinning up a new tab. Determination: nope

* The editor (`product/specs/editor-tab.md`) only supports one caret and one active selection, while VS Code's core editor supports multiple independent cursors for simultaneous edits and column selection. Closing this gap would add multi-caret creation (including keyboard and mouse gestures), rectangular selection, per-caret insertion/deletion, and coherent undo, rendering, and paste behavior. Complexity: medium-high. Determination: nope

* The editor (`product/specs/editor-tab.md`) has syntax highlighting and fuzzy search within the current buffer but no language-aware symbol navigation, while VS Code combines language services with Go to Symbol, Go to Definition/References, Peek, Outline, and breadcrumbs. Closing this gap would add a pluggable language-service/indexing layer and editor commands for symbol search, definition/reference jumps, and the current file's symbol outline. Complexity: high. Determination: the editor is general purpose not specifically a code editor.

* The browser automation feature (`product/specs/browser.md`) exposes goto, rendered content, eval, and screenshots but does not retain an inspectable action history or browser diagnostics; Playwright Trace Viewer provides a timeline with DOM snapshots, screenshots, console messages, network requests, and action details. Closing this gap would add an opt-in per-window trace/inspection mode with a replayable timeline and links from each action to its DOM, console, network, and screenshot evidence. Complexity: high. Determination: low value at this point in time.

* The shell transcript (`product/specs/shell.md`, `product/specs/transcript.md`) is line-oriented and can rerun a prompt by double-click, but it does not expose command-level duration, exit status, or a selectable command-plus-output block; iTerm2's shell integration supplies command selection and an info panel with duration, status, resend, copy, share, and named marks. Closing this gap would track command boundaries and completion metadata, then add block selection with copy/rerun/bookmark actions and a compact command-info view. Complexity: medium. 
