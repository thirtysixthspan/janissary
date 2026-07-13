
## ready



## in development

4. Supervisor/manager agent (LangGraph supervisor, n8n AI Agent Tool) — a built-in supervisor persona that receives a goal, fans work out with broadcast request, and aggregates the responses.

9. Agent state checkpoints (LangGraph checkpointing) — checkpoint <name> snapshots a tab's transcript + context + queue + cwd as a restore point.

10. Time-travel rewind (LangGraph time-travel) — checkpoint restore <name> rewinds an agent and lets it continue from a prior snapshot.

12. Durable flows across relaunch (LangGraph persistence) — persist flow-execution state so --relaunch resumes an in-progress pipeline (today harness schedules are memory-only).

13. Cross-agent shared memory store (LangGraph store, CrewAI long-term memory) — a project-scoped memory set/get KV any agent can read/write, distinct from per-agent context[].

14. Entity memory dossier (CrewAI entity memory) — a persona that maintains a running record of entities (people, files, decisions) seen across transcripts.

15. Long-term recall injection (CrewAI memory) — retrieve relevant past-session facts and prepend them before an ACP turn (mirroring janissary's own memory feature, but for the managed agents).

16. Context-budget auto-summarization (LangGraph state pruning) — when context[] grows large, a summarizer persona compacts it automatically.

17. Approval breakpoint before a step (LangGraph interrupt, n8n approval node) — a step marked approve pauses and posts an approval prompt to the notifications tab.

19. Agent-raised human question (CrewAI human_input) — an agent can ask, surfacing a notification that blocks its queue until answered, with the answer routed into its context.

 Triggers & event automation — n8n triggers, CrewAI @listen

21. Webhook trigger tab (n8n webhook) — a tab binding a loopback webhook; an inbound request dispatches a configured command/broadcast.
22. File-watch trigger (n8n) — fire commands when a watched file/dir changes (extends the existing editor-diff→monitor feed into a general trigger).
23. Inter-agent event listeners (CrewAI @listen) — an agent subscribes to another's "emit" (e.g. task-complete) and auto-runs a command in response.
24. Chat/message trigger (n8n chat trigger) — treat an inbound msg of a given kind as the trigger that starts a flow.
25. Commit/git-hook trigger (n8n) — fire a review flow when a workspaced agent commits, wiring into the existing hook machinery.

30. model <name> switch command (n8n model selection) — extend profile model into an interactive command that restarts a harness/ACP session on a new model.

36. Integration commands (n8n 400+ nodes) — a library of built-in connection commands (Slack, GitHub issues, HTTP) invokable through the sandboxed tool loop.

39. Profile/flow template gallery (n8n templates) — profile new <template> scaffolds common team shapes (research, code-review, writing crews).

41. Ready-made persona role library (CrewAI roles) — ship curated personas: researcher, critic, planner, summarizer.

50. Persona eval/benchmark harness (LangSmith eval, CrewAI training) — run a persona against fixture transcripts and score its suggestions, to tune personas over time.

24. Ambient background research — a persona that, when you mention an unfamiliar term/library/error, quietly researches it and drops a ready reference into a side tab, unasked. (Web-tool personas.)

27. Auto-draft, human-polish — agents produce complete first drafts (code, prose, plans) so your attention goes to editing, not starting from blank — the highest-value split for creative work.

3. Adjacent-tool feature mining — point an agent at a set of analogous tools (exactly this exercise: CrewAI/LangGraph/n8n) and get back a deduped, categorized idea list with source links.

4. Category landscape scan — an agent surveys a product category, clusters the players by approach, and names the whitespace nobody's covering.
5. Prior-art check before building — before you commit to feature X, an agent finds who's done it, how, and what went wrong, so you don't rediscover known dead ends.

1. Competitor changelog watcher — a scheduled agent that polls competitors' changelogs, docs, and pricing pages and reports only the diffs since last check, so you learn what shipped without reading anything. (Schedule + web_fetch persona.)

2. Feature gap matrix — an agent builds and maintains a you-vs-competitors comparison table across a feature set, pulled from public sources, refreshed on a cadence.


## deferred

### fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened

### harness status

Tracked in plans/small-issues.md as "agent status should be synced to and accurately reflect harness status." The full issue as written asks for status that distinguishes the harness actively thinking from idling at its own prompt — that would require parsing each harness's own terminal output (spinners, prompts), which differs per CLI and is separate, larger work. This PR fixes the coarser, currently-wrong signal instead: busy (a harness process is running) vs. not busy (no harness process running at all).

## agent triggers
- file changes
- transcript triggers
