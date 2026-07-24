# features

## ready

## development

* A kanban-style board summarizing all currently-open workspaced agents and harnesses, the way Vibe Kanban and amux's built-in kanban board let a user managing many parallel AI coding sessions see task/status at a glance instead of checking each session individually. Janissary's tab strip and fuzzy tab navigator (`product/specs/tab-navigator.md`) let a user jump to any tab, but there is no aggregate view of what each workspaced tab is working on and whether it's idle, busy, or blocked on a permission prompt. A new dockable tab (alongside the existing `notifications`/`schedules` dockable tabs) could list every workspaced agent/harness tab with its busy state and last activity. do this as a tab plugin with a new plugin architecture.

* Multi-user, read-only shared session viewing, the way tmux's multi-attach lets a second person view (and optionally drive) the same session, and Warp's Team Workflows share execution across a team. Janissary already ships a web client serving every tab over HTTP, but the spec surface (`product/specs/tabs.md`, `product/specs/connection.md`) describes a single-user session with no notion of a second, remote viewer watching a running harness or agent tab live — a natural extension given the app is already a served web app rather than a purely local terminal UI. Cool but low priority.

* Fuzzy full-text search over a tab's own scrollback/output, the way tmux-fuzzback, the `cy` "time-traveling" terminal multiplexer, and iTerm2's command-history browser (Shift-Cmd-;) let a user jump straight to a past command or its output. Janissary's `Ctrl+R` history picker (`product/specs/history.md`) only recalls previously *typed* commands, not the transcript's rendered output, so finding a past error message or a tool's result requires scrolling by eye. A search overlay over the transcript body — reusing the file navigator's `Cmd+P`/Quick Open-style fuzzy match — would let a user jump directly to a matching line in a tab's own history.

* extract harness transcripts directly from harness dot directories. useful for monitoring subagents.

* long term durable transcripts - send trascripts off to seperate github repo? other durable storage options? 

* Generate a set of given profiles derived from profiles used in other tools. research and clone. curated personas: researcher, critic, planner, summarizer. research and clone. Ambient background research persona that, when you mention an unfamiliar term/library/error, quietly researches it and drops a ready reference into a side tab, unasked. (Web-tool personas.)

* centralized model selection and usage statistics

* Supervisor/manager agent - a supervisor persona that receives a goal, fans work out, and aggregates the responses, decides next action, in a OODA loop. 

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

* Cross-agent shared memory store memory set/get KV any agent can read/write, distinct from per-agent context[]. This could be a redis/postgress integration.

*  Sage agent — a persona that maintains a running record of the product domain. interacts with specific storage mechanism like a DB (probably not git).

* Context-budget auto-summarization — when context[] grows large, a summarizer persona compacts it automatically.

* support monitor -> trigger -> action workflows. monitors are agent tasks that interact with web, files, databases to capture and summarize data. triggers are agent tasks that take monitor data and evaluate if the data meets some criteria. actions take data and affect some outcome. requires a way to encode and visualize entities and workflows, dataflows and outcomes. could be OODA loop instead Observers - Orienters - Deciders - Actors.

* integration plugin api to support data access and triggers from sources like chat, github. should be tooling around api calls not MCP protocal support. 

* Integration commands and ability to arbitrarily permit workspaces. a library of built-in connection commands (Slack, GitHub issues, HTTP) invokable through the sandboxed tool loop. Look for external libraries and tooling to adopt.

* Commit/git-hook trigger (n8n) — fire a review flow when a workspaced agent commits, wiring into the existing hook machinery.

* Adjacent-tool feature mining — point an agent at a set of analogous tools (exactly this exercise: CrewAI/LangGraph/n8n) and get back a deduped, categorized idea list with source links.

* Feature gap matrix — an agent builds and maintains a you-vs-competitors comparison table across a feature set, pulled from public sources

1. Port a curated slice of ECC's 278 skills/*.md into janissary's existing skills/ directory (today only perplexity-search and agent-merge-changes exist) — same "When to Use / How It Works / Examples" markdown format is directly reusable.

3. Import code-simplifier, code-explorer, silent-failure-hunter, and type-design-analyzer agents as ready-made personas for janissary's monitoring feature (monitor <persona>).

4. Bring in security-reviewer.md and the-security-guide.md content as the seed for a janissary "security" monitor persona that watches agent tabs for risky diffs.

