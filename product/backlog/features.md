# features

## ready

* create a cli command to generate a named profile from the current layout and configuration of the UI.

## development

* Generate a set of given profiles derived from profiles used in other tools. research and clone. curated personas: researcher, critic, planner, summarizer. research and clone. Ambient background research persona that, when you mention an unfamiliar term/library/error, quietly researches it and drops a ready reference into a side tab, unasked. (Web-tool personas.)

* centralized model selection and usage statistics

* Supervisor/manager agent - a supervisor persona that receives a goal, fans work out, and aggregates the responses, decides next action, in a OODA loop. 

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

* Cross-agent shared memory store memory set/get KV any agent can read/write, distinct from per-agent context[]. This could be a redis/postgress integration.

*  Sage agent — a persona that maintains a running record of the product domain. interacts with specific storage mechanism like a DB (probably not git).

* Context-budget auto-summarization — when context[] grows large, a summarizer persona compacts it automatically.

* mechanism to create an questions/approval dialog in Janissary from a harness, acp, shell script. This could be an external API provided as skills to the agents. the dialog would show the agent asking the question.

* support monitor -> trigger -> action workflows. monitors are agent tasks that interact with web, files, databases to capture and summarize data. triggers are agent tasks that take monitor data and evaluate if the data meets some criteria. actions take data and affect some outcome. requires a way to encode and visualize entities and workflows, dataflows and outcomes. could be OODA loop instead Observers - Orienters - Deciders - Actors.

* integration plugin api to support data access and triggers from sources like chat, github. should be tooling around api calls not MCP protocal support. 

* Integration commands and ability to arbitrarily permit workspaces. a library of built-in connection commands (Slack, GitHub issues, HTTP) invokable through the sandboxed tool loop. Look for external libraries and tooling to adopt.

* Commit/git-hook trigger (n8n) — fire a review flow when a workspaced agent commits, wiring into the existing hook machinery.

* Adjacent-tool feature mining — point an agent at a set of analogous tools (exactly this exercise: CrewAI/LangGraph/n8n) and get back a deduped, categorized idea list with source links.

* Feature gap matrix — an agent builds and maintains a you-vs-competitors comparison table across a feature set, pulled from public sources

## deferred
