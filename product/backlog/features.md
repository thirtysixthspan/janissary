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


## deferred

* Jump-to-previous/next-prompt transcript navigation, the way iTerm2's Shift+Cmd+Up/Down moves between shell prompts rather than scrolling line-by-line. Janissary's transcript scrolling (`product/specs/keyboard-navigation.md`) only scrolls by line, page, or with acceleration — there is no chord that jumps directly to the previous or next command boundary in a tab's transcript, which would be a lighter addition on top of the existing scroll model (each `LogEntry`'s prompt line is already a natural jump target). Determination: neat but scrolling works fine for now and isn't a front line feature.


* AI-generated, descriptive workspace names for `agent -w`/`harness -w` launches, the way amux auto-generates branch names and commit messages via an LLM call so parallel worktrees are self-describing without the user picking a name. Today a workspaced agent's directory is named after its tab label — either a random pool name (`product/specs/agents.md`) or a user-chosen `as <label>` — with no connection to the task it's actually doing. Optionally deriving the workspace/branch name from the agent's first prompt would make a long tab strip of parallel workspaced agents easier to tell apart at a glance. Determination: LLM in the application is difficult, now we just wrap LLM.


* Git-worktree-based workspace provisioning, the way amux, Claude Squad, and Conductor isolate parallel coding agents. Today `agent -w`/`harness -w` does a full `git clone` of `origin` into `.janissary/workspace/<name>/` (see `product/specs/workspaced-agent.md`), which is slower to provision and heavier on disk than a `git worktree add`, which shares the same object store and is near-instant to create. Adopting worktrees for the disposable clone step would speed up launching parallel workspaced agents/harnesses and reduce their footprint, while keeping the existing sandbox/isolation model unchanged. Determination: maybe when cloning gets slow there could be a worktree option but this makes sandboxing harder.

* A floating, transient terminal overlay for a quick one-off shell command, the way Zellij's floating panes let a user pop open a temporary pane without disturbing the current layout, then dismiss it. Janissary's closest equivalent is PTY takeover (`product/specs/shell.md`), which replaces the whole tab body for an interactive program, or opening a whole new tab — there is no lightweight way to run one quick command in a small overlay without leaving the current tab's context or committing to a new tab. Determinination: nope

* Reusable, parametrized command "workflows" invocable from a command palette, the way Warp's Team Workflows turn a common command into a shared, versioned, named primitive any user can run and tune. This is distinct from janissary's existing `profiles/` (which launch a whole tab topology — agents, harnesses, layout) and `ai/tasks/*.md` (agent prompts run via the task picker, `product/specs/task-picker.md`): a workflow would be a lightweight, parametrized single-command template (e.g. a shell one-liner with placeholders) saved and invoked inline in any tab's command bar, without spinning up a new tab. Determination: nope

* An in-app diff/merge review UI for a workspaced agent's changes, comparable to Conductor's per-worktree result view and amux's "smart merging" (auto-commit and merge cleanup across parallel branches). Janissary can run any number of `agent -w`/`harness -w` tabs, each with its own git clone (`product/specs/workspaced-agent.md`), but has no way to view a diff of what a given workspace changed, or to merge/cherry-pick it back into the root repo, without leaving the app and inspecting the clone directories by hand. A `workspace diff <label>` command opening a read-only diff view (reusing the editor tab's syntax highlighting) would close this gap. Determination: nope users should not need to know git so intimately

* A saved directory of SSH hosts with tags/groups and one-click connect, the way Termius and Royal TSX maintain a host list with saved keys and connection options instead of retyping a destination each time. Janissary's `ssh <destination> [options]` (`product/specs/ssh-tab.md`) is a thin passthrough to the real `ssh` binary with no saved-host concept — every connection is typed from scratch, with tab-completion only covering already-open ssh tabs' labels/destinations, not a saved list of hosts never yet connected to in this session. Determination: Out of scope at the moment