5. Adapt tdd-guide.md into a monitor persona that nudges toward test-first workflows across any harness tab, not just Claude.

8. Adopt the docs-lookup.md agent pattern as a monitor persona specialized for janissary's own documentation/spec authoring workflow.

10. Adopt comment-analyzer.md and refactor-cleaner.md as lightweight "hygiene" monitor personas for long-running agent tabs.

15. Add a worktree gc-style janissary command that sweeps stale workspace clones left behind by closed harness tabs (referenced in harness.md Lifecycle but not automated today).

16. Build a lightweight state store (SQLite, mirroring ECC's schemas/state-store.schema.json) for janissary to track cross-session history: which profiles were launched when, which harnesses errored, cost/usage per tab — feeding history.md/transcript.md today's ad hoc state.

17. Add a status --markdown --write style command (from ECC's ecc status) that dumps a portable handoff snapshot of the current janissary session — open tabs, active monitors, schedules, sandbox state — for humans or another agent to pick up.

21. Port /model-route — a small heuristic that recommends a model tier by task complexity/budget — as a janissary harness-launch helper that pre-fills --model/--effort in the "new harness launch dialog" (harness.md).

28. Port the instinct system (instinct-status/instinct-import/instinct-export, confidence-scored learned patterns) as a janissary-level store of per-project "instincts" surfaced to any harness tab regardless of which binary is running — a harness-agnostic layer ECC doesn't have but janissary's multi-harness design is well-suited for.

31. Give janissary monitor personas access to ECC's /hookify idea: let a monitor, on spotting a repeated unwanted pattern, propose (not silently apply) a new sandbox/hook rule to prevent it next time.

34. Port multi-backend/multi-frontend/multi-plan/multi-execute command family as a janissary profile pattern: one profile entry per role (backend/frontend/plan), launched together and cross-monitored.


36. Port /loop-start//loop-status (managed autonomous loop with safety defaults: safe/fast modes, explicit stop conditions) as a janissary scheduling pattern layered on top of scheduling.md's existing schedule grammar — a "loop" is really a self-rescheduling command with a stop condition.

38. Port recursive-decision-ledger skill's idea — a running ledger of decisions made across loop iterations — as an artifact janissary writes per schedule/loop for later audit.

39. Evaluate importing AgentShield (ecc-agentshield npm package) directly as an optional janissary sandbox add-on for scanning agent-authored diffs/commands before they execute in a harness tab, rather than reimplementing.

40. Port the-security-guide.md's attack-vector/sandboxing checklist as source material for hardening janissary's own sandbox.md filesystem/network policy documentation and defaults.

* The editor tab (`product/specs/editor-tab.md`) has no multi-cursor editing, the way every mainstream IDE editor (VS Code, JetBrains, Sublime, Zed) treats simultaneous multi-point edits as table stakes — VS Code's Alt+Click adds a secondary cursor and Cmd/Ctrl+D selects the next occurrence of the current selection, letting several identical edits land in one pass. Janissary's editor tab spec describes only a single caret with ordinary click-to-position and drag-to-select. Adding multi-cursor support would mean extending the buffer model to track a list of carets/selections instead of one, plus the corresponding keyboard/mouse chords. Complexity: medium-high — touches the core buffer/selection model, not just a new keybinding.

* The editor tab (`product/specs/editor-tab.md`) has no go-to-definition, find-references, or file-wide symbol search, the way VS Code's language-server-backed IntelliSense jumps to a symbol's declaration (F12) or lists every reference to it. Janissary's editor is a plain-text buffer with only lexical syntax highlighting (Markdown/JS/TS/JSON) and no semantic understanding of the code — jumping to a definition means opening the file by hand and scrolling. Closing this gap even partially (e.g. a regex-based "jump to matching identifier in this file" rather than full language-server integration) would be a meaningfully smaller effort than true IntelliSense. Complexity: high for real language-server integration, medium for a lexical-only approximation.

* The file navigator tab (`product/specs/file-navigator-tab.md`) has no multi-select, the way VS Code's Explorer lets Ctrl/Cmd-click or the `workbench.list.multiSelectModifier` setting select several rows at once for a bulk move, delete, or drag. Janissary's spec states outright that "only a single row can be dragged at a time — the tree has no multi-select," so moving, deleting, or renaming several files at once requires repeating the action per file. Adding multi-select would touch the tree's selection state, its drag-and-drop handler, and the delete/rename confirmation dialogs to handle a list instead of one row. Complexity: medium.

* The database section (`product/specs/database.md`) has no visual schema browser, ER diagram, or editable data grid, the way DBeaver lets a user explore a database's tables/relationships as a diagram and edit query results directly in the grid instead of writing UPDATE statements by hand. Janissary's `db sqlite query` only renders an aligned text table of query results in the transcript — every read or write goes through hand-typed SQL, with no schema tree, no visual table browser, and no in-place cell editing. A minimal version (a read-only table/column browser reusing the file navigator's tree UI) would be far less effort than a full DBeaver-style ERD and editable grid. Complexity: medium for a schema browser, high for editable-grid support.

* The `browser` command (`product/specs/browser.md`) has no recorded-action codegen or a Trace-Viewer-style timeline, the way Playwright's Codegen turns a user's manual clicks/navigation into replayable script lines and its Trace Viewer lets a user scrub frame-by-frame through a recorded session's DOM snapshots, network requests, and console logs. Janissary's browser surface is `goto`/`content`/`eval`/`shot`/`open`/`close` only — there is no way to record a manual interaction into a reusable `browser` command sequence, and no timeline view of what a browser window did across a session. Complexity: high — Codegen-style recording needs an in-page action listener and command synthesis; a trace timeline needs persisted step-by-step state, not just the latest screenshot.

* The markdown tab (`product/specs/markdown-tab.md`) has no outline/heading jump list or backlinks between opened files, the way Obsidian's outline pane jumps between headings without scrolling and its backlinks pane shows every note that links to the current one. Janissary's markdown tab only renders the file and scrolls (arrows, Page Up/Down, mouse wheel) — there is no heading-based navigation panel, and `[[wikilink]]`-style cross-references between rendered files aren't tracked or shown even though relative links in the rendered HTML aren't resolved at all today. An outline panel derived from the file's own headings would be the smaller first step; backlinks would need a project-wide link index. Complexity: low-medium for an outline panel, medium-high for backlinks.

* The `schedules` tab (`product/specs/scheduling.md`) has no calendar/timeline view or failure-retry handling, the way Cronicle's web UI shows a visual multi-select calendar widget for authoring a schedule and a run-history timeline with automatic retries and alerts on failure. Janissary's schedules tab is a flat table sorted by next-run time, and a fired command that errors is recorded like any other output with no distinct failure marker, no retry, and no alert. A "last run failed" indicator on each row (reusing the notification system's existing rate-limited/error detection patterns) would be a smaller first step than a full calendar authoring UI. Complexity: medium.

* The reporting tabs monitors write to (`product/specs/monitoring.md`) have no historical/graphed view of a monitor's own activity over time, the way Grafana renders time-series graphs with configurable thresholds and alerting on top of accumulating metrics. A monitor's reporting tab shows only a live feed of suggestions/summaries plus a running byte-size counter — there's no charted view of, say, suggestion frequency or flush-to-flush size growth across a session, so noticing a monitor that's degrading (going quiet, or ballooning in context size) means reading the raw feed by eye. A simple sparkline next to the existing byte counter, reusing data already tracked per flush, would be a modest first step short of a full Grafana-style dashboard. Complexity: medium.

* Janissary's tab strip (`product/specs/tabs.md`, `product/specs/sidebars.md`) has no split-pane view showing two tabs side by side, the way tmux and Zellij split a single terminal window into multiple simultaneously-visible panes. Today only one central tab is visible at a time — the left/right sidebars dock the file navigator, notifications, or schedules tab alongside it, but two ordinary agent or harness tabs can never be viewed side by side without switching between them. Supporting even a single fixed horizontal or vertical split of the center tab area (independent of the existing sidebar docking) would let a user watch two harnesses or compare an agent's transcript against a file at once. Complexity: high — the tab-strip/active-tab model assumes exactly one visible central tab throughout the app.

* The ssh tab (`product/specs/ssh-tab.md`) has no session logging to disk, the way iTerm2's per-profile "Automatically Log Session Input to Files" setting captures a session's raw I/O for later audit, independent of on-demand scrollback. Janissary's spec states plainly that ssh tabs "get no screen reader either" and are excluded from the automatic harness-recording that named-harness tabs get (`product/specs/harness-recording.md`) — a remote session's output is gone the moment its tab closes, with no way to review what happened on a host after the fact. Extending the existing asciicast recording mechanism to ssh tabs (the same lazy-file, PTY-lifetime-scoped approach harness tabs already use) would close this without a new recording format. Complexity: low-medium — the recording plumbing already exists for harness tabs; this is mostly widening its scope.

## deferred

* Jump-to-previous/next-prompt transcript navigation, the way iTerm2's Shift+Cmd+Up/Down moves between shell prompts rather than scrolling line-by-line. Janissary's transcript scrolling (`product/specs/keyboard-navigation.md`) only scrolls by line, page, or with acceleration — there is no chord that jumps directly to the previous or next command boundary in a tab's transcript, which would be a lighter addition on top of the existing scroll model (each `LogEntry`'s prompt line is already a natural jump target). Determination: neat but scrolling works fine for now and isn't a front line feature.


* AI-generated, descriptive workspace names for `agent -w`/`harness -w` launches, the way amux auto-generates branch names and commit messages via an LLM call so parallel worktrees are self-describing without the user picking a name. Today a workspaced agent's directory is named after its tab label — either a random pool name (`product/specs/agents.md`) or a user-chosen `as <label>` — with no connection to the task it's actually doing. Optionally deriving the workspace/branch name from the agent's first prompt would make a long tab strip of parallel workspaced agents easier to tell apart at a glance. Determination: LLM in the application is difficult, now we just wrap LLM.


* Git-worktree-based workspace provisioning, the way amux, Claude Squad, and Conductor isolate parallel coding agents. Today `agent -w`/`harness -w` does a full `git clone` of `origin` into `.janissary/workspace/<name>/` (see `product/specs/workspaced-agent.md`), which is slower to provision and heavier on disk than a `git worktree add`, which shares the same object store and is near-instant to create. Adopting worktrees for the disposable clone step would speed up launching parallel workspaced agents/harnesses and reduce their footprint, while keeping the existing sandbox/isolation model unchanged. Determination: maybe when cloning gets slow there could be a worktree option but this makes sandboxing harder.

* A floating, transient terminal overlay for a quick one-off shell command, the way Zellij's floating panes let a user pop open a temporary pane without disturbing the current layout, then dismiss it. Janissary's closest equivalent is PTY takeover (`product/specs/shell.md`), which replaces the whole tab body for an interactive program, or opening a whole new tab — there is no lightweight way to run one quick command in a small overlay without leaving the current tab's context or committing to a new tab. Determinination: nope

* Reusable, parametrized command "workflows" invocable from a command palette, the way Warp's Team Workflows turn a common command into a shared, versioned, named primitive any user can run and tune. This is distinct from janissary's existing `profiles/` (which launch a whole tab topology — agents, harnesses, layout) and `ai/tasks/*.md` (agent prompts run via the task picker, `product/specs/task-picker.md`): a workflow would be a lightweight, parametrized single-command template (e.g. a shell one-liner with placeholders) saved and invoked inline in any tab's command bar, without spinning up a new tab. Determination: nope

* An in-app diff/merge review UI for a workspaced agent's changes, comparable to Conductor's per-worktree result view and amux's "smart merging" (auto-commit and merge cleanup across parallel branches). Janissary can run any number of `agent -w`/`harness -w` tabs, each with its own git clone (`product/specs/workspaced-agent.md`), but has no way to view a diff of what a given workspace changed, or to merge/cherry-pick it back into the root repo, without leaving the app and inspecting the clone directories by hand. A `workspace diff <label>` command opening a read-only diff view (reusing the editor tab's syntax highlighting) would close this gap. Determination: nope users should not need to know git so intimately

* A saved directory of SSH hosts with tags/groups and one-click connect, the way Termius and Royal TSX maintain a host list with saved keys and connection options instead of retyping a destination each time. Janissary's `ssh <destination> [options]` (`product/specs/ssh-tab.md`) is a thin passthrough to the real `ssh` binary with no saved-host concept — every connection is typed from scratch, with tab-completion only covering already-open ssh tabs' labels/destinations, not a saved list of hosts never yet connected to in this session. Determination: Out of scope at the moment


