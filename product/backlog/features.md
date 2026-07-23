# features

## ready

* An editor tab can have github syncing enabled so that file is always up to date with the remote origin, and any saves are committed to origin, rebasing and conflicts are automatically managed. this could run against a file on any branch. the branch would be determined by the branch of the file navigator or agent that launched the editor. the metadata row would have a github icon right floated to enable or disable git syncing in the editor. github syncing would be disabled by default. git syncing could be enabled by default for a set of file paths listed in the janissary.config file.

## development

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

37. Adopt the santa-loop.md/loop-operator.md bounded-loop safety pattern (explicit stop conditions, checkpoint gates) as guardrails for any janissary schedule entry that reschedules itself indefinitely.

38. Port recursive-decision-ledger skill's idea — a running ledger of decisions made across loop iterations — as an artifact janissary writes per schedule/loop for later audit.

39. Evaluate importing AgentShield (ecc-agentshield npm package) directly as an optional janissary sandbox add-on for scanning agent-authored diffs/commands before they execute in a harness tab, rather than reimplementing.

40. Port the-security-guide.md's attack-vector/sandboxing checklist as source material for hardening janissary's own sandbox.md filesystem/network policy documentation and defaults.

41. Adopt ECC's "curl credentials kept out of argv" and "gateguard gates force/path checkouts as destructive" hardening fixes (from the 2.0.0 changelog) as concrete review items for janissary's own sandbox/shell command handling in src/sandbox and src/shell.


## deferred
