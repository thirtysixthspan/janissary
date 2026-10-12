# Run an autonomous task

Use `agent` to run an AI task and wait for its final result:

```text
agent with skill ask-user using model google/gemini-3.1-flash-lite with effort medium execute research/find-bugs.md --area "command dispatch"
```

Launch options can appear in any order before `execute`. A local run creates a fresh workspace clone and looks for its task and selected skills there before falling back to Janissary's installed files. Files in your current directory are not copied into the new workspace or used for lookup. If you are already running in a Janissary-tracked workspace, the run uses that workspace and releases its own reference when it ends. Text after the task filename is passed to the task unchanged. The default model is the OpenCode model from the harness catalog, and the default effort is `medium`. The selected model must advertise the requested effort or the run reports `Agent: unsupported effort "<level>" for model "<model>".`.

<img class="agent-float" src="/agents/selim-south.png" alt="" />

Select a skill with `with skill <name>`. Its instructions are included with the task. A skill can grant whole Janissary commands through a `janissary.json` file beside `SKILL.md`:

```json
{"version":1,"commands":["question"]}
```

Only listed canonical command names are allowed. The agent asks to run one by ending a reply with `janissary <command>`. Questions require the `ask-user` skill and its `question` grant; the task waits until you answer or cancel.

The command returns `Status: completed`, `failed`, or `terminated`, followed by the task response. Cleanup issues appear on separate `Cleanup warning:` lines. Closing the caller tab terminates its run.

Your caller tab stays in its original directory; the agent's files and ACP session use the execution workspace. If the execution host cannot confine the agent because workspace sandboxing is disabled or unavailable, the notifications feed shows `Agent: sandboxing is disabled.`. For a remote run, this reflects the remote host's confinement state.

Use `on <[user@]host[:path]>` to run remotely from either a local or remote caller. Janissary reuses an established remote workspace only when the full SSH destination matches, including its user: `admin@devbox` and `devbox` are separate destinations. Otherwise, it connects over SSH and looks for your project from the remote login directory. Adding `:path` always selects that project path through a run-only connection, even if a workspace for the same destination is already open. Remote-only connections use non-interactive SSH authentication, so unavailable hosts fail the run rather than leaving it waiting for a password prompt. Use `in workspace <label>` without `on` to borrow another established remote workspace. The task and selected skills are resolved on the execution host. Janissary keeps command grants and tool commands on the original caller's machine. If the remote does not answer readiness or confirm close, the run fails or reports a cleanup warning rather than waiting indefinitely.

Add `in a tab` to open a read-only monitor while the task runs. It shows the launch command, model and effort, execution host and workspace, status, and reported activity. Local runs show `Local` and their execution workspace; remote runs show the remote host and workspace. Select **Terminate** to stop that run. Closing the monitor only closes the view; the task continues, and you can still collect its result in the caller tab.

Add `in group <name|id>` to place that monitor in an existing tab group. Names match without regard to case; numeric IDs select a group by number. A group that isn't open, or an invalid ID, fails before the task starts with `Agent: group "<selector>" does not exist.` This check also applies when the run is headless. Without a group selector, the monitor joins the caller's group.
