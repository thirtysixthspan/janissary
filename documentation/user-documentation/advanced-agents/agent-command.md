# Run an autonomous task

Use `agent` to run an AI task and wait for its final result:

```text
agent with skill ask-user using model google/gemini-3.1-flash-lite with effort medium execute research/find-bugs.md --area "command dispatch"
```

Launch options can appear in any order before `execute`. The task file comes from the current working directory's `ai/tasks/` first, then Janissary's installed tasks. Text after the task filename is passed to the task unchanged. The default model is the OpenCode model from the harness catalog, and the default effort is `medium`. The selected model must advertise the requested effort or the run reports `Agent: unsupported effort "<level>" for model "<model>".`.

<img class="agent-float" src="/agents/selim-south.png" alt="" />

Select a skill with `with skill <name>`. Its instructions are included with the task. A skill can grant whole Janissary commands through a `janissary.json` file beside `SKILL.md`:

```json
{"version":1,"commands":["question"]}
```

Only listed canonical command names are allowed. The agent asks to run one by ending a reply with `janissary <command>`. Questions require the `ask-user` skill and its `question` grant; the task waits until you answer or cancel.

The command returns `Status: completed`, `failed`, or `terminated`, followed by the task response. Cleanup issues appear on separate `Cleanup warning:` lines. Closing the caller tab terminates its run.

Use `on <host>` from a tab already connected to that remote host, or `in workspace <label>` to borrow another established remote workspace. The task and selected skills are resolved on that host. Janissary keeps command grants and tool commands on the local server. If the remote does not answer readiness or confirm close, the run fails or reports a cleanup warning rather than waiting indefinitely.

Add `in a tab` to open a read-only monitor while the task runs. It shows the launch command, model and effort, execution workspace, status, and reported activity. Select **Terminate** to stop that run. Closing the monitor only closes the view; the task continues, and you can still collect its result in the caller tab.
