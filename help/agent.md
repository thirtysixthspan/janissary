### agent

Run a task autonomously in a new agent session, with optional host, tab, group, workspace, skill, model, and effort settings.

**Usage**

`agent [on <host>] [in a tab] [in group <name|id>] [in workspace <label>] [with skill <name>]... [using model <id>] [with effort <level>] execute <task> [parameters...]`

**Use cases**

- Delegate a task to an agent without leaving the current tab.
- Choose a specific host, workspace, skill, model, or effort level for the task.

**Examples**

- `agent execute summarize the changed files` starts a task with the default settings.
- `agent with skill review execute inspect the patch` starts a task using the named skill.
- `agent with skill ask-user with skill perplexity-search execute build-a-feature.md` starts a task using both named skills.
