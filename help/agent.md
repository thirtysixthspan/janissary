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

Without `using model`, the agent prefers `google/gemini-3.1-flash-lite` when enabled, then uses the first enabled OpenCode model. A disabled model cannot be selected; an explicit unknown or disabled model fails with `Agent: unknown model "<value>".`

**Notes**

- Every headed or headless run has a retained row in the connections tab, named `agent:<tab name>` after the tab that started it. The row's tooltip carries the run's title, `Agent: <task filename>`. Open that row for the run's connection tab, which takes the same `agent:<tab name>` title.
- The record tab's **Terminate** stops only that run and behaves like the monitor's Terminate. Closing an optional monitor only closes its view; the run continues.
- The record survives the caller and an application restart and opens read-only once the run has finished.
